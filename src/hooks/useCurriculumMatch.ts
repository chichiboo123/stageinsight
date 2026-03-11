/**
 * useCurriculumMatch
 * - 공연 키워드 + 줄거리 → 교육과정 성취기준 자동 매칭
 * - 교육과정 유형 필터 지원 (2022개정 / 2019누리 / 2022특수)
 */

import { useState, useEffect } from 'react';
import { matchCurriculum } from '../services/curriculumMatcher';
import type { Performance, CurriculumMatch, CurriculumType, ApiState } from '../types';

interface UseCurriculumMatchReturn extends ApiState<CurriculumMatch[]> {
  matches: CurriculumMatch[];
  activeFilters: CurriculumType[];
  setFilters: (filters: CurriculumType[]) => void;
}

export function useCurriculumMatch(
  performance: Performance | null,
): UseCurriculumMatchReturn {
  const [activeFilters, setFilters] = useState<CurriculumType[]>([]);
  const [state, setState] = useState<ApiState<CurriculumMatch[]>>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!performance) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    matchCurriculum(
      performance.keywords ?? [],
      performance.synopsis ?? '',
      activeFilters.length > 0 ? activeFilters : undefined,
    )
      .then(matches => {
        if (!cancelled) setState({ data: matches, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '교육과정 매칭 중 오류가 발생했습니다.',
          });
        }
      });

    return () => { cancelled = true; };
  }, [performance, activeFilters]);

  return {
    matches: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
    activeFilters,
    setFilters,
  };
}
