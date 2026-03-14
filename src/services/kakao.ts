/**
 * 카카오 API 서비스
 * - 키워드 검색으로 학교 좌표 획득 (카카오 로컬 API)
 * - 특정 좌표 반경 내 공연장 검색
 * - 두 지점 간 경로/소요시간 조회 (카카오 모빌리티 API)
 *
 * 환경 변수 설정 필요:
 *   VITE_KAKAO_REST_API_KEY=your_rest_api_key
 *   VITE_KAKAO_JS_API_KEY=your_js_api_key (지도 렌더링용)
 */

import type { School, Venue } from '../types';

const BASE_URL = 'https://dapi.kakao.com/v2/local';
const MOBILITY_URL = 'https://apis-navi.kakaomobility.com/v1';
const API_KEY = import.meta.env.VITE_KAKAO_REST_API_KEY as string;

// 인증 헤더
const authHeader = () => ({ Authorization: `KakaoAK ${API_KEY}` });

// ---------- 타입 ----------
interface KakaoDocument {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name: string;
  x: string;  // lng
  y: string;  // lat
  phone: string;
  category_group_code: string;
}

interface KakaoSearchResponse {
  documents: KakaoDocument[];
  meta: {
    total_count: number;
    pageable_count: number;
    is_end: boolean;
  };
}

interface KakaoRouteResponse {
  routes: Array<{
    result_code: number;
    summary: {
      duration: number;  // 초
      distance: number;  // 미터
    };
  }>;
}

// ---------- 학교 검색 (SC4 + 유치원 병렬) ----------
export async function searchSchools(query: string): Promise<School[]> {
  if (!query.trim()) return [];

  const toSchool = (doc: KakaoDocument): School => ({
    id: doc.id,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
  });

  // SC4(학교) 검색
  const p1 = new URLSearchParams({ query, category_group_code: 'SC4', size: '10' });
  // 카테고리 없이 유치원 포함 전체 검색 (유치원은 SC4 미분류 가능)
  const p2 = new URLSearchParams({ query, size: '10' });

  const [r1, r2] = await Promise.allSettled([
    fetch(`${BASE_URL}/search/keyword.json?${p1}`, { headers: authHeader() }),
    fetch(`${BASE_URL}/search/keyword.json?${p2}`, { headers: authHeader() }),
  ]);

  const docs: KakaoDocument[] = [];
  const seen = new Set<string>();

  for (const r of [r1, r2]) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    const data: KakaoSearchResponse = await r.value.json();
    for (const doc of data.documents) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        docs.push(doc);
      }
    }
  }

  if (docs.length === 0) {
    // 둘 다 실패한 경우
    throw new Error('카카오 학교 검색 실패: 네트워크 오류');
  }

  return docs.slice(0, 10).map(toSchool);
}

// ---------- 반경 내 공연장 검색 (페이지네이션, is_end까지) ----------
export async function searchNearbyVenues(
  lat: number,
  lng: number,
  radiusMeters = 10000
): Promise<Venue[]> {
  const baseParams = {
    query: '공연장',
    category_group_code: 'CT1',
    x: String(lng),
    y: String(lat),
    radius: String(Math.min(radiusMeters, 20000)),
    sort: 'distance',
    size: '15',
  };

  const toVenue = (doc: KakaoDocument): Venue => ({
    id: doc.id,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
    phone: doc.phone || undefined,
  });

  const docs: KakaoDocument[] = [];
  const seen = new Set<string>();
  let firstFailed = false;

  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({ ...baseParams, page: String(page) });
    const res = await fetch(`${BASE_URL}/search/keyword.json?${params}`, { headers: authHeader() });
    if (!res.ok) {
      if (page === 1) firstFailed = true;
      break;
    }
    const data: KakaoSearchResponse = await res.json();
    for (const doc of data.documents) {
      if (!seen.has(doc.id)) { seen.add(doc.id); docs.push(doc); }
    }
    if (data.meta.is_end) break;
  }

  if (docs.length === 0 && firstFailed) {
    throw new Error('주변 공연장 검색 실패: 네트워크 오류');
  }

  return docs.map(toVenue);
}

// ---------- 키워드로 단일 좌표 획득 (공연장 이름 → lat/lng 폴백용) ----------
export async function geocodeKeyword(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ query, size: '1' });
  try {
    const res = await fetch(`${BASE_URL}/search/keyword.json?${params}`, { headers: authHeader() });
    if (!res.ok) return null;
    const data: KakaoSearchResponse = await res.json();
    const doc = data.documents[0];
    if (!doc) return null;
    return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
  } catch {
    return null;
  }
}

// ---------- 반경 내 학교 검색 (SC4) ----------
export async function searchNearbySchools(
  lat: number,
  lng: number,
  radiusMeters = 5000,
): Promise<School[]> {
  const baseParams = {
    query: '학교',
    category_group_code: 'SC4',
    x: String(lng),
    y: String(lat),
    radius: String(Math.min(radiusMeters, 20000)),
    sort: 'distance',
    size: '15',
  };

  const p1 = new URLSearchParams({ ...baseParams, page: '1' });
  const p2 = new URLSearchParams({ ...baseParams, page: '2' });

  const [r1, r2] = await Promise.allSettled([
    fetch(`${BASE_URL}/search/keyword.json?${p1}`, { headers: authHeader() }),
    fetch(`${BASE_URL}/search/keyword.json?${p2}`, { headers: authHeader() }),
  ]);

  const docs: KakaoDocument[] = [];
  const seen = new Set<string>();

  for (const r of [r1, r2]) {
    if (r.status !== 'fulfilled' || !r.value.ok) continue;
    const data: KakaoSearchResponse = await r.value.json();
    for (const doc of data.documents) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        docs.push(doc);
      }
    }
  }

  return docs.slice(0, 20).map(doc => ({
    id: doc.id,
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
  }));
}

// ---------- 두 지점 경로 소요시간 (자동차 기준 / 대중교통 fallback) ----------
export async function getRouteInfo(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ drivingMinutes: number; distanceMeters: number }> {
  const params = new URLSearchParams({
    origin: `${originLng},${originLat}`,
    destination: `${destLng},${destLat}`,
    priority: 'RECOMMEND',
  });

  const res = await fetch(`${MOBILITY_URL}/directions?${params}`, {
    headers: {
      Authorization: `KakaoAK ${API_KEY}`,
    },
  });

  if (!res.ok) {
    // 경로 조회 실패 시 직선거리 기반 추정 반환
    const distanceMeters = haversineDistance(originLat, originLng, destLat, destLng);
    return {
      drivingMinutes: Math.round(distanceMeters / 400), // 분속 약 400m 가정
      distanceMeters,
    };
  }

  const data: KakaoRouteResponse = await res.json();
  const route = data.routes?.[0];

  if (!route || route.result_code !== 0) {
    const distanceMeters = haversineDistance(originLat, originLng, destLat, destLng);
    return { drivingMinutes: Math.round(distanceMeters / 400), distanceMeters };
  }

  return {
    drivingMinutes: Math.round(route.summary.duration / 60),
    distanceMeters: route.summary.distance,
  };
}

// ---------- 직선 거리 계산 (Haversine) ----------
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 지구 반지름 (m)
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---------- 도보 시간 추정 (직선거리 기반) ----------
export function estimateWalkingMinutes(distanceMeters: number): number {
  // 평균 도보 속도 약 70m/min
  return Math.round(distanceMeters / 70);
}
