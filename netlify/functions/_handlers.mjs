/**
 * AI 핸들러 (서버 전용 순수 함수)
 * ────────────────────────────────────────────────────────────
 * - 각 핸들러는 요청 body(object)와 apiKey를 받아 결과 object를 반환한다.
 * - 입력은 클라이언트에서 1차 정제(키워드 프리필터·후보 압축 등)된 소량 데이터만 받아
 *   토큰 사용을 최소화한다.
 * - 모든 호출은 callGeminiJSON(다중 모델 폴백)을 거치며, 실제 사용된 모델 ID를
 *   결과에 `_model`로 실어 보낸다 → 클라이언트 '배터리' 표시에 사용.
 * - 실패 시 throw → 호출 측(함수/미들웨어)이 적절한 상태코드로 응답.
 */

import { callGeminiJSON, SEARCH_TOOL } from './_gemini.mjs';

const T = { STRING: 'STRING', ARRAY: 'ARRAY', OBJECT: 'OBJECT', INTEGER: 'INTEGER', BOOLEAN: 'BOOLEAN' };

/**
 * 웹 검색 그라운딩으로 "정확한" 작품 줄거리를 가져온다 (best-effort).
 * 작품명 + 공연장 + 공연기간으로 실제 공연을 특정해 동명이작 혼동을 방지한다.
 * 실패하면 빈 문자열을 반환해 호출 측이 우아하게 폴백하도록 한다.
 */
async function fetchGroundedPlot(apiKey, { title, genre, venue, period, synopsis }) {
  try {
    const system =
      '너는 공연 정보 조사원이다. Google 검색으로 아래 "이 공연"을 특정해 정확한 줄거리를 찾는다. ' +
      '작품명과 공연장·공연기간을 조합해 검색하고, 위키백과·나무위키·예매처(인터파크/NOL 티켓 등) 등 ' +
      '신뢰할 수 있는 출처를 참고한다. 제목만 같은 다른 작품과 혼동하지 않는다. ' +
      'KOPIS 줄거리가 있으면 교차 검증한다. 특정이 어려우면 지어내지 말고 plot은 빈 문자열로 둔다. ' +
      '학생 눈높이의 한국어로, 마크다운/코드펜스 없이 JSON 객체 하나만 출력한다: ' +
      '{"plot": "줄거리 4~6문장(불확실하면 빈 문자열)", "verified": true/false}';
    const user = JSON.stringify({
      이공연: { 제목: title, 장르: genre, 공연장: venue, 공연기간: period },
      KOPIS_줄거리: String(synopsis ?? '').slice(0, 700),
    });
    const { json } = await callGeminiJSON({
      apiKey, system, user, tools: SEARCH_TOOL, temperature: 0.3, maxOutputTokens: 1200,
    });
    return String(json?.plot ?? '').trim();
  } catch {
    return '';
  }
}

/* ============================================================
   1) 성취기준 재정렬/큐레이션 (수업 연계용)
   - 클라이언트가 키워드로 1차 추린 후보(최대 ~40개)만 전달
   - Gemini가 의미적 적합도로 상위 N개 선별 + 한 줄 근거 제공
   ============================================================ */
export async function rerankCurriculum(body, apiKey) {
  const performance = body?.performance ?? {};
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  const topN = Math.min(Math.max(Number(body?.topN) || 12, 1), 24);

  if (candidates.length === 0) return { selections: [], _model: null };

  const trimmed = candidates.slice(0, 40).map(c => ({
    id: String(c.id),
    g: c.grade ?? '',
    s: c.subject ?? '',
    t: String(c.content ?? '').slice(0, 80),
  }));

  const system =
    '너는 한국 교사를 돕는 교육과정 연계 전문가다. ' +
    '주어진 공연과 성취기준 후보 목록을 보고, 공연 관람을 수업으로 연결하기에 ' +
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
    type: T.OBJECT,
    properties: {
      selections: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: {
            id: { type: T.STRING },
            reason: { type: T.STRING },
            relevance: { type: T.INTEGER }, // 1~5
          },
          required: ['id', 'reason', 'relevance'],
        },
      },
    },
    required: ['selections'],
  };

  const { json, model } = await callGeminiJSON({
    apiKey, system, user, schema, temperature: 0.2, maxOutputTokens: 1200,
  });

  const valid = new Set(trimmed.map(c => c.id));
  const selections = (json?.selections ?? [])
    .filter(s => s && valid.has(String(s.id)))
    .slice(0, topN)
    .map(s => ({
      id: String(s.id),
      reason: String(s.reason ?? '').slice(0, 60),
      relevance: Math.min(Math.max(Number(s.relevance) || 3, 1), 5),
    }));

  return { selections, _model: model };
}

/* ============================================================
   2) 융합예술 수업 아이디어 생성
   - 공연을 중심에 두고, 연계 영화·도서를 엮은 '융합예술수업' 설계 초안
   ============================================================ */
export async function lessonIdeas(body, apiKey) {
  const performanceTitle = String(body?.performanceTitle ?? '').slice(0, 120);
  const genre = String(body?.genre ?? '').slice(0, 20);
  const synopsis = String(body?.synopsis ?? '').slice(0, 700);
  // 작품 기본 정보(주어진 사실만 사용 — 지어내지 않게 프롬프트로 지시)
  const runtime = String(body?.runtime ?? '').slice(0, 30);
  const rating = String(body?.rating ?? '').slice(0, 30);
  const venue = String(body?.venue ?? '').slice(0, 80);
  const price = String(body?.price ?? '').slice(0, 160);
  const period = String(body?.period ?? '').slice(0, 60);
  const child = typeof body?.child === 'boolean' ? body.child : undefined;
  const keywords = (Array.isArray(body?.keywords) ? body.keywords : [])
    .slice(0, 12).map(k => String(k).slice(0, 20));
  const standards = (Array.isArray(body?.standards) ? body.standards : [])
    .slice(0, 8)
    .map(s => ({
      id: String(s.id ?? ''),
      g: s.grade ?? '',
      sub: s.subject ?? '',
      t: String(s.content ?? '').slice(0, 100),
    }));
  const movies = (Array.isArray(body?.movies) ? body.movies : []).slice(0, 6).map(m => String(m).slice(0, 60));
  const books = (Array.isArray(body?.books) ? body.books : []).slice(0, 6).map(b => String(b).slice(0, 60));

  // ① 줄거리 확보: KOPIS 줄거리가 충분하면 추가 호출 없이 그대로 사용하고,
  //    비어 있거나 빈약할 때만 웹 검색 그라운딩을 1회 수행한다(AI 호출 절감).
  const synopsisLen = synopsis.replace(/\s/g, '').length;
  const groundedPlot = synopsisLen < 40
    ? await fetchGroundedPlot(apiKey, { title: performanceTitle, genre, venue, period, synopsis })
    : '';

  const system =
    '너는 한국 초·중·고 교사의 융합예술수업 설계를 돕는 교육 컨설턴트다. ' +
    '교사가 공연 관람을 의미 있는 수업으로 연결하도록, 아래 순서로 실질적인 종합 답변을 한국어로 작성한다.\n' +
    '① 작품 줄거리(plotSummary): 학생·교사가 작품을 이해하도록 줄거리와 핵심 내용을 4~6문장으로 친절하게 설명한다. ' +
    '제공된 "확인된줄거리"(웹 검색으로 검증된 내용)가 있으면 그것을 최우선 근거로 그대로 활용한다. ' +
    '없으면 "줄거리"(KOPIS)를 사용하고, 둘 다 비어 있거나 빈약하면 제목으로 식별되는 잘 알려진 작품(원작 동화·소설·' +
    '고전·유명 뮤지컬/연극 등)일 경우 너의 일반 지식을 활용해 대표적인 이야기 전개·주요 인물·핵심 메시지를 재구성한다. ' +
    '확신이 어렵거나 동명의 여러 작품이 있을 수 있으면 단정하지 말고 "제목·장르로 미루어 ~로 보입니다"처럼 신중하게 쓰고, ' +
    '이 경우 문장 끝에 "(실제 공연 내용과 다를 수 있으니 확인이 필요합니다)"를 덧붙인다. ' +
    '종교 포교·선정성·폭력성은 배제하고 학생 눈높이로 쓴다. plotSummary는 절대 비워 두지 않는다.\n' +
    '② 작품 기본 정보(workSummary): 장르·관람연령·러닝타임·공연기간·공연장·티켓 금액 등 "주어진 사실만" ' +
    '1~2문장으로 정리한다. ★없는 정보(가격·공연장 등)는 추측하거나 지어내지 말고 생략한다. ' +
    '(줄거리·작품 내용은 ①에서 다루므로, 여기서는 사실 정보 위주로 간결하게.)\n' +
    '③ 학습 가치(learningValue): 이 작품을 통해 학생이 무엇을 배울 수 있는지(교과 지식·핵심역량·정서·태도·진로 등)를 ' +
    '구체적 항목으로 종합 제시한다.\n' +
    '④ 융합 수업 설계: 공연을 중심에 두고 연계 영화·도서를 매체로 엮어 하나의 흐름이 있는 수업' +
    '(공연 감상 → 매체 연계 → 표현·창작 활동)을 설계한다. 성취기준의 학년 수준에 맞춰 난이도를 조정하고, ' +
    '한국 교실에서 바로 적용 가능하게 쓴다. 영화·도서는 공연 주제를 확장·심화하는 연결고리로 구체적으로 활용한다.\n' +
    '모든 내용은 과장 없이 신뢰성 있게 작성한다.';

  const user = JSON.stringify({
    중심공연: performanceTitle,
    기본정보: { 장르: genre, 관람연령: rating, 러닝타임: runtime, 공연기간: period, 아동관람가: child },
    공연장: venue,
    티켓금액: price,
    확인된줄거리: groundedPlot,
    줄거리: synopsis,
    키워드: keywords,
    성취기준: standards,
    연계영화: movies,
    연계도서: books,
  });

  const schema = {
    type: T.OBJECT,
    properties: {
      title: { type: T.STRING },                 // 수업 제목
      plotSummary: { type: T.STRING },           // ① 작품 줄거리·핵심 내용 (KOPIS 없으면 AI 지식 기반)
      workSummary: { type: T.STRING },           // ② 작품 기본 정보(사실) 요약
      learningValue: { type: T.ARRAY, items: { type: T.STRING } }, // ③ 이 작품으로 가능한 학습(종합)
      overview: { type: T.STRING },              // 수업 개요(2~3문장)
      convergenceFocus: { type: T.STRING },      // 공연·영화·도서를 잇는 융합 포인트
      objectives: { type: T.ARRAY, items: { type: T.STRING } },
      activities: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: {
            title: { type: T.STRING },
            description: { type: T.STRING },
            duration: { type: T.STRING },
            linkedMedia: { type: T.STRING },      // 이 활동에서 활용하는 영화/도서/공연
          },
          required: ['title', 'description'],
        },
      },
      discussionQuestions: { type: T.ARRAY, items: { type: T.STRING } },
      assessment: { type: T.STRING },
    },
    required: ['plotSummary', 'overview', 'objectives', 'activities', 'discussionQuestions'],
  };

  const { json, model } = await callGeminiJSON({
    apiKey, system, user, schema, temperature: 0.6, maxOutputTokens: 4096,
  });

  const arr = (a, n) => (a ?? []).map(String).map(s => s.trim()).filter(Boolean).slice(0, n);
  return {
    title: json?.title ? String(json.title) : undefined,
    // 웹 검색으로 검증된 줄거리가 있으면 그것을 우선 사용
    plotSummary: groundedPlot || (json?.plotSummary ? String(json.plotSummary) : undefined),
    workSummary: json?.workSummary ? String(json.workSummary) : undefined,
    learningValue: arr(json?.learningValue, 8),
    overview: String(json?.overview ?? ''),
    convergenceFocus: json?.convergenceFocus ? String(json.convergenceFocus) : undefined,
    objectives: (json?.objectives ?? []).map(String).slice(0, 6),
    activities: (json?.activities ?? []).slice(0, 6).map(a => ({
      title: String(a?.title ?? ''),
      description: String(a?.description ?? ''),
      duration: a?.duration ? String(a.duration) : undefined,
      linkedMedia: a?.linkedMedia ? String(a.linkedMedia) : undefined,
    })),
    discussionQuestions: (json?.discussionQuestions ?? []).map(String).slice(0, 8),
    assessment: json?.assessment ? String(json.assessment) : undefined,
    _model: model,
  };
}

/* ============================================================
   3) 작품 상세 소개 (AI)
   - KOPIS 줄거리를 바탕으로 학생 눈높이의 풍부한 작품 소개 생성
   ============================================================ */
export async function introducePerformance(body, apiKey) {
  const title = String(body?.title ?? '').slice(0, 120);
  const genre = String(body?.genre ?? '').slice(0, 20);
  const synopsis = String(body?.synopsis ?? '').slice(0, 900);
  const venue = String(body?.venue ?? '').slice(0, 80);
  const period = String(body?.period ?? '').slice(0, 60);
  const cast = (Array.isArray(body?.cast) ? body.cast : []).slice(0, 8).map(c => String(c).slice(0, 40));

  // ── 그라운딩(웹 검색) 기반: 동명이작 혼동·환각을 막기 위해 실제 공연을 특정해 검색 ──
  const system =
    '너는 공연을 교육적으로 소개하는 해설가다. 반드시 Google 검색 도구로 아래 "이 공연"을 먼저 특정한 뒤 답한다.\n' +
    '검색 전략: 작품명과 함께 공연장·공연기간·출연진을 조합해 검색하고(예: "작품명 공연장 2025"), ' +
    '위키백과·나무위키·예매처(인터파크 티켓·NOL 티켓·예스24 등) 등 신뢰할 수 있는 출처에서 ' +
    '"바로 그 공연/원작"의 정보를 확인한다. 제목만 같은 다른 작품(동명이작)과 절대 혼동하지 않는다.\n' +
    'summary에는 검색으로 확인한 줄거리·핵심 내용을 3~5문장으로 정확히 쓴다. ' +
    'KOPIS가 제공한 "줄거리"가 있으면 교차 검증에 활용한다. ' +
    '검색으로도 작품을 특정하기 어렵거나 정보가 상충하면, 지어내지 말고 그 사실을 밝히고 ' +
    '확인 가능한 범위(장르·공연장·기간 등)만 신중하게 소개한다.\n' +
    '사실(가격·출연진 등)은 추측하지 않는다. 종교 포교성·선정성·폭력성은 배제하고 초·중·고 학생 눈높이로 쓴다. ' +
    '출력은 모두 한국어로 하며, 다른 설명·마크다운·코드펜스 없이 아래 JSON 객체 "하나만" 출력한다:\n' +
    '{"summary": "작품 소개 3~5문장", "themes": ["핵심 주제"], "watchPoints": ["관람 포인트"], ' +
    '"educationalValue": "교육적 의의", "discussionStarters": ["관람 후 이야깃거리"], ' +
    '"verified": true/false (검색으로 작품을 특정·확인했으면 true), "sourceNote": "참고한 출처/근거 간단히"}';

  const user = JSON.stringify({
    이공연: { 제목: title, 장르: genre, 공연장: venue, 공연기간: period, 출연진: cast },
    KOPIS_줄거리: synopsis,
  });

  // 그라운딩 시 responseSchema 사용 불가 → 프롬프트로 JSON 유도 + 폴백 파서로 추출
  const { json, model } = await callGeminiJSON({
    apiKey, system, user, tools: SEARCH_TOOL, temperature: 0.3, maxOutputTokens: 1600,
  });

  const arr = (a, n) => (a ?? []).map(String).map(s => s.trim()).filter(Boolean).slice(0, n);
  return {
    summary: String(json?.summary ?? ''),
    themes: arr(json?.themes, 8),
    watchPoints: arr(json?.watchPoints, 6),
    educationalValue: json?.educationalValue ? String(json.educationalValue) : undefined,
    discussionStarters: arr(json?.discussionStarters, 6),
    verified: typeof json?.verified === 'boolean' ? json.verified : undefined,
    sourceNote: json?.sourceNote ? String(json.sourceNote).slice(0, 200) : undefined,
    _model: model,
  };
}

/* ============================================================
   4) 영화·도서 추천 큐레이션 (정확도 개선의 핵심)
   - 클라이언트가 기본 검색(TMDB/네이버)으로 모은 후보를 전달
   - Gemini가 공연과 교육적으로 연관된 것만 선별·랭킹 + 근거 제공
   - 더 나은 결과를 찾기 위한 정밀 검색어(추가 쿼리)도 함께 제안
   ============================================================ */
export async function curateMedia(body, apiKey) {
  const performance = body?.performance ?? {};
  const keywords = (Array.isArray(performance.keywords) ? performance.keywords : [])
    .slice(0, 12).map(k => String(k).slice(0, 20));
  const movies = (Array.isArray(body?.movies) ? body.movies : []).slice(0, 24).map(m => ({
    id: String(m.id),
    t: String(m.title ?? '').slice(0, 60),
    o: String(m.overview ?? '').slice(0, 160),
  }));
  const books = (Array.isArray(body?.books) ? body.books : []).slice(0, 24).map(b => ({
    isbn: String(b.isbn),
    t: String(b.title ?? '').slice(0, 60),
    o: String(b.description ?? '').slice(0, 160),
  }));

  const system =
    '너는 공연 연계 수업 자료를 큐레이션하는 사서·영화 교사다. ' +
    '먼저 주어진 "공연"의 줄거리·장르·키워드·관람연령을 근거로 작품의 핵심 주제·정서·소재·' +
    '학습 개념을 깊이 파악한다. (제목의 표면 단어가 아니라 작품의 "내용"을 이해한다.) ' +
    '줄거리가 비어 있으면 제목으로 식별되는 잘 알려진 작품의 일반 지식을 활용해 내용을 추정한다. ' +
    '파악한 핵심 주제는 themes에 3~6개의 짧은 구로 적는다. ' +
    '그 이해를 바탕으로, 후보 목록에서 작품 "내용"과 교육적으로 연결되는 영화·도서를 골라 랭킹한다. ' +
    '연관성은 주제·정서·소재·메시지의 일치를 기준으로 하며, 단순히 제목 단어가 겹치는 것은 배제한다. ' +
    '학생에게 부적합하거나 무관한 후보는 제외한다. 근거(reason)는 공연 "내용"과의 연결점을 ' +
    '한국어 한 문장(40자 이내)으로 쓴다. 반드시 후보의 id/isbn만 사용한다. ' +
    '★중요: 어떤 공연이든 내용·주제 면에서 연결되는 영화·도서는 반드시 존재한다. ' +
    '후보가 비어 있거나 빈약하더라도, 작품의 주제·정서·소재·대상연령에 맞는 작품을 ' +
    '한국 도서관·극장에서 찾을 수 있도록 movieQueries와 bookQueries를 "각각 반드시 4~6개씩" 제안한다(절대 빈 배열 금지). ' +
    '검색어는 제목을 그대로 쓰지 말고 작품의 내용·주제를 드러내는 구체적 2~5어절 구로 쓴다 ' +
    '(예: "우정으로 성장하는 아이들", "환경을 지키는 모험 이야기", "가족의 화해를 다룬 동화"). ' +
    '너무 일반적인 한 단어(음악, 이야기, 사랑 등)는 피한다. ' +
    '도서 검색어는 그림책·동화·청소년 도서 등 학생 눈높이를 고려한다.';

  const user = JSON.stringify({
    공연: {
      제목: performance.title ?? '',
      장르: performance.genre ?? '',
      관람연령: performance.rating ?? '',
      줄거리: String(performance.synopsis ?? '').slice(0, 600),
      키워드: keywords,
    },
    영화후보: movies,
    도서후보: books,
  });

  const schema = {
    type: T.OBJECT,
    properties: {
      themes: { type: T.ARRAY, items: { type: T.STRING } },  // 작품 핵심 주제(내용 이해 근거)
      movieSelections: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: { id: { type: T.STRING }, reason: { type: T.STRING } },
          required: ['id', 'reason'],
        },
      },
      bookSelections: {
        type: T.ARRAY,
        items: {
          type: T.OBJECT,
          properties: { isbn: { type: T.STRING }, reason: { type: T.STRING } },
          required: ['isbn', 'reason'],
        },
      },
      movieQueries: { type: T.ARRAY, items: { type: T.STRING } },
      bookQueries: { type: T.ARRAY, items: { type: T.STRING } },
    },
    required: ['movieSelections', 'bookSelections', 'movieQueries', 'bookQueries'],
  };

  const { json, model } = await callGeminiJSON({
    apiKey, system, user, schema, temperature: 0.3, maxOutputTokens: 1800,
  });

  const validMovie = new Set(movies.map(m => m.id));
  const validBook = new Set(books.map(b => b.isbn));
  const arr = (a, n) => [...new Set((a ?? []).map(s => String(s).trim()).filter(Boolean))].slice(0, n);

  return {
    themes: arr(json?.themes, 6),
    movieSelections: (json?.movieSelections ?? [])
      .filter(s => s && validMovie.has(String(s.id)))
      .slice(0, 12)
      .map(s => ({ id: String(s.id), reason: String(s.reason ?? '').slice(0, 60) })),
    bookSelections: (json?.bookSelections ?? [])
      .filter(s => s && validBook.has(String(s.isbn)))
      .slice(0, 12)
      .map(s => ({ isbn: String(s.isbn), reason: String(s.reason ?? '').slice(0, 60) })),
    movieQueries: arr(json?.movieQueries, 6),
    bookQueries: arr(json?.bookQueries, 6),
    _model: model,
  };
}

/* ============================================================
   5) 통합 큐레이션 (성취기준 + 영화 + 도서를 한 번의 호출로)
   - 웹 검색 그라운딩으로 작품의 원작/배경을 먼저 특정(예: 오즈→오즈의 마법사)
   - 그 이해를 바탕으로 성취기준·영화·도서 후보를 동시에 선별·랭킹
   - 후보에 없는 원작·핵심 연관작은 정밀 검색어(movieQueries/bookQueries)로 보강
   - 그라운딩 사용 → responseSchema 불가 → 프롬프트로 JSON 유도 + 방어적 파싱
   ============================================================ */
export async function curateAll(body, apiKey) {
  const performance = body?.performance ?? {};
  const title = String(performance.title ?? '').slice(0, 120);
  const genre = String(performance.genre ?? '').slice(0, 20);
  const synopsis = String(performance.synopsis ?? '').slice(0, 700);
  const rating = String(performance.rating ?? '').slice(0, 30);
  const venue = String(performance.venue ?? '').slice(0, 80);
  const period = String(performance.period ?? '').slice(0, 60);
  const keywords = (Array.isArray(performance.keywords) ? performance.keywords : [])
    .slice(0, 12).map(k => String(k).slice(0, 20));

  const curriculum = (Array.isArray(body?.curriculum) ? body.curriculum : []).slice(0, 40).map(c => ({
    id: String(c.id),
    g: String(c.grade ?? '').slice(0, 20),
    s: String(c.subject ?? '').slice(0, 12),
    t: String(c.content ?? '').slice(0, 80),
  }));
  const movies = (Array.isArray(body?.movies) ? body.movies : []).slice(0, 24).map(m => ({
    id: String(m.id),
    t: String(m.title ?? '').slice(0, 60),
    o: String(m.overview ?? '').slice(0, 140),
  }));
  const books = (Array.isArray(body?.books) ? body.books : []).slice(0, 24).map(b => ({
    isbn: String(b.isbn),
    t: String(b.title ?? '').slice(0, 60),
    o: String(b.description ?? '').slice(0, 140),
  }));

  const system =
    '너는 한국 교사를 돕는 "공연 연계 수업 큐레이터"다. 아래 절차를 따라 한 번에 큐레이션한다.\n\n' +
    '[1단계 — 작품 특정] 반드시 Google 검색으로 "이 공연"을 먼저 특정한다. 작품명과 공연장·공연기간을 ' +
    '조합해 검색하고(동명이작 혼동 금지), 원작·원전(소설·동화·영화·설화 등)이 있으면 그 정체를 정확히 파악한다. ' +
    '예: 뮤지컬 "오즈"는 라이먼 프랭크 바움의 동화 "오즈의 마법사"를 모티브로 한다. ' +
    '특정한 원작/배경은 sourceWork에 적는다(없거나 불확실하면 빈 문자열).\n\n' +
    '[2단계 — 주제 파악] 줄거리·원작·장르·키워드를 근거로 작품의 핵심 주제·정서·소재를 themes에 3~6개의 ' +
    '짧은 구로 적는다. (제목 표면 단어가 아니라 작품의 "내용"을 이해한다.)\n\n' +
    '[3단계 — 성취기준] 성취기준 후보 목록에서 작품 주제와 의미적으로 연결되는 것을 선별·랭킹한다. ' +
    '단순 단어 일치가 아니라 주제·정서·가치의 연관으로 판단하고, 특정 학년군에 치우치지 않게 다양하게 고른다. ' +
    '각 항목은 {id, reason(40자 이내 한국어), relevance(1~5 정수)}. 반드시 후보에 있는 id만 사용한다.\n\n' +
    '[4단계 — 영화·도서] 영화/도서 후보에서 작품 "내용"과 교육적으로 연결되는 것만 골라 {id|isbn, reason(40자 이내)}로 ' +
    '랭킹한다. 단순 제목 겹침·무관·학생 부적합 후보는 제외한다.\n\n' +
    '[5단계 — 보강 검색어] 후보 목록에 원작이나 핵심 연관작이 없을 수 있다. 한국 도서관·극장에서 찾을 수 있도록 ' +
    'movieQueries·bookQueries를 각각 반드시 4~6개씩 제안한다(절대 빈 배열 금지). ' +
    '★중요: 원작/원전이 있으면 그 제목을 반드시 첫 번째 검색어로 넣는다(예: "오즈의 마법사"). ' +
    '나머지는 작품의 주제·소재를 드러내는 구체적 2~5어절 구로 쓰고("우정으로 성장하는 아이들" 등), ' +
    '너무 일반적인 한 단어(음악, 이야기, 사랑 등)는 피한다. 도서 검색어는 그림책·동화·청소년 도서 등 학생 눈높이를 고려한다.\n\n' +
    '다른 설명·마크다운·코드펜스 없이 아래 JSON 객체 "하나만" 출력한다:\n' +
    '{"sourceWork":"원작/배경 또는 빈 문자열","themes":["..."],' +
    '"curriculum":[{"id":"...","reason":"...","relevance":4}],' +
    '"movies":[{"id":"...","reason":"..."}],"books":[{"isbn":"...","reason":"..."}],' +
    '"movieQueries":["..."],"bookQueries":["..."],"verified":true}';

  const user = JSON.stringify({
    이공연: { 제목: title, 장르: genre, 관람연령: rating, 공연장: venue, 공연기간: period, 줄거리: synopsis, 키워드: keywords },
    성취기준후보: curriculum,
    영화후보: movies,
    도서후보: books,
  });

  // 그라운딩 시 responseSchema 사용 불가 → 프롬프트로 JSON 유도 + 폴백 파서로 추출
  const { json, model } = await callGeminiJSON({
    apiKey, system, user, tools: SEARCH_TOOL, temperature: 0.3, maxOutputTokens: 2800,
  });

  const validCur = new Set(curriculum.map(c => c.id));
  const validMovie = new Set(movies.map(m => m.id));
  const validBook = new Set(books.map(b => b.isbn));
  const arr = (a, n) => [...new Set((a ?? []).map(s => String(s).trim()).filter(Boolean))].slice(0, n);
  const clampRel = v => Math.min(5, Math.max(1, Math.round(Number(v) || 3)));

  return {
    sourceWork: json?.sourceWork ? String(json.sourceWork).slice(0, 120) : '',
    themes: arr(json?.themes, 6),
    curriculumSelections: (json?.curriculum ?? [])
      .filter(s => s && validCur.has(String(s.id)))
      .slice(0, 14)
      .map(s => ({ id: String(s.id), reason: String(s.reason ?? '').slice(0, 60), relevance: clampRel(s.relevance) })),
    movieSelections: (json?.movies ?? [])
      .filter(s => s && validMovie.has(String(s.id)))
      .slice(0, 12)
      .map(s => ({ id: String(s.id), reason: String(s.reason ?? '').slice(0, 60) })),
    bookSelections: (json?.books ?? [])
      .filter(s => s && validBook.has(String(s.isbn)))
      .slice(0, 12)
      .map(s => ({ isbn: String(s.isbn), reason: String(s.reason ?? '').slice(0, 60) })),
    movieQueries: arr(json?.movieQueries, 6),
    bookQueries: arr(json?.bookQueries, 6),
    verified: typeof json?.verified === 'boolean' ? json.verified : undefined,
    _model: model,
  };
}

/* 라우팅 테이블 (이름 → 핸들러) */
export const HANDLERS = {
  'curriculum-rerank': rerankCurriculum,
  'lesson-ideas': lessonIdeas,
  'introduce-performance': introducePerformance,
  'curate-media': curateMedia,
  'curate-all': curateAll,
};
