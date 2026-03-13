/**
 * useNearbySchools
 * - 공연장 좌표 → 주변 학교 검색 (역방향 검색용)
 * - KOPIS fetchVenueDetail로 좌표 조회, 없으면 Kakao 키워드 지오코딩 폴백
 */

import { useState, useEffect } from 'react';
import { searchNearbySchools, geocodeKeyword, getRouteInfo, estimateWalkingMinutes } from '../services/kakao';
import { fetchVenueDetail } from '../services/kopis';
import type { School, ApiState } from '../types';

export interface SchoolWithDistance extends School {
  distanceMeters?: number;
  walkingMinutes?: number;
  transitMinutes?: number;
}

export interface VenueGeoInfo {
  lat: number;
  lng: number;
  address: string;
}

interface UseNearbySchoolsReturn extends ApiState<SchoolWithDistance[]> {
  schools: SchoolWithDistance[];
  venueInfo: VenueGeoInfo | null;
}

export function useNearbySchools(
  venueId: string | null,
  venueName: string | null,
  radiusMeters = 10000,
): UseNearbySchoolsReturn {
  const [state, setState] = useState<ApiState<SchoolWithDistance[]>>({
    data: null, loading: false, error: null,
  });
  const [venueInfo, setVenueInfo] = useState<VenueGeoInfo | null>(null);

  useEffect(() => {
    if (!venueId && !venueName) {
      setState({ data: null, loading: false, error: null });
      setVenueInfo(null);
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    setVenueInfo(null);

    async function run() {
      try {
        let lat: number | undefined;
        let lng: number | undefined;
        let venueAddress = '';

        // 1. KOPIS 공연장 상세로 좌표 획득
        if (venueId) {
          const detail = await fetchVenueDetail(venueId);
          if (cancelled) return;
          // KOPIS la/lo가 유효한지 확인 (0이거나 없는 경우 많음)
          if (detail.lat && detail.lng && detail.lat !== 0 && detail.lng !== 0) {
            lat = detail.lat;
            lng = detail.lng;
            venueAddress = detail.address ?? '';
          }
        }

        // 2. KOPIS 좌표 없으면 Kakao 지오코딩 폴백
        if ((!lat || !lng) && venueName) {
          const geo = await geocodeKeyword(venueName);
          if (cancelled) return;
          if (geo) { lat = geo.lat; lng = geo.lng; }
        }

        // 3. 괄호 포함 공연장명 지오코딩 실패 시 괄호 제거 후 재시도
        //    예: "노원어린이극장 (구.노원어울림극장)" → "노원어린이극장"
        if ((!lat || !lng) && venueName) {
          const simplified = venueName.replace(/\s*[(\[（【][^)\]）】]*[)\]）】]/g, '').trim();
          if (simplified && simplified !== venueName) {
            const geo = await geocodeKeyword(simplified);
            if (cancelled) return;
            if (geo) { lat = geo.lat; lng = geo.lng; }
          }
        }

        if (!lat || !lng) {
          setState({ data: [], loading: false, error: null });
          return;
        }

        setVenueInfo({ lat, lng, address: venueAddress });

        // 3. 카카오로 주변 학교 검색
        const rawSchools = await searchNearbySchools(lat, lng, radiusMeters);
        if (cancelled) return;

        // 4. 경로 정보 병렬 조회
        const routeResults = await Promise.allSettled(
          rawSchools.map(s => getRouteInfo(lat!, lng!, s.lat, s.lng))
        );
        if (cancelled) return;

        const enriched: SchoolWithDistance[] = rawSchools.map((school, i) => {
          const route = routeResults[i];
          if (route.status === 'fulfilled') {
            return {
              ...school,
              distanceMeters: route.value.distanceMeters,
              walkingMinutes: estimateWalkingMinutes(route.value.distanceMeters),
              transitMinutes: route.value.drivingMinutes,
            };
          }
          return school;
        });

        enriched.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
        setState({ data: enriched, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null, loading: false,
            error: err instanceof Error ? err.message : '학교 검색 중 오류가 발생했습니다.',
          });
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [venueId, venueName, radiusMeters]);

  return {
    schools: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
    venueInfo,
  };
}
