/**
 * useSchoolSearch
 * - 학교명 입력 → 카카오 로컬 API로 학교 검색
 * - 디바운스 적용 (300ms)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchSchools } from '../services/kakao';
import type { School, ApiState } from '../types';

interface UseSchoolSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  schools: School[];
  loading: boolean;
  error: string | null;
  clearResults: () => void;
}

export function useSchoolSearch(debounceMs = 300): UseSchoolSearchReturn {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<ApiState<School[]>>({
    data: null,
    loading: false,
    error: null,
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
        const results = await searchSchools(query);
        setState({ data: results, loading: false, error: null });
      } catch (err) {
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.',
        });
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs]);

  const clearResults = useCallback(() => {
    setQuery('');
    setState({ data: null, loading: false, error: null });
  }, []);

  return {
    query,
    setQuery,
    schools: state.data ?? [],
    loading: state.loading,
    error: state.error,
    clearResults,
  };
}
