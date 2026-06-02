/**
 * useCurriculumMatch
 * ────────────────────────────────────────────────────────────
 * - 기본(자동): 공연 키워드·줄거리로 로컬 키워드 매칭 결과를 즉시 보여준다 (AI 미사용).
 * - AI 큐레이션(버튼): 사용자가 runAICuration()을 호출했을 때만 실행한다.
 *   키워드로 추린 후보(최대 40개)만 Gemini에 보내 의미적으로 재정렬하고 근거를 부여한다.
 *   실패 시 기본 결과를 그대로 유지한다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  matchCurriculum,
  getCandidatePool,
  matchedKeywordsFor,
} from '../services/curriculumMatcher';
import { aiRerankCurriculum } from '../services/ai';
import type { Performance, CurriculumMatch, CurriculumType, ApiState } from '../types';

interface UseCurriculumMatchReturn extends ApiState<CurriculumMatch[]> {
  matches: CurriculumMatch[];
  activeFilters: CurriculumType[];
  setFilters: (filters: CurriculumType[]) => void;
  runAICuration: () => void;   // AI 큐레이션 실행 (버튼)
  aiLoading: boolean;
  aiCurated: boolean;
  aiError: string | null;
  canRunAI: boolean;
}

export function useCurriculumMatch(
  performance: Performance | null,
): UseCurriculumMatchReturn {
  const [activeFilters, setFilters] = useState<CurriculumType[]>([]);
  const [state, setState] = useState<ApiState<CurriculumMatch[]>>({
    data: null, loading: false, error: null,
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCurated, setAiCurated] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 키워드 기반 결과(폴백) 보관
  const baselineRef = useRef<CurriculumMatch[]>([]);

  useEffect(() => {
    if (!performance) {
      setState({ data: null, loading: false, error: null });
      setAiCurated(false); setAiError(null); setAiLoading(false);
      baselineRef.current = [];
      return;
    }

    const keywords = performance.keywords ?? [];
    const synopsis = performance.synopsis ?? '';
    if (keywords.length === 0 && !synopsis) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    setAiCurated(false); setAiError(null);

    matchCurriculum(keywords, synopsis, activeFilters.length > 0 ? activeFilters : undefined)
      .then(baseline => {
        if (cancelled) return;
        baselineRef.current = baseline;
        setState({ data: baseline, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setState({
          data: null, loading: false,
          error: err instanceof Error ? err.message : '교육과정 매칭 중 오류가 발생했습니다.',
        });
      });

    return () => { cancelled = true; };
  }, [performance, activeFilters]);

  const runAICuration = useCallback(async () => {
    if (!performance) return;
    const keywords = performance.keywords ?? [];
    const synopsis = performance.synopsis ?? '';
    if (keywords.length === 0 && !synopsis) return;

    setAiLoading(true);
    setAiError(null);
    try {
      const pool = await getCandidatePool(
        keywords, synopsis, activeFilters.length > 0 ? activeFilters : undefined, 40,
      );
      const selections = await aiRerankCurriculum(performance, pool, 12);

      if (selections.length > 0) {
        const poolMap = new Map(pool.map(s => [s.id, s]));
        const baselineKw = new Map(baselineRef.current.map(m => [m.standard.id, m.matchedKeywords]));
        const curated: CurriculumMatch[] = selections
          .map(sel => {
            const standard = poolMap.get(sel.id);
            if (!standard) return null;
            return {
              standard,
              score: sel.relevance,
              matchedKeywords: baselineKw.get(sel.id) ?? matchedKeywordsFor(standard, keywords),
              aiReason: sel.reason,
              aiRelevance: sel.relevance,
            } as CurriculumMatch;
          })
          .filter((m): m is CurriculumMatch => m !== null);

        if (curated.length > 0) {
          setState({ data: curated, loading: false, error: null });
          setAiCurated(true);
        } else {
          setAiError('AI가 적합한 성취기준을 찾지 못했습니다. 키워드 결과를 유지합니다.');
        }
      } else {
        setAiError('AI가 적합한 성취기준을 찾지 못했습니다. 키워드 결과를 유지합니다.');
      }
    } catch (err) {
      setAiError(
        err instanceof Error
          ? `AI 큐레이션에 실패했습니다. (${err.message})`
          : 'AI 큐레이션에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setAiLoading(false);
    }
  }, [performance, activeFilters]);

  return {
    matches: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
    activeFilters,
    setFilters,
    runAICuration,
    aiLoading,
    aiCurated,
    aiError,
    canRunAI: !state.loading && (state.data?.length ?? 0) >= 0 && performance !== null,
  };
}
