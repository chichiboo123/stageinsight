/**
 * KOPIS (공연예술통합전산망) API 서비스
 * 문서: https://www.kopis.or.kr/por/main/openApiUseSrch.do
 *
 * 환경 변수:
 *   VITE_KOPIS_KEY=your_service_key
 */

import type { Performance, PerformanceGenre, PerformanceState, Venue } from '../types';

const BASE_URL = '/api/kopis';
const API_KEY = import.meta.env.VITE_KOPIS_KEY as string;

// ---------- 장르 코드 맵핑 ----------
const GENRE_CODE_MAP: Record<string, PerformanceGenre> = {
  AAAA: '연극',
  BBBC: '뮤지컬',
  BBBD: '오페라',
  BBBE: '서커스/마술',
  CCCA: '클래식',
  CCCC: '국악',
  CCCE: '무용',
  EEEA: '복합',
};

// ---------- 공연 상태 맵핑 ----------
function mapState(prfstate: string): PerformanceState {
  if (prfstate === '공연중') return '공연중';
  if (prfstate === '공연예정') return '공연예정';
  return '공연완료';
}

// ---------- 공연장 목록 조회 ----------
// KOPIS는 공연장 ID(fcltyCd)를 기반으로 공연 조회
export async function fetchPerformancesByVenue(
  venueName: string,
  dateFrom?: string,  // YYYYMMDD
  dateTo?: string,
): Promise<Performance[]> {
  // 현재 공연 중인 항목도 포함하려면 stdate를 과거로 설정
  // (공연이 수개월 전에 시작해서 현재 진행 중인 경우도 포함)
  const threeMonthsAgo = formatDate(addMonths(new Date(), -3));
  const threeMonthsLater = formatDate(addMonths(new Date(), 3));

  const params = new URLSearchParams({
    service: API_KEY,
    stdate: dateFrom ?? threeMonthsAgo,
    eddate: dateTo ?? threeMonthsLater,
    shprfnmfct: venueName,     // 공연시설명 검색
    rows: '50',
    cpage: '1',
    // prfstate는 쉼표 구분자 미지원 — 제거 후 날짜 범위로 필터링
  });

  const res = await fetch(`${BASE_URL}/pblprfr?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연 조회 실패: ${res.statusText}`);

  const xml = await res.text();
  const all = parsePerformanceListXml(xml);

  // 공연완료 제외, 공연중 → 공연예정 순으로 정렬
  return all
    .filter(p => p.state !== '공연완료')
    .sort((a, b) => {
      const order: Record<string, number> = { '공연중': 0, '공연예정': 1 };
      return (order[a.state] ?? 2) - (order[b.state] ?? 2);
    });
}

// ---------- 공연 상세 조회 ----------
export async function fetchPerformanceDetail(mtId: string): Promise<Performance | null> {
  const params = new URLSearchParams({ service: API_KEY });
  const res = await fetch(`${BASE_URL}/pblprfr/${mtId}?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연 상세 조회 실패: ${res.statusText}`);

  const xml = await res.text();
  const items = parsePerformanceDetailXml(xml);
  return items[0] ?? null;
}

// ---------- 공연명으로 검색 ----------
export async function fetchPerformancesByName(
  name: string,
  rows = 20,
): Promise<Performance[]> {
  if (!name.trim()) return [];
  const threeMonthsAgo = formatDate(addMonths(new Date(), -3));
  const threeMonthsLater = formatDate(addMonths(new Date(), 3));

  const params = new URLSearchParams({
    service: API_KEY,
    stdate: threeMonthsAgo,
    eddate: threeMonthsLater,
    shprfnm: name,        // 공연명 검색
    rows: String(rows),
    cpage: '1',
  });

  const res = await fetch(`${BASE_URL}/pblprfr?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연명 검색 실패: ${res.statusText}`);

  const xml = await res.text();
  return parsePerformanceListXml(xml);
}

// ---------- 공연장 정보 조회 ----------
export async function fetchVenueDetail(fcltyCd: string): Promise<Partial<Venue>> {
  const params = new URLSearchParams({ service: API_KEY });
  const res = await fetch(`${BASE_URL}/prfplc/${fcltyCd}?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연장 상세 조회 실패: ${res.statusText}`);

  const xml = await res.text();
  return parseVenueXml(xml);
}

// ---------- XML 파서 유틸 ----------

// XML/HTML 엔티티 디코딩 (&amp; → & 등)
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// CDATA 섹션 추출: <![CDATA[...]]> → 내부 텍스트
function extractCDATA(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

// HTML 태그 제거 (sty 태그에 <p>, <img> 포함되는 경우)
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function getTagContent(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  if (!match) return '';
  // 순서: 엔티티 디코딩 → CDATA 추출 → (sty의 경우 stripHtml은 호출부에서 처리)
  return extractCDATA(decodeEntities(match[1].trim()));
}

function getAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

function parsePerformanceListXml(xml: string): Performance[] {
  const dbs = getAllTags(xml, 'db');
  return dbs.map(db => {
    const genreCd = getTagContent(db, 'genrenm');
    return {
      id: getTagContent(db, 'mt20id'),
      title: getTagContent(db, 'prfnm'),
      venue: getTagContent(db, 'fcltynm'),
      venueId: getTagContent(db, 'mt10id'),
      genre: (GENRE_CODE_MAP[genreCd] ?? genreCd) as PerformanceGenre,
      state: mapState(getTagContent(db, 'prfstate')),
      startDate: getTagContent(db, 'prfpdfrom'),
      endDate: getTagContent(db, 'prfpdto'),
      poster: getTagContent(db, 'poster') || undefined,
      rating: getTagContent(db, 'prfage') || undefined,
      keywords: [],
    };
  });
}

function parsePerformanceDetailXml(xml: string): Performance[] {
  const dbs = getAllTags(xml, 'db');
  return dbs.map(db => {
    const genreCd = getTagContent(db, 'genrenm');
    const castRaw = getTagContent(db, 'prfcast');
    const crewRaw = getTagContent(db, 'prfcrew');

    // styurls > styurl (공연 소개 이미지)
    const styurlsMatch = /<styurls>([\s\S]*?)<\/styurls>/.exec(db);
    const images = styurlsMatch
      ? getAllTags(styurlsMatch[1], 'styurl').map(u => u.trim()).filter(Boolean)
      : [];

    // relates > relate (관련 동영상)
    const relatesMatch = /<relates>([\s\S]*?)<\/relates>/.exec(db);
    const relates: Array<{ name: string; url: string }> = [];
    if (relatesMatch) {
      for (const r of getAllTags(relatesMatch[1], 'relate')) {
        const name = getTagContent(r, 'relatenm').trim();
        const url  = getTagContent(r, 'relateurl').trim();
        if (url) relates.push({ name, url });
      }
    }

    return {
      id: getTagContent(db, 'mt20id'),
      title: getTagContent(db, 'prfnm'),
      venue: getTagContent(db, 'fcltynm'),
      venueId: getTagContent(db, 'mt10id'),
      genre: (GENRE_CODE_MAP[genreCd] ?? genreCd) as PerformanceGenre,
      state: mapState(getTagContent(db, 'prfstate')),
      startDate: getTagContent(db, 'prfpdfrom'),
      endDate: getTagContent(db, 'prfpdto'),
      poster: getTagContent(db, 'poster') || undefined,
      runtime: getTagContent(db, 'prfruntime') || undefined,
      rating: getTagContent(db, 'prfage') || undefined,
      price: getTagContent(db, 'pcseguidance') || undefined,
      synopsis: stripHtml(getTagContent(db, 'sty')) || undefined,
      cast: castRaw ? castRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      crew: crewRaw ? crewRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      images: images.length > 0 ? images : undefined,
      relates: relates.length > 0 ? relates : undefined,
      keywords: extractKeywords(
        stripHtml(getTagContent(db, 'sty')),
        getTagContent(db, 'prfnm'),
        GENRE_CODE_MAP[genreCd] ?? genreCd,
      ),
    };
  });
}

function parseVenueXml(xml: string): Partial<Venue> {
  const db = getAllTags(xml, 'db')[0] ?? '';
  const la = getTagContent(db, 'la');
  const lo = getTagContent(db, 'lo');
  return {
    id: getTagContent(db, 'mt10id'),
    name: getTagContent(db, 'fcltynm'),
    address: getTagContent(db, 'adres'),
    phone: getTagContent(db, 'telno') || undefined,
    seats: parseInt(getTagContent(db, 'seatscale')) || undefined,
    lat: la ? parseFloat(la) : undefined,
    lng: lo ? parseFloat(lo) : undefined,
  };
}

// ---------- 키워드 추출 (규칙 기반) ----------
const KEYWORD_PATTERNS = [
  // 감정·관계
  '사랑', '우정', '가족', '형제', '부모', '자녀', '갈등', '화해', '용서', '배려',
  '감정', '경험', '상상', '이야기',
  // 가치·덕목
  '성장', '용기', '꿈', '희망', '정의', '자유', '평화', '다양성', '포용', '책임',
  '성찰', '진로', '참여', '인권',
  // 사회·역사·공동체
  '역사', '전쟁', '민주주의', '공동체', '환경', '자연', '과학', '미래', '과거',
  '시민', '사회', '지역사회', '세계시민', '경제', '자원',
  // 생태·지속가능성
  '생태', '지속가능성', '건강', '안전', '생활',
  // 예술·문화·전통
  '음악', '춤', '노래', '공연', '판타지', '모험', '동화', '신화', '전래',
  '문화', '전통', '예술', '창작', '표현',
  // 교육적 주제·역량
  '나눔', '협력', '소통', '창의', '도전', '극복', '다문화', '생명', '우리나라',
  '탐구', '관찰', '실험', '문제해결', '의사소통', '발표', '토의', '토론',
  '정보', '매체', '디지털', '기술', '발명',
];

// 장르 → 관련 키워드 맵
const GENRE_KEYWORD_MAP: Record<string, string[]> = {
  '뮤지컬': ['음악', '노래', '춤', '공연', '성장'],
  '연극':   ['갈등', '소통', '공연', '이야기'],
  '무용':   ['춤', '음악', '공연', '창의'],
  '클래식': ['음악', '공연', '창의'],
  '국악':   ['음악', '우리나라', '전래', '공연'],
  '오페라': ['음악', '노래', '공연'],
  '서커스/마술': ['모험', '창의', '공연'],
  '복합':   ['공연', '창의'],
};

function extractKeywords(synopsis: string, title: string, genre: string): string[] {
  const fromSynopsis = KEYWORD_PATTERNS.filter(kw => synopsis.includes(kw));
  // 시놉시스에서 충분한 키워드를 얻었으면 그대로 반환
  if (fromSynopsis.length >= 3) return fromSynopsis;

  // 제목 단어에서 추가 키워드 추출
  const titleWords = title.match(/[가-힣]{2,}/g) ?? [];
  const fromTitle = KEYWORD_PATTERNS.filter(
    kw => titleWords.some(w => w.includes(kw) || kw.includes(w)),
  );

  // 장르 기반 기본 키워드 추가 (항상 포함)
  const fromGenre = GENRE_KEYWORD_MAP[genre] ?? [];

  // 중복 제거 후 반환
  return [...new Set([...fromSynopsis, ...fromTitle, ...fromGenre])];
}

// ---------- 날짜 유틸 ----------
function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('');
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
