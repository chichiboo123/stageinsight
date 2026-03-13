/**
 * usePerformanceSearch
 * - 공연명 입력 → KOPIS API로 공연 검색
 * - 디바운스 적용 (400ms)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPerformancesByName } from '../services/kopis';
import type { Performance, ApiState } from '../types';

interface UsePerformanceSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  performances: Performance[];
  loading: boolean;
  error: string | null;
  clearResults: () => void;
}

export function usePerformanceSearch(debounceMs = 400): UsePerformanceSearchReturn {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<ApiState<Performance[]>>({
    data: null, loading: false, error: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    timerRef.current = setTimeout(async () => {
      try {
        const results = await fetchPerformancesByName(query);
        setState({ data: results, loading: false, error: null });
      } catch (err) {
        setState({
          data: null, loading: false,
          error: err instanceof Error ? err.message : '공연 검색 중 오류가 발생했습니다.',
        });
      }
    }, debounceMs);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, debounceMs]);

  const clearResults = useCallback(() => {
    setQuery('');
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    query,
    setQuery,
    performances: state.data ?? [],
    loading: state.loading,
    error: state.error,
    clearResults,
  };
}
