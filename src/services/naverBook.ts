/**
 * 네이버 도서 검색 API 서비스
 * 문서: https://developers.naver.com/docs/serviceapi/search/book/book.md
 *
 * 환경 변수:
 *   VITE_NAVER_CLIENT_ID=your_client_id
 *   VITE_NAVER_CLIENT_SECRET=your_client_secret
 *
 * ⚠ CORS 이슈: 클라이언트 직접 호출 시 CORS 오류 발생.
 *   실제 배포 시 백엔드 프록시 또는 Vercel Edge Function 등을 거쳐 호출 필요.
 *   개발 환경에서는 vite.config.ts의 proxy 설정 활용.
 */

import type { Book } from '../types';

const PROXY_BASE = '/api/naver'; // vite proxy → https://openapi.naver.com
const CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.VITE_NAVER_CLIENT_SECRET as string;

interface NaverBookItem {
  title: string;
  link: string;
  image: string;
  author: string;
  discount?: string;
  publisher: string;
  pubdate: string;
  isbn: string;
  description: string;
}

interface NaverBookResponse {
  total: number;
  start: number;
  display: number;
  items: NaverBookItem[];
}

function mapNaverBook(item: NaverBookItem): Book {
  // 네이버 API는 HTML 태그 포함 가능 → 제거
  const clean = (s: string) => s.replace(/<[^>]+>/g, '').trim();
  return {
    isbn: item.isbn,
    title: clean(item.title),
    author: clean(item.author),
    publisher: clean(item.publisher),
    pubdate: item.pubdate,
    description: clean(item.description),
    image: item.image || undefined,
    link: item.link,
    price: item.discount ? parseInt(item.discount) : undefined,
  };
}

// ---------- 종교 콘텐츠 필터 ----------
const RELIGIOUS_KEYWORDS = [
  '종교', '신앙', '신격', '신성', '신학', '교리', '경전', '예배', '기도', '찬양',
  '성지', '성물', '구원', '천국', '지옥', '영혼', '영적', '영성', '교회', '성당',
  '사원', '성전', '수도원', '성직자', '목사', '신부', '수녀', '스님', '승려', '교황',
  '주교', '미사', '법회', '설교', '찬송', '선교', '포교', '기독교', '천주교',
  '개신교', '불교', '이슬람', '힌두교', '유대교',
];


// ---------- 도서 검색 ----------
export async function searchBooks(query: string, display = 10): Promise<Book[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    query,
    display: String(display),
    sort: 'sim',
  });

  const res = await fetch(`${PROXY_BASE}/v1/search/book.json?${params}`, {
    headers: {
      'X-Naver-Client-Id': CLIENT_ID,
      'X-Naver-Client-Secret': CLIENT_SECRET,
    },
  });

  if (!res.ok) throw new Error(`네이버 도서 검색 실패: ${res.statusText}`);

  const data: NaverBookResponse = await res.json();
  return data.items.map(mapNaverBook);
}

// ---------- 공연 연계 도서 추천 ----------
export async function recommendBooksForPerformance(
  performanceTitle: string,
  keywords: string[] = [],
): Promise<Book[]> {
  const queries = [performanceTitle, ...keywords].slice(0, 4);

  const results = await Promise.allSettled(
    queries.map(q => searchBooks(q, 10))
  );

  const seen = new Set<string>();
  const merged: Book[] = [];

  for (const res of results) {
    if (res.status === 'fulfilled') {
      for (const book of res.value) {
        if (!seen.has(book.isbn)) {
          seen.add(book.isbn);
          merged.push(book);
        }
      }
    }
  }

  // 종교 관련 도서 제외
  return merged.filter(book => {
    const text = `${book.title} ${book.description} ${book.author} ${book.publisher}`.toLowerCase();
    return !RELIGIOUS_KEYWORDS.some(kw => text.includes(kw));
  }).slice(0, 20);
}
