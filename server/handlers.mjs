/**
 * AI 핸들러 (서버 전용 순수 함수)
 * - 각 핸들러는 요청 body(object)와 apiKey를 받아 결과 object를 반환한다.
 * - 입력은 클라이언트에서 1차 정제(키워드 프리필터 등)된 소량 데이터만 받아
 *   토큰 사용을 최소화한다.
 * - 실패 시 throw → 호출 측(함수/미들웨어)이 적절한 상태코드로 응답.
 */

import { callGeminiJSON } from './gemini.mjs';

const SCHEMA_TYPE = { STRING: 'STRING', ARRAY: 'ARRAY', OBJECT: 'OBJECT', INTEGER: 'INTEGER' };

/* ============================================================
   1) 성취기준 재정렬/큐레이션 (Phase 1)
   - 클라이언트가 키워드로 1차 추린 후보(최대 ~40개)만 전달
   - Gemini가 의미적 적합도로 상위 N개 선별 + 한 줄 근거 제공
   ============================================================ */
export async function rerankCurriculum(body, apiKey) {
  const performance = body?.performance ?? {};
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  const topN = Math.min(Math.max(Number(body?.topN) || 12, 1), 24);

  if (candidates.length === 0) return { selections: [] };

  // 후보를 최대 40개로 제한(토큰 통제), 본문은 압축해 전달
  const trimmed = candidates.slice(0, 40).map(c => ({
    id: String(c.id),
    g: c.grade ?? '',
    s: c.subject ?? '',
    t: String(c.content ?? '').slice(0, 80),
  }));

  const system =
    '너는 한국 교사를 돕는 교육과정 연계 전문가다. ' +
    '주어진 공연과 성취기준 후보 목록을 보고, 공연 관람 후 수업으로 연결하기에 ' +
    '의미적으로 가장 적합한 성취기준을 선별한다. 단순 단어 일치가 아니라 주제·정서·' +
    '핵심 가치의 연관성을 기준으로 판단한다. 특정 학년군에 치우치지 않게 다양하게 고른다. ' +
    '근거(reason)는 한국어 한 문장(40자 이내)으로 간결하게 쓴다. ' +
    '반드시 후보 목록에 존재하는 id만 사용한다.';

  const user = JSON.stringify({
    공연: {
      제목: performance.title ?? '',
      장르: performance.genre ?? '',
      줄거리: String(performance.synopsis ?? '').slice(0, 600),
      키워드: (performance.keywords ?? []).slice(0, 12),
    },
    후보: trimmed,
    상위개수: topN,
  });

  const schema = {
    type: SCHEMA_TYPE.OBJECT,
    properties: {
      selections: {
        type: SCHEMA_TYPE.ARRAY,
        items: {
          type: SCHEMA_TYPE.OBJECT,
          properties: {
            id: { type: SCHEMA_TYPE.STRING },
            reason: { type: SCHEMA_TYPE.STRING },
            relevance: { type: SCHEMA_TYPE.INTEGER }, // 1~5
          },
          required: ['id', 'reason', 'relevance'],
        },
      },
    },
    required: ['selections'],
  };

  const result = await callGeminiJSON({
    apiKey,
    system,
    user,
    schema,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });

  // 방어적 정규화 + 후보 id 화이트리스트 검증
  const valid = new Set(trimmed.map(c => c.id));
  const selections = (result?.selections ?? [])
    .filter(s => s && valid.has(String(s.id)))
    .slice(0, topN)
    .map(s => ({
      id: String(s.id),
      reason: String(s.reason ?? '').slice(0, 60),
      relevance: Math.min(Math.max(Number(s.relevance) || 3, 1), 5),
    }));

  return { selections };
}

/* ============================================================
   2) 수업 아이디어 생성 (Phase 2)
   - 인사이트 바구니의 공연 + 성취기준 + 연계자료를 묶어
     수업 설계 초안을 생성
   ============================================================ */
export async function lessonIdeas(body, apiKey) {
  const performanceTitle = String(body?.performanceTitle ?? '').slice(0, 120);
  const genre = String(body?.genre ?? '').slice(0, 20);
  const standards = (Array.isArray(body?.standards) ? body.standards : [])
    .slice(0, 8)
    .map(s => ({
      id: String(s.id ?? ''),
      g: s.grade ?? '',
      sub: s.subject ?? '',
      t: String(s.content ?? '').slice(0, 100),
    }));
  const extras = (Array.isArray(body?.extras) ? body.extras : [])
    .slice(0, 10)
    .map(e => ({ type: e.type, title: String(e.title ?? '').slice(0, 60) }));

  const system =
    '너는 한국 초·중·고 교사의 수업 설계를 돕는 교육 컨설턴트다. ' +
    '공연 관람을 교육과정 성취기준과 연계한 구체적이고 실행 가능한 수업 아이디어를 제안한다. ' +
    '제시된 성취기준의 학년 수준에 맞춰 활동 난이도를 조정하고, 한국 교실 현실에서 ' +
    '바로 적용 가능하게 쓴다. 모든 내용은 한국어로 작성한다. 과장 없이 신뢰성 있게 쓴다.';

  const user = JSON.stringify({
    공연: performanceTitle,
    장르: genre,
    성취기준: standards,
    연계자료: extras,
  });

  const schema = {
    type: SCHEMA_TYPE.OBJECT,
    properties: {
      overview: { type: SCHEMA_TYPE.STRING },        // 수업 개요(2~3문장)
      gradeBand: { type: SCHEMA_TYPE.STRING },        // 권장 학년군
      objectives: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } },
      activities: {
        type: SCHEMA_TYPE.ARRAY,
        items: {
          type: SCHEMA_TYPE.OBJECT,
          properties: {
            title: { type: SCHEMA_TYPE.STRING },
            description: { type: SCHEMA_TYPE.STRING },
            duration: { type: SCHEMA_TYPE.STRING },
          },
          required: ['title', 'description'],
        },
      },
      discussionQuestions: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } },
      assessment: { type: SCHEMA_TYPE.STRING },
    },
    required: ['overview', 'objectives', 'activities', 'discussionQuestions'],
  };

  const result = await callGeminiJSON({
    apiKey,
    system,
    user,
    schema,
    temperature: 0.6,
    maxOutputTokens: 2048,
  });

  return {
    overview: String(result?.overview ?? ''),
    gradeBand: String(result?.gradeBand ?? ''),
    objectives: (result?.objectives ?? []).map(String).slice(0, 6),
    activities: (result?.activities ?? []).slice(0, 6).map(a => ({
      title: String(a?.title ?? ''),
      description: String(a?.description ?? ''),
      duration: a?.duration ? String(a.duration) : undefined,
    })),
    discussionQuestions: (result?.discussionQuestions ?? []).map(String).slice(0, 8),
    assessment: result?.assessment ? String(result.assessment) : undefined,
  };
}

/* ============================================================
   3) 공연 의미 보강 (Phase 3)
   - 시놉시스에서 주제/정서 키워드 + 검색어 생성
   - 이미 연결된 TMDB/Naver 검색을 더 정확하게 구동하기 위한 1회 호출
   ============================================================ */
export async function enrichPerformance(body, apiKey) {
  const title = String(body?.title ?? '').slice(0, 120);
  const genre = String(body?.genre ?? '').slice(0, 20);
  const synopsis = String(body?.synopsis ?? '').slice(0, 800);

  const system =
    '너는 공연 콘텐츠를 분석해 교육 연계 검색을 돕는 큐레이터다. ' +
    '주어진 공연의 핵심 주제·정서·가치를 뽑고, 이를 영화/도서 검색에 적합한 ' +
    '구체적 검색어로 변환한다. 검색어는 너무 일반적인 단어(예: 음악, 이야기)를 피하고 ' +
    '작품 주제를 잘 드러내는 2~4어절 구를 사용한다. 종교 포교성 콘텐츠는 배제한다. ' +
    '모든 출력은 한국어. 초·중·고 학생에게 적합한 것만 고른다.';

  const user = JSON.stringify({ 제목: title, 장르: genre, 줄거리: synopsis });

  const schema = {
    type: SCHEMA_TYPE.OBJECT,
    properties: {
      themes: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } },          // 주제어
      curriculumKeywords: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } }, // 성취기준 매칭용
      movieQueries: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } },      // 영화 검색어
      bookQueries: { type: SCHEMA_TYPE.ARRAY, items: { type: SCHEMA_TYPE.STRING } },       // 도서 검색어
    },
    required: ['themes', 'curriculumKeywords', 'movieQueries', 'bookQueries'],
  };

  const result = await callGeminiJSON({
    apiKey,
    system,
    user,
    schema,
    temperature: 0.4,
    maxOutputTokens: 800,
  });

  const clean = (arr, n) => [...new Set((arr ?? []).map(s => String(s).trim()).filter(Boolean))].slice(0, n);
  return {
    themes: clean(result?.themes, 8),
    curriculumKeywords: clean(result?.curriculumKeywords, 12),
    movieQueries: clean(result?.movieQueries, 6),
    bookQueries: clean(result?.bookQueries, 6),
  };
}

/* 라우팅 테이블 (이름 → 핸들러) */
export const HANDLERS = {
  'curriculum-rerank': rerankCurriculum,
  'lesson-ideas': lessonIdeas,
  'enrich-performance': enrichPerformance,
};
