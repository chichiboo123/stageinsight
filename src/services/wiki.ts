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
  const title = rawTitle.trim();
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

/** 나무위키 검색/문서 바로가기 URL */
export function namuwikiUrl(title: string): string {
  return `https://namu.wiki/w/${encodeURIComponent(title.trim())}`;
}

/** 위키백과 검색 바로가기 URL */
export function wikipediaSearchUrl(title: string): string {
  return `https://ko.wikipedia.org/w/index.php?search=${encodeURIComponent(title.trim())}`;
}
