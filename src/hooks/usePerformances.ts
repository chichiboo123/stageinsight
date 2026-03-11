/**
 * usePerformances
 * - 선택된 공연장 → KOPIS API로 현재/예정 공연 목록 조회
 * - 선택된 공연 → 상세 정보 조회
 */

import { useState, useEffect } from 'react';
import { fetchPerformancesByVenue, fetchPerformanceDetail } from '../services/kopis';
import type { Venue, Performance, ApiState } from '../types';

// ---------- 공연 목록 ----------
interface UsePerformancesReturn extends ApiState<Performance[]> {
  performances: Performance[];
}

export function usePerformances(venue: Venue | null): UsePerformancesReturn {
  const [state, setState] = useState<ApiState<Performance[]>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!venue) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetchPerformancesByVenue(venue.name)
      .then(performances => {
        if (!cancelled) setState({ data: performances, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '공연 정보 조회 중 오류가 발생했습니다.',
          });
        }
      });

    return () => { cancelled = true; };
  }, [venue]);

  return {
    performances: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}

// ---------- 공연 상세 ----------
interface UsePerformanceDetailReturn extends ApiState<Performance> {
  performance: Performance | null;
}

export function usePerformanceDetail(mtId: string | null): UsePerformanceDetailReturn {
  const [state, setState] = useState<ApiState<Performance>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!mtId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    fetchPerformanceDetail(mtId)
      .then(performance => {
        if (!cancelled) setState({ data: performance, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '공연 상세 정보 조회 중 오류가 발생했습니다.',
          });
        }
      });

    return () => { cancelled = true; };
  }, [mtId]);

  return {
    performance: state.data,
    loading: state.loading,
    error: state.error,
    data: state.data,
  };
}
