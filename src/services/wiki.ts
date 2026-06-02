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

/**
 * 위키 검색 결과 제목이 실제로 "그 작품"과 관련 있는지 검증한다.
 * ────────────────────────────────────────────────────────────
 * 위키백과 전문(全文) 검색은 본문에 검색어 일부가 포함된 엉뚱한 문서를
 * 최상위로 돌려줄 수 있다. 예) "이상한 나라의 숨바꼭질"(뮤지컬)을 검색하면
 * 줄거리에 "숨바꼭질 같은 사랑"이 있는 드라마 "보고싶다"가 매칭된다.
 * → 작품명과 문서명이 제목 차원에서 겹치는지(부분 포함 또는 토큰 공유) 확인해
 *   무관한 동음 매칭을 차단한다.
 */
function isPlausibleTitleMatch(query: string, found: string): boolean {
  const norm = (s: string) => s.replace(/[\s·:|,~()[\]<>《》〈〉【】]/g, '');
  const q = norm(query);
  const f = norm(found);
  if (!q || !f) return false;
  // 한쪽이 다른 쪽을 포함하면 동일 작품으로 본다 (예: "오즈" ⊂ "오즈의 마법사")
  if (f.includes(q) || q.includes(f)) return true;
  // 의미 있는 토큰(2자 이상)을 하나라도 공유하면 관련 작품으로 본다
  const qTokens = new Set(query.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []);
  const fTokens = found.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
  return fTokens.some(t => qTokens.has(t));
}

/** 검색으로 후보 문서 제목들을 가져온다(상위 N개). */
async function searchTitles(query: string, limit = 5): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query,
    srlimit: String(limit), format: 'json', origin: '*',
  });
  const res = await fetch(`${ACTION}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data?.query?.search ?? [])
    .map((s: { title?: string }) => s.title ?? '')
    .filter(Boolean);
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
 * 1) (장르 힌트를 더해) 검색한 뒤, 제목이 작품명과 관련 있는 후보만 채택하고
 * 2) 그 문서의 요약을 반환한다. 무관한 동음 문서는 채택하지 않는다(오개념 차단).
 *
 * @param genre  공연 장르(예: "뮤지컬"). 검색 정확도를 높이는 힌트로 사용한다.
 */
export async function fetchWikiSummary(rawTitle: string, genre?: string): Promise<WikiSummary | null> {
  const title = cleanWorkTitle(rawTitle);
  if (!title) return null;
  try {
    // 장르를 더한 검색 → 순수 제목 검색 순으로 시도(동명이작 혼동 완화)
    const queries = genre ? [`${title} ${genre}`, title] : [title];
    for (const q of queries) {
      const candidates = await searchTitles(q, 5);
      const best = candidates.find(c => isPlausibleTitleMatch(title, c));
      if (best) {
        const summary = await fetchSummaryByTitle(best);
        if (summary) return summary;
      }
    }
    // 제목 직접 조회: 단, 반환된 문서 제목이 작품명과 관련 있을 때만 채택
    const direct = await fetchSummaryByTitle(title);
    if (direct && isPlausibleTitleMatch(title, direct.title)) return direct;
    return null;
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
