/**
 * Gemini 호출 공용 모듈 (서버 전용)
 * ────────────────────────────────────────────────────────────
 * - 개발 환경(Vite 미들웨어)과 운영 환경(Netlify Functions)에서 공유한다.
 * - API 키는 서버에서만 사용하며 절대 클라이언트로 노출하지 않는다.
 *
 * ◆ 핵심: "다중 모델 폴백(Fallback) 시스템"
 *   무료 티어의 분당/일일 요청 한도(429 Too Many Requests / RESOURCE_EXHAUSTED)에
 *   걸리면 웹앱이 멈추지 않도록, 우선순위가 낮은 다른 무료 모델로 자동 재시도한다.
 *
 * ◆ 토큰 효율 원칙
 *   - 무료 티어 모델만 사용
 *   - responseSchema(구조화 출력)로 불필요한 출력 토큰 제거
 *   - maxOutputTokens 상한으로 출력 비용 통제
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * 모델 우선순위 체인 (앞에서부터 시도)
 *  1순위: gemini-2.5-flash        — 품질 우선
 *  2순위: gemini-3.1-flash-lite   — 1순위 한도 초과 시
 *  3순위: gemini-2.5-flash-lite   — 최종 폴백
 * 모두 무료 티어에서 호출 가능한 모델이다.
 */
export const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

// 하위 호환용 기본 모델 (체인의 1순위)
export const DEFAULT_MODEL = MODEL_CHAIN[0];

export class GeminiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * 해당 HTTP 상태코드가 "다음 모델로 폴백할 가치가 있는" 오류인지 판단한다.
 *  - 429: 요청 한도/할당량 초과 (Rate Limit) → 다른 모델로 전환
 *  - 500/503: 서버 과부하/일시 오류 → 다른 모델로 전환
 *  - 403/404: 해당 모델 사용 불가/미존재 → 다른 모델로 전환
 *  - 400/401: 요청 형식 오류·인증 실패 → 모델을 바꿔도 동일하게 실패하므로 즉시 중단
 */
function isFallbackWorthy(status) {
  return status === 429 || status === 500 || status === 503 || status === 403 || status === 404;
}

/**
 * 단일 모델로 generateContent를 1회 호출한다 (내부 함수).
 * 성공 시 파싱된 JSON 객체를 반환하고, 실패 시 GeminiError를 throw 한다.
 */
async function callOnce({ apiKey, model, system, user, schema, temperature, maxOutputTokens }) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
      maxOutputTokens,
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // 네트워크 자체 실패 → 폴백 가치가 있다고 보고 502로 표시
    throw new GeminiError(`Gemini 연결 실패: ${err?.message ?? err}`, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiError(`Gemini 응답 오류 (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ?? '';
  if (!text.trim()) {
    throw new GeminiError('Gemini가 빈 응답을 반환했습니다.', 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    // 코드펜스 등이 섞여 오는 경우 방어적으로 JSON 블록만 추출
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fallthrough */ }
    }
    throw new GeminiError('Gemini 응답을 JSON으로 파싱하지 못했습니다.', 502);
  }
}

/**
 * ★ 재사용 가능한 폴백 래퍼 (generateContentWithFallback)
 * ────────────────────────────────────────────────────────────
 * 모델 우선순위 체인을 순서대로 시도한다.
 *  1) 1순위 모델 호출 → 성공하면 즉시 결과 반환
 *  2) 한도 초과(429) 등 폴백 가치가 있는 오류면 콘솔 경고 후 다음 모델로 재시도
 *  3) 형식/인증 오류(400/401)는 즉시 중단(모델을 바꿔도 실패)
 *  4) 모든 모델이 실패하면 마지막 오류를 throw → 호출 측이 사용자에게 안내
 *
 * @returns {Promise<{ json:any, model:string }>}
 *          json  : 파싱된 결과 객체
 *          model : 실제로 성공한 모델 ID (UI '배터리' 표시에 사용)
 */
export async function callGeminiJSON({
  apiKey,
  models = MODEL_CHAIN,
  system,
  user,
  schema,
  temperature = 0.3,
  maxOutputTokens = 1024,
}) {
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY가 설정되지 않았습니다.', 503);
  }

  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const json = await callOnce({ apiKey, model, system, user, schema, temperature, maxOutputTokens });
      // 폴백이 발생했다면(첫 모델이 아니면) 로그로 남겨 추적 가능하게 한다.
      if (i > 0) {
        console.info(`[Gemini] 폴백 성공: '${model}' 사용 (우선순위 ${i + 1}위)`);
      }
      return { json, model };
    } catch (err) {
      lastError = err;
      const status = err instanceof GeminiError ? err.status : 500;

      // 폴백할 가치가 없는 오류(400/401)는 즉시 중단
      if (!isFallbackWorthy(status)) {
        console.warn(`[Gemini] '${model}' 호출 중단 (status ${status}): ${err.message}`);
        break;
      }

      // 다음 모델이 남아 있으면 경고 후 재시도
      if (i < models.length - 1) {
        console.warn(
          `[Gemini] '${model}' 한도/오류(status ${status}) → 다음 모델 '${models[i + 1]}'(으)로 폴백합니다.`,
        );
        continue;
      }

      // 마지막 모델까지 실패
      console.error(`[Gemini] 모든 모델 실패. 마지막 오류(status ${status}): ${err.message}`);
    }
  }

  // 모든 모델 실패 → 사용자에게 전달할 안정적인 오류
  throw new GeminiError(
    `모든 AI 모델 호출에 실패했습니다. (마지막 오류: ${lastError?.message ?? '알 수 없음'})`,
    lastError instanceof GeminiError ? lastError.status : 502,
  );
}
