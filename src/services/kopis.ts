/**
 * KOPIS (공연예술통합전산망) API 서비스
 * 문서: https://www.kopis.or.kr/por/main/openApiUseSrch.do
 *
 * 환경 변수:
 *   VITE_KOPIS_API_KEY=your_service_key
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
  const today = formatDate(new Date());
  const twoMonthsLater = formatDate(addMonths(new Date(), 2));

  const params = new URLSearchParams({
    service: API_KEY,
    stdate: dateFrom ?? today,
    eddate: dateTo ?? twoMonthsLater,
    shprfnmfct: venueName,     // 공연시설명 검색
    rows: '20',
    cpage: '1',
    prfstate: '01,02',         // 01: 공연예정, 02: 공연중
  });

  const res = await fetch(`${BASE_URL}/pblprfr?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연 조회 실패: ${res.statusText}`);

  const xml = await res.text();
  return parsePerformanceListXml(xml);
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

// ---------- 공연장 정보 조회 ----------
export async function fetchVenueDetail(fcltyCd: string): Promise<Partial<Venue>> {
  const params = new URLSearchParams({ service: API_KEY });
  const res = await fetch(`${BASE_URL}/prfplc/${fcltyCd}?${params}`);
  if (!res.ok) throw new Error(`KOPIS 공연장 상세 조회 실패: ${res.statusText}`);

  const xml = await res.text();
  return parseVenueXml(xml);
}

// ---------- XML 파서 유틸 ----------
function getTagContent(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(xml);
  return match ? match[1].trim() : '';
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
      synopsis: getTagContent(db, 'sty') || undefined,
      cast: castRaw ? castRaw.split(',').map(s => s.trim()).filter(Boolean) : [],
      keywords: extractKeywordsFromSynopsis(getTagContent(db, 'sty')),
    };
  });
}

function parseVenueXml(xml: string): Partial<Venue> {
  const db = getAllTags(xml, 'db')[0] ?? '';
  return {
    id: getTagContent(db, 'mt10id'),
    name: getTagContent(db, 'fcltynm'),
    address: getTagContent(db, 'adres'),
    phone: getTagContent(db, 'telno') || undefined,
    seats: parseInt(getTagContent(db, 'seatscale')) || undefined,
  };
}

// ---------- 키워드 추출 (간단한 규칙 기반) ----------
const KEYWORD_PATTERNS = [
  '사랑', '우정', '가족', '성장', '전쟁', '평화', '자유', '정의',
  '역사', '판타지', '모험', '음악', '춤', '희극', '비극', '환경',
  '다양성', '포용', '용기', '꿈', '희망', '과거', '미래', '자연',
];

function extractKeywordsFromSynopsis(synopsis: string): string[] {
  if (!synopsis) return [];
  return KEYWORD_PATTERNS.filter(kw => synopsis.includes(kw));
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
