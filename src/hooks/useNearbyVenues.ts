/**
 * useNearbyVenues
 * - 선택된 학교 좌표 기반 → 카카오 API로 주변 공연장 검색
 * - 각 공연장의 도보/대중교통 소요시간 병렬 조회
 */

import { useState, useEffect } from 'react';
import { searchNearbyVenues, getRouteInfo, estimateWalkingMinutes } from '../services/kakao';
import type { School, Venue, ApiState } from '../types';

interface UseNearbyVenuesReturn extends ApiState<Venue[]> {
  venues: Venue[];
  refetch: () => void;
}

export function useNearbyVenues(
  school: School | null,
  radiusMeters = 5000,
): UseNearbyVenuesReturn {
  const [state, setState] = useState<ApiState<Venue[]>>({
    data: null,
    loading: false,
    error: null,
  });
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    if (!school) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    async function fetch() {
      try {
        // 1. 주변 공연장 기본 목록
        const rawVenues = await searchNearbyVenues(school!.lat, school!.lng, radiusMeters);

        if (cancelled) return;

        // 2. 각 공연장까지 경로 정보 병렬 조회 (최대 10개)
        const top = rawVenues.slice(0, 10);
        const routeResults = await Promise.allSettled(
          top.map(v => getRouteInfo(school!.lat, school!.lng, v.lat, v.lng))
        );

        if (cancelled) return;

        const enriched: Venue[] = top.map((venue, i) => {
          const route = routeResults[i];
          if (route.status === 'fulfilled') {
            return {
              ...venue,
              distanceMeters: route.value.distanceMeters,
              walkingMinutes: estimateWalkingMinutes(route.value.distanceMeters),
              transitMinutes: route.value.drivingMinutes,
            };
          }
          return venue;
        });

        // 거리순 정렬
        enriched.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

        setState({ data: enriched, loading: false, error: null });
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '공연장 검색 중 오류가 발생했습니다.',
          });
        }
      }
    }

    fetch();
    return () => { cancelled = true; };
  }, [school, radiusMeters, trigger]);

  return {
    venues: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
    refetch: () => setTrigger(t => t + 1),
  };
}
