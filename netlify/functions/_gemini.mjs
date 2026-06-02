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
 *  1순위: gemini-2.5-flash       — 품질 우선(무료 티어)
 *  2순위: gemini-2.5-flash-lite  — 1순위 한도 초과 시 폴백(무료 티어)
 * 두 모델 모두 thinkingBudget=0으로 '사고(thinking)' 토큰을 꺼서
 * 전체 출력 토큰(maxOutputTokens)을 본문에 사용하도록 한다(아래 callOnce 참고).
 *
 * ⚠ 과거 체인의 'gemini-3.1-flash-lite'는 텍스트 생성 모델이 아니라
 *   이미지 생성 계열 명칭이어서 404를 유발했다 → 제거.
 */
export const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// 하위 호환용 기본 모델 (체인의 1순위)
export const DEFAULT_MODEL = MODEL_CHAIN[0];

/**
 * Google 검색 그라운딩 도구.
 * 이 도구를 켜면 모델이 실제 웹(위키백과·나무위키·예매처 등)을 검색해
 * 사실에 근거한 답을 생성한다 → 동명이작 혼동·환각을 크게 줄인다.
 * ⚠ Gemini 2.5에서는 responseSchema(구조화 출력)와 동시 사용할 수 없다.
 */
export const SEARCH_TOOL = [{ google_search: {} }];

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
 *  - 500/502/503: 서버 과부하·게이트웨이·일시 오류 → 다른 모델로 전환
 *    (502는 연결 실패·빈 응답·JSON 파싱 실패 등 우리 내부 오류 표기에도 쓰이며,
 *     다른 모델은 정상 JSON을 줄 수 있으므로 반드시 폴백 대상에 포함한다.)
 *  - 403/404: 해당 모델 사용 불가/미존재 → 다른 모델로 전환
 *  - 400/401: 요청 형식 오류·인증 실패 → 모델을 바꿔도 동일하게 실패하므로 즉시 중단
 */
function isFallbackWorthy(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 403 || status === 404;
}

/**
 * 모델 세대에 맞는 thinkingConfig를 만든다.
 * ────────────────────────────────────────────────────────────
 * ★ 502의 핵심 원인 차단:
 *   Gemini 2.5/3 Flash 계열은 '사고(thinking)'가 기본 활성화되어 있고,
 *   사고 토큰이 maxOutputTokens 예산을 함께 소모한다. responseSchema(JSON 구조화)
 *   응답에서 사고가 예산을 잠식하면 본문이 잘리거나(빈 응답/MAX_TOKENS) 비어,
 *   "JSON으로 파싱하지 못했습니다" 오류로 모든 모델이 실패해 502가 난다.
 *   → 구조화 출력에는 사고가 필수가 아니므로 기본적으로 끈다(전체 예산을 본문에 사용).
 *
 *  - Gemini 2.x : thinkingBudget(정수). 0이면 사고 비활성.
 *  - Gemini 3.x+: thinkingLevel(문자열). thinkingBudget과 동시 전송 시 400이므로 분기.
 */
function thinkingConfigFor(model, budget = 0) {
  const isGen3Plus = /gemini-(?:[3-9]|\d{2,})/.test(model);
  if (isGen3Plus) {
    return { thinkingLevel: budget > 0 ? 'low' : 'minimal' };
  }
  return { thinkingBudget: Math.max(0, Number(budget) || 0) };
}

/**
 * 단일 모델로 generateContent를 1회 호출한다 (내부 함수).
 * 성공 시 파싱된 JSON 객체를 반환하고, 실패 시 GeminiError를 throw 한다.
 */
async function callOnce({ apiKey, model, system, user, schema, temperature, maxOutputTokens, thinkingBudget = 0, tools = null }) {
  const grounded = Array.isArray(tools) && tools.length > 0;
  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      // ★ 사고 토큰이 출력 예산을 잠식해 JSON이 잘리는 문제(502) 예방
      thinkingConfig: thinkingConfigFor(model, thinkingBudget),
      // ⚠ google_search 그라운딩과 responseSchema(구조화 출력)는 Gemini 2.5에서
      //   동시 사용 불가 → 그라운딩 시에는 스키마/JSON MIME을 빼고 프롬프트로 JSON을 유도한다.
      ...(grounded ? {} : {
        responseMimeType: 'application/json',
        ...(schema ? { responseSchema: schema } : {}),
      }),
    },
  };
  if (grounded) body.tools = tools;
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
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text).join('') ?? '';
  const finishReason = candidate?.finishReason;
  if (!text.trim()) {
    const why = finishReason === 'MAX_TOKENS'
      ? '출력 토큰 한도(MAX_TOKENS)에 도달해 본문이 비었습니다.'
      : `빈 응답(finishReason=${finishReason ?? '알수없음'}).`;
    throw new GeminiError(`Gemini가 빈 응답을 반환했습니다. ${why}`, 502);
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
    const hint = finishReason === 'MAX_TOKENS' ? ' (출력이 MAX_TOKENS로 잘렸습니다 — maxOutputTokens를 늘리세요)' : '';
    throw new GeminiError(`Gemini 응답을 JSON으로 파싱하지 못했습니다.${hint}`, 502);
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
  thinkingBudget = 0,
  tools = null,
}) {
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY가 설정되지 않았습니다.', 503);
  }

  let lastError = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const json = await callOnce({ apiKey, model, system, user, schema, temperature, maxOutputTokens, thinkingBudget, tools });
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
