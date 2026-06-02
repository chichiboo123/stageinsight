/**
 * 위키백과(한국어) 요약 조회 서비스
 * ────────────────────────────────────────────────────────────
 * - AI 호출 없이 작품 정보를 보여주기 위한 무료 소스.
 * - REST Summary / Action API 모두 CORS(origin=*)를 허용하므로 브라우저에서 직접 호출한다.
 * - 나무위키는 스크래핑이 차단되어 있어 '바로가기 링크'만 제공한다.
 */

export interface WikiSummary {
  title: string;
  extract: string;
  thumbnail?: string;
  url: string;
}

const REST = 'https://ko.wikipedia.org/api/rest_v1/page/summary/';
const ACTION = 'https://ko.wikipedia.org/w/api.php';

/**
 * 공연 제목 정규화 — 위키백과/나무위키 검색 정확도를 높인다.
 * KOPIS 제목에는 흔히 지역·극장·회차 주석이 붙는다.
 *   예) "오지게 재밌는 가시나들 [서울]" · "지킬앤하이드 (대구)" · "캣츠 〈내한공연〉"
 * 이런 괄호류 주석과 흔한 공연 접미사를 제거해 "순수 작품명"으로 검색되게 한다.
 */
export function cleanWorkTitle(raw: string): string {
  let t = String(raw ?? '');
  // 1) 짝이 맞는 괄호 주석 제거: [ ] ( ) （ ） 【 】 〈 〉 《 》
  t = t.replace(/[[(（【〈《][^[\]()（）【】〈〉《》]*[)\]）】〉》]/g, ' ');
  // 2) 짝이 없는 여는 괄호부터 끝까지 제거 (잘린 지역명 등)
  t = t.replace(/[[(（【〈《].*$/g, ' ');
  // 3) 흔한 공연 접미사 제거 (작품명 자체가 아닌 회차/형식 표기)
  t = t.replace(/\s*[-–~]\s*(앵콜|앙코르|재공연|내한공연|오리지널\s*내한|콘서트|시즌\s*\d+).*$/g, ' ');
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** 검색으로 가장 적합한 문서 제목을 찾는다(동음이의 보정). */
async function findBestTitle(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query,
    srlimit: '1', format: 'json', origin: '*',
  });
  const res = await fetch(`${ACTION}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.query?.search?.[0]?.title ?? null;
}

async function fetchSummaryByTitle(title: string): Promise<WikiSummary | null> {
  const res = await fetch(REST + encodeURIComponent(title), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.type === 'disambiguation' || !data.extract) return null;
  return {
    title: data.title ?? title,
    extract: data.extract,
    thumbnail: data.thumbnail?.source,
    url: data.content_urls?.desktop?.page ?? `https://ko.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

/**
 * 작품명으로 위키백과 요약을 가져온다.
 * 1) 검색으로 정확한 문서명을 찾고 2) 그 문서의 요약을 반환한다.
 * 실패 시 제목 직접 조회를 한 번 더 시도한다.
 */
export async function fetchWikiSummary(rawTitle: string): Promise<WikiSummary | null> {
  const title = cleanWorkTitle(rawTitle);
  if (!title) return null;
  try {
    const best = await findBestTitle(title);
    if (best) {
      const summary = await fetchSummaryByTitle(best);
      if (summary) return summary;
    }
    return await fetchSummaryByTitle(title);
  } catch {
    return null;
  }
}

/** 나무위키 검색/문서 바로가기 URL (지역·회차 주석 제거한 작품명으로) */
export function namuwikiUrl(title: string): string {
  return `https://namu.wiki/w/${encodeURIComponent(cleanWorkTitle(title))}`;
}

/** 위키백과 검색 바로가기 URL (지역·회차 주석 제거한 작품명으로) */
export function wikipediaSearchUrl(title: string): string {
  return `https://ko.wikipedia.org/w/index.php?search=${encodeURIComponent(cleanWorkTitle(title))}`;
}
