/**
 * useNearbySchools
 * - 공연장 좌표 → 주변 학교 검색 (역방향 검색용)
 * - KOPIS fetchVenueDetail로 공연장 좌표 조회 후 Kakao로 주변 학교 검색
 */

import { useState, useEffect } from 'react';
import { searchNearbySchools, getRouteInfo, estimateWalkingMinutes } from '../services/kakao';
import { fetchVenueDetail } from '../services/kopis';
import type { School, ApiState } from '../types';

export interface SchoolWithDistance extends School {
  distanceMeters?: number;
  walkingMinutes?: number;
  transitMinutes?: number;
}

interface UseNearbySchoolsReturn extends ApiState<SchoolWithDistance[]> {
  schools: SchoolWithDistance[];
}

export function useNearbySchools(
  venueId: string | null,
  radiusMeters = 5000,
): UseNearbySchoolsReturn {
  const [state, setState] = useState<ApiState<SchoolWithDistance[]>>({
    data: null, loading: false, error: null,
  });

  useEffect(() => {
    if (!venueId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    async function run() {
      try {
        // 1. KOPIS 공연장 상세로 좌표 획득
        const detail = await fetchVenueDetail(venueId!);
        if (cancelled) return;

        if (!detail.lat || !detail.lng) {
          setState({ data: [], loading: false, error: null });
          return;
        }

        const { lat, lng } = detail;

        // 2. 카카오로 주변 학교 검색
        const rawSchools = await searchNearbySchools(lat, lng, radiusMeters);
        if (cancelled) return;

        // 3. 경로 정보 병렬 조회
        const routeResults = await Promise.allSettled(
          rawSchools.map(s => getRouteInfo(lat, lng, s.lat, s.lng))
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
  }, [venueId, radiusMeters]);

  return {
    schools: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}
