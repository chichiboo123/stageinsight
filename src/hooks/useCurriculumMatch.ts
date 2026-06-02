/**
 * useCurriculumMatch
 * - 공연 키워드 + 줄거리 → 교육과정 성취기준 매칭
 * - 2단계 전략(토큰 효율 + 신뢰성):
 *   1) 즉시: 키워드 기반 로컬 매칭으로 결과를 바로 보여준다 (폴백 보장)
 *   2) 보강: 키워드로 추린 후보(최대 40개)만 AI에 보내 의미적으로 재정렬·근거 부여
 *   AI 호출 실패(쿼터/오프라인/키 미설정) 시 1)의 결과를 그대로 유지한다.
 */

import { useState, useEffect } from 'react';
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
  aiLoading: boolean;   // AI 재정렬 진행 중
  aiCurated: boolean;   // 현재 결과가 AI 큐레이션 결과인지
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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCurated, setAiCurated] = useState(false);

  useEffect(() => {
    if (!performance) {
      setState({ data: null, loading: false, error: null });
      setAiLoading(false);
      setAiCurated(false);
      return;
    }

    const keywords = performance.keywords ?? [];
    const synopsis = performance.synopsis ?? '';
    if (keywords.length === 0 && !synopsis) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    setAiCurated(false);
    setAiLoading(false);

    (async () => {
      // 1단계: 로컬 키워드 매칭 (즉시 표시 + 폴백)
      let baseline: CurriculumMatch[] = [];
      try {
        baseline = await matchCurriculum(
          keywords,
          synopsis,
          activeFilters.length > 0 ? activeFilters : undefined,
        );
      } catch (err) {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : '교육과정 매칭 중 오류가 발생했습니다.',
          });
        }
        return;
      }
      if (cancelled) return;
      setState({ data: baseline, loading: false, error: null });

      // 2단계: AI 재정렬 (실패 시 baseline 유지)
      setAiLoading(true);
      try {
        const pool = await getCandidatePool(
          keywords,
          synopsis,
          activeFilters.length > 0 ? activeFilters : undefined,
          40,
        );
        const selections = await aiRerankCurriculum(performance, pool, 12, controller.signal);
        if (cancelled) return;

        if (selections && selections.length > 0) {
          const poolMap = new Map(pool.map(s => [s.id, s]));
          const baselineKw = new Map(baseline.map(m => [m.standard.id, m.matchedKeywords]));
          const curated: CurriculumMatch[] = selections
            .map(sel => {
              const standard = poolMap.get(sel.id);
              if (!standard) return null;
              return {
                standard,
                score: sel.relevance,
                matchedKeywords:
                  baselineKw.get(sel.id) ?? matchedKeywordsFor(standard, keywords),
                aiReason: sel.reason,
                aiRelevance: sel.relevance,
              } as CurriculumMatch;
            })
            .filter((m): m is CurriculumMatch => m !== null);

          if (curated.length > 0) {
            setState({ data: curated, loading: false, error: null });
            setAiCurated(true);
          }
        }
      } catch {
        /* AI 실패 → baseline 유지 */
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [performance, activeFilters]);

  return {
    matches: state.data ?? [],
    loading: state.loading,
    error: state.error,
    data: state.data,
    activeFilters,
    setFilters,
    aiLoading,
    aiCurated,
  };
}
