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
 * 전체 시간 예산(ms) — Netlify 동기 함수 기본 실행 한도(10초)보다 낮게 잡아,
 * 함수가 강제 종료(opaque 504)되기 전에 우리가 우아하게 결과/오류를 반환하도록 한다.
 * 더 긴 타임아웃을 쓰는 플랜이면 환경변수 AI_DEADLINE_MS로 올릴 수 있다(예: 24000).
 */
const DEFAULT_DEADLINE_MS =
  (typeof process !== 'undefined' && Number(process.env?.AI_DEADLINE_MS)) || 9000;

/**
 * 기본 모델 우선순위 체인 (앞에서부터 시도) — 2026년 6월 기준
 *  1순위: gemini-3.1-flash-lite  — 무료 티어 일일 호출 한도가 가장 높음(최우선)
 *  2순위: gemini-3.5-flash       — 신형 Flash(품질)
 *  3순위: gemini-3-flash-preview — Gemini 3 Flash(프리뷰)
 *  4순위: gemini-2.5-flash       — 검증된 안정 모델(폴백)
 *  5순위: gemini-2.5-flash-lite  — 검증된 안정 경량 모델(최종 폴백)
 * 모든 모델 thinkingBudget=0으로 '사고(thinking)' 토큰을 꺼서
 * 전체 출력 토큰(maxOutputTokens)을 본문에 사용하도록 한다(아래 callOnce 참고).
 *
 * ⚠ 3.x 계열(특히 -preview)은 제공사가 쿼터/이름을 자주 조정하거나 폐기할 수 있다
 *   (예: 'gemini-3.1-flash-lite-preview'는 2026-05-25 종료). 그래서 검증된 2.5 계열을
 *   하단 폴백으로 반드시 남겨 두고, 아래 2단계 복구 장치로 이름 변경에 대응한다.
 *
 * ★ 모델명 변경/폐기/차단 대응 (제공사 정책으로 이름이 바뀌어도 멈추지 않게)
 *   1) 환경변수 GEMINI_MODELS(쉼표 구분)로 코드 수정/재배포 없이 체인을 교체할 수 있다.
 *      예) GEMINI_MODELS="gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite"
 *   2) 그래도 모델을 못 찾으면(404/모델 없음) 런타임에 ListModels API로
 *      "지금 계정에서 실제로 쓸 수 있는" 텍스트 생성 모델을 자동 탐색해 체인에 덧붙인다.
 *      → 하드코딩된 이름이 바뀌어도 살아있는 카탈로그에서 대체 모델을 찾아 복구한다.
 */
const DEFAULT_MODEL_CHAIN = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

/** 환경변수 오버라이드를 파싱한다(쉼표 구분, 공백 제거). 없으면 기본 체인. */
function parseEnvModels() {
  const raw = (typeof process !== 'undefined' && process.env && process.env.GEMINI_MODELS) || '';
  const list = raw.split(',').map(s => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_MODEL_CHAIN;
}

export const MODEL_CHAIN = parseEnvModels();

// 하위 호환용 기본 모델 (체인의 1순위)
export const DEFAULT_MODEL = MODEL_CHAIN[0];

/**
 * 살아있는 모델 카탈로그 탐색 (ListModels) — 결과를 프로세스 수명 동안 캐시.
 * ────────────────────────────────────────────────────────────
 * generateContent를 지원하는 텍스트 생성 모델만 추려, 품질·안정성 우선으로 정렬한다.
 *  - 이미지/임베딩/음성(tts)/실험 전용 등 텍스트 JSON 생성에 부적합한 모델은 제외.
 *  - 'flash'(품질) → 'flash-lite'(경량) → 그 외 순으로, 최신 버전·안정판 우선.
 * 네트워크/권한 문제로 실패하면 빈 배열을 돌려주어 기존 체인만으로 진행한다.
 */
let _discoveredCache = null; // { at:number, models:string[] }
const DISCOVERY_TTL_MS = 10 * 60 * 1000;

function rankModelName(name) {
  // 점수가 낮을수록 우선. 무료 티어 운영 철학에 맞춰
  // "flash-lite(무료 한도 최대) > flash > 그 외", 안정판·최신 버전 우대.
  let score = 0;
  if (/flash/.test(name)) score -= 100;
  if (/lite/.test(name)) score -= 40;   // 경량 모델이 무료 일일 한도가 가장 높음 → 우선
  if (/pro/.test(name)) score += 60;     // Pro는 유료 전환 → 후순위
  if (/(exp|preview)/.test(name)) score += 15; // 프리뷰/실험은 불안정 → 살짝 후순위
  // 버전 숫자가 클수록(최신) 우대
  const ver = parseFloat((name.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0');
  score -= ver;
  return score;
}

export async function discoverGenerateContentModels(apiKey, timeoutMs = 2500) {
  if (!apiKey) return [];
  if (_discoveredCache && Date.now() - _discoveredCache.at < DISCOVERY_TTL_MS) {
    return _discoveredCache.models;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(800, timeoutMs));
    let res;
    try {
      res = await fetch(`${API_BASE}?key=${apiKey}&pageSize=200`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [];
    const data = await res.json();
    const models = (Array.isArray(data?.models) ? data.models : [])
      .filter(m => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
      .map(m => String(m?.name ?? '').replace(/^models\//, ''))
      // gemini 계열의 텍스트 생성 모델만 — 이미지/임베딩/음성/응답형 전용 제외
      .filter(n => /^gemini/.test(n) && !/(embedding|image|imagen|vision|tts|audio|aqa|learnlm)/i.test(n))
      .sort((a, b) => rankModelName(a) - rankModelName(b));
    _discoveredCache = { at: Date.now(), models };
    return models;
  } catch {
    return [];
  }
}

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
 *  - 504: 호출당 타임아웃(주로 느린 그라운딩) → 더 빠른 다음 시도(비그라운딩)로 전환
 *  - 400/401: 요청 형식 오류·인증 실패 → 모델을 바꿔도 동일하게 실패하므로 즉시 중단
 */
function isFallbackWorthy(status) {
  return status === 429 || status === 500 || status === 502 || status === 503
    || status === 403 || status === 404 || status === 504;
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
async function callOnce({ apiKey, model, system, user, schema, temperature, maxOutputTokens, thinkingBudget = 0, tools = null, timeoutMs = 8000 }) {
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

  // 호출당 타임아웃: 멈춘/느린 호출이 함수 전체 실행 한도까지 매달려
  // Netlify가 강제 종료(opaque 504)하는 것을 막는다. 초과 시 504로 폴백 유도.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  let res;
  try {
    res = await fetch(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new GeminiError(`Gemini 호출 시간 초과(${timeoutMs}ms)`, 504);
    }
    // 네트워크 자체 실패 → 폴백 가치가 있다고 보고 502로 표시
    throw new GeminiError(`Gemini 연결 실패: ${err?.message ?? err}`, 502);
  } finally {
    clearTimeout(timer);
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
  deadlineMs = DEFAULT_DEADLINE_MS,
}) {
  if (!apiKey) {
    throw new GeminiError('GEMINI_API_KEY가 설정되지 않았습니다.', 503);
  }

  const start = Date.now();
  const remaining = () => deadlineMs - (Date.now() - start);
  const MIN_ATTEMPT_MS = 1500; // 남은 예산이 이보다 적으면 새 시도를 시작하지 않는다

  const grounded = Array.isArray(tools) && tools.length > 0;

  // ★ 시도 계획
  //  - 그라운딩 핸들러: Google 검색은 느려 504/502를 유발하므로, 1순위 모델에서만
  //    "그라운딩 1회"를 시도하고 실패하면 즉시 "비그라운딩" 체인으로 강등한다.
  //    (정확도보다 응답 보장을 우선 — 비그라운딩도 프롬프트로 충분히 좋은 결과를 낸다.)
  //  - 비그라운딩 핸들러: 기존처럼 모델 체인을 순서대로 시도한다.
  const queue = grounded
    ? [{ model: models[0], grounded: true }, ...models.map(m => ({ model: m, grounded: false }))]
    : models.map(m => ({ model: m, grounded: false }));

  let lastError = null;
  let discovered = false; // ListModels 자동 탐색을 1회만 수행하기 위한 가드

  for (let i = 0; i < queue.length; i++) {
    const rem = remaining();
    if (rem < MIN_ATTEMPT_MS) {
      console.warn(`[Gemini] 시간 예산 소진(${rem}ms 남음) — 추가 시도 중단`);
      break;
    }

    const { model, grounded: attemptGrounded } = queue[i];
    // 그라운딩(웹 검색 포함)은 더 넉넉히, 비그라운딩은 짧게 — 남은 예산으로 상한을 둔다.
    const cap = attemptGrounded ? 6500 : 4500;
    const timeoutMs = Math.max(1000, Math.min(cap, rem - 500));

    try {
      const json = await callOnce({
        apiKey, model, system, user,
        // 그라운딩 시 responseSchema 사용 불가 → 비그라운딩 폴백에서만 스키마 적용
        schema: attemptGrounded ? undefined : schema,
        temperature, maxOutputTokens, thinkingBudget,
        tools: attemptGrounded ? tools : null,
        timeoutMs,
      });
      if (i > 0) {
        console.info(`[Gemini] 폴백 성공: '${model}'${attemptGrounded ? ' (그라운딩)' : ' (비그라운딩)'} 사용 (시도 ${i + 1}번째)`);
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

      // ★ 모델을 못 찾는 오류(404 등)는 "이름이 바뀌었거나 폐기됐을" 가능성이 높다.
      //   살아있는 카탈로그(ListModels)에서 실제 사용 가능한 모델을 1회 탐색해 대기열에 덧붙인다.
      //   (남은 예산이 충분할 때만 — 탐색 자체도 시간을 쓰므로.)
      if (status === 404 && !discovered && remaining() > 3000) {
        discovered = true;
        const live = await discoverGenerateContentModels(apiKey, Math.min(2500, remaining() - 500));
        const have = new Set(queue.map(q => q.model));
        const added = live.filter(m => !have.has(m)).map(m => ({ model: m, grounded: false }));
        if (added.length) {
          queue.push(...added);
          console.warn(`[Gemini] 모델 미존재(404) → 카탈로그에서 대체 모델 ${added.length}개 자동 보강: ${added.slice(0, 5).map(a => a.model).join(', ')}…`);
        }
      }

      // 다음 시도가 남아 있고 예산이 있으면 경고 후 재시도
      if (i < queue.length - 1 && remaining() >= MIN_ATTEMPT_MS) {
        const next = queue[i + 1];
        console.warn(
          `[Gemini] '${model}' 오류(status ${status}) → 다음 시도 '${next.model}'${next.grounded ? ' (그라운딩)' : ' (비그라운딩)'}(으)로 폴백합니다.`,
        );
        continue;
      }

      // 마지막 시도까지 실패
      console.error(`[Gemini] 모든 시도 실패. 마지막 오류(status ${status}): ${err.message}`);
    }
  }

  // 모든 시도 실패 → 사용자에게 전달할 안정적인 오류
  throw new GeminiError(
    `모든 AI 모델 호출에 실패했습니다. (마지막 오류: ${lastError?.message ?? '알 수 없음'})`,
    lastError instanceof GeminiError ? lastError.status : 502,
  );
}
