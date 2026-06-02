/**
 * Gemini 호출 공용 모듈 (서버 전용)
 * - 개발 환경(Vite 미들웨어)과 운영 환경(Netlify Functions)에서 공유한다.
 * - API 키는 서버에서만 사용하며 절대 클라이언트로 노출하지 않는다.
 *
 * 토큰 효율 원칙:
 *  - 무료 티어 모델(gemini-2.5-flash-lite) 사용
 *  - responseSchema(구조화 출력)로 불필요한 출력 토큰 제거
 *  - maxOutputTokens 상한으로 출력 비용 통제
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// 무료 티어에서 사용 가능한 경량 모델 (저비용·고속)
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

export class GeminiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/**
 * Gemini generateContent 호출 (구조화 JSON 출력)
 * @returns {Promise<any>} 파싱된 JSON 객체
 */
export async function callGeminiJSON({
  apiKey,
  model = DEFAULT_MODEL,
  system,
  user,
  schema,
  temperature = 0.3,
  maxOutputTokens = 1024,
}) {
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY가 설정되지 않았습니다.', 503);
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature,
      maxOutputTokens,
      // 응답 토큰 절약: 생각 과정 비활성화 (flash-lite 기본 비활성)
      ...(schema ? { responseSchema: schema } : {}),
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new GeminiError(`Gemini 연결 실패: ${err?.message ?? err}`, 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 429(쿼터 초과) 포함 — 클라이언트는 폴백으로 전환
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
    // 혹시 코드펜스가 섞여 오는 경우 방어적으로 추출
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fallthrough */ }
    }
    throw new GeminiError('Gemini 응답을 JSON으로 파싱하지 못했습니다.', 502);
  }
}
