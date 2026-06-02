/**
 * useDashboardCuration
 * ────────────────────────────────────────────────────────────
 * 공연 대시보드의 성취기준·영화·도서를 한 곳에서 관리하는 통합 훅.
 *
 * - 기본(자동, AI 미사용): 공연 선택 시 성취기준 키워드 매칭 + TMDB·네이버북
 *   기본 추천을 즉시 보여준다. (과정 필터는 성취기준에만 적용)
 * - 통합 AI 큐레이션(버튼): runCuration() 한 번으로
 *   ① 웹 검색 그라운딩으로 작품 원작/배경을 특정하고(예: 오즈→오즈의 마법사)
 *   ② 성취기준·영화·도서를 동시에 선별·랭킹하며
 *   ③ 원작·주제 기반 정밀 검색어로 영화·도서를 보강한다.
 *   → 두 번 호출하던 것을 한 번으로 줄여 토큰·요청을 절약하고 정확도를 높인다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { matchCurriculum, getCandidatePool, matchedKeywordsFor } from '../services/curriculumMatcher';
import { recommendMoviesForPerformance, searchMoviesByKeywords } from '../services/tmdb';
import { recommendBooksForPerformance, searchBooks } from '../services/naverBook';
import { aiCurateAll } from '../services/ai';
import { cleanWorkTitle } from '../services/wiki';
import type { Performance, CurriculumMatch, CurriculumType, Movie, Book } from '../types';

interface State {
  baseMatches: CurriculumMatch[];
  aiMatches: CurriculumMatch[];
  baseMovies: Movie[];
  baseBooks: Book[];
  aiMovies: Movie[];
  aiBooks: Book[];
  themes: string[];
  sourceWork: string;
  currLoading: boolean;
  moviesLoading: boolean;
  booksLoading: boolean;
  currError: string | null;
  moviesError: string | null;
  booksError: string | null;
}

const EMPTY: State = {
  baseMatches: [], aiMatches: [], baseMovies: [], baseBooks: [],
  aiMovies: [], aiBooks: [], themes: [], sourceWork: '',
  currLoading: false, moviesLoading: false, booksLoading: false,
  currError: null, moviesError: null, booksError: null,
};

export interface UseDashboardCurationReturn {
  // 성취기준
  matches: CurriculumMatch[];
  currLoading: boolean;
  currError: string | null;
  activeFilters: CurriculumType[];
  setFilters: (filters: CurriculumType[]) => void;
  // 영화·도서
  movies: Movie[];
  books: Book[];
  moviesLoading: boolean;
  booksLoading: boolean;
  moviesError: string | null;
  booksError: string | null;
  // 통합 AI 큐레이션
  runCuration: () => void;
  aiLoading: boolean;
  curated: boolean;
  aiError: string | null;
  themes: string[];
  sourceWork: string;
  canCurate: boolean;
}

export function useDashboardCuration(performance: Performance | null): UseDashboardCurationReturn {
  const [activeFilters, setFilters] = useState<CurriculumType[]>([]);
  const [state, setState] = useState<State>(EMPTY);
  const [aiLoading, setAiLoading] = useState(false);
  const [curated, setCurated] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 최신 기본 후보를 runCuration에서 참조하기 위한 ref
  const baseRef = useRef<{ movies: Movie[]; books: Book[]; matches: CurriculumMatch[] }>({
    movies: [], books: [], matches: [],
  });

  // ── 기본(자동) 데이터 로드 ──
  useEffect(() => {
    if (!performance) {
      setState(EMPTY);
      setCurated(false); setAiError(null); setAiLoading(false);
      baseRef.current = { movies: [], books: [], matches: [] };
      return;
    }

    const keywords = performance.keywords ?? [];
    const synopsis = performance.synopsis ?? '';
    const cleanTitle = cleanWorkTitle(performance.title);

    let cancelled = false;
    setState(prev => ({
      ...prev,
      aiMatches: [], aiMovies: [], aiBooks: [], themes: [], sourceWork: '',
      currLoading: true, moviesLoading: true, booksLoading: true,
      currError: null, moviesError: null, booksError: null,
    }));
    setCurated(false); setAiError(null);

    // 성취기준 키워드 매칭
    if (keywords.length === 0 && !synopsis) {
      setState(prev => ({ ...prev, baseMatches: [], currLoading: false }));
      baseRef.current.matches = [];
    } else {
      matchCurriculum(keywords, synopsis, activeFilters.length > 0 ? activeFilters : undefined)
        .then(baseline => {
          if (cancelled) return;
          baseRef.current.matches = baseline;
          setState(prev => ({ ...prev, baseMatches: baseline, currLoading: false }));
        })
        .catch(err => {
          if (!cancelled) setState(prev => ({
            ...prev, currLoading: false,
            currError: err instanceof Error ? err.message : '교육과정 매칭 중 오류가 발생했습니다.',
          }));
        });
    }

    // 영화 기본 추천 (지역·회차 주석을 제거한 작품명으로 검색 정확도 향상)
    recommendMoviesForPerformance(cleanTitle, keywords)
      .then(movies => {
        if (cancelled) return;
        baseRef.current.movies = movies;
        setState(prev => ({ ...prev, baseMovies: movies, moviesLoading: false }));
      })
      .catch(err => {
        if (!cancelled) setState(prev => ({
          ...prev, moviesLoading: false,
          moviesError: err instanceof Error ? err.message : '영화 추천 조회 실패',
        }));
      });

    // 도서 기본 추천
    recommendBooksForPerformance(cleanTitle, keywords, performance.genre)
      .then(books => {
        if (cancelled) return;
        baseRef.current.books = books;
        setState(prev => ({ ...prev, baseBooks: books, booksLoading: false }));
      })
      .catch(err => {
        if (!cancelled) setState(prev => ({
          ...prev, booksLoading: false,
          booksError: err instanceof Error ? err.message : '도서 추천 조회 실패',
        }));
      });

    return () => { cancelled = true; };
  }, [performance, activeFilters]);

  // ── 통합 AI 큐레이션 (버튼 트리거) ──
  const runCuration = useCallback(async () => {
    if (!performance) return;
    const keywords = performance.keywords ?? [];
    const synopsis = performance.synopsis ?? '';

    setAiLoading(true);
    setAiError(null);
    try {
      // 성취기준 후보 풀(최대 40) — 과정 필터 반영
      const pool = await getCandidatePool(
        keywords, synopsis, activeFilters.length > 0 ? activeFilters : undefined, 40,
      );
      const baseMovies = baseRef.current.movies;
      const baseBooks = baseRef.current.books;
      const filterKey = activeFilters.length > 0 ? [...activeFilters].sort().join('|') : 'all';

      const cur = await aiCurateAll(performance, pool, baseMovies, baseBooks, filterKey);

      // 1) 성취기준 선별 → 카드(근거·적합도 부여)
      const poolMap = new Map(pool.map(s => [s.id, s]));
      const baselineKw = new Map(baseRef.current.matches.map(m => [m.standard.id, m.matchedKeywords]));
      const aiMatches: CurriculumMatch[] = cur.curriculumSelections
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

      // 2) 영화 선별(근거 부여) → 정밀 검색어로 보강
      const movieMap = new Map(baseMovies.map(m => [String(m.id), m]));
      const aiMovies: Movie[] = cur.movieSelections
        .map(s => { const m = movieMap.get(s.id); return m ? ({ ...m, aiReason: s.reason } as Movie) : null; })
        .filter((m): m is Movie => m !== null);
      if (cur.movieQueries.length > 0) {
        const extra = await Promise.all(
          cur.movieQueries.map(q => searchMoviesByKeywords([], q).catch(() => [] as Movie[])),
        );
        const seen = new Set(aiMovies.map(m => m.id));
        for (const batch of extra) for (const m of batch) {
          if (!seen.has(m.id)) { seen.add(m.id); aiMovies.push(m); }
        }
      }

      // 3) 도서 선별(근거 부여) → 정밀 검색어로 보강
      const bookMap = new Map(baseBooks.map(b => [b.isbn, b]));
      const aiBooks: Book[] = cur.bookSelections
        .map(s => { const b = bookMap.get(s.isbn); return b ? ({ ...b, aiReason: s.reason } as Book) : null; })
        .filter((b): b is Book => b !== null);
      if (cur.bookQueries.length > 0) {
        const extra = await Promise.all(
          cur.bookQueries.map(q => searchBooks(q, 6).catch(() => [] as Book[])),
        );
        const seen = new Set(aiBooks.map(b => b.isbn));
        for (const batch of extra) for (const b of batch) {
          if (!seen.has(b.isbn)) { seen.add(b.isbn); aiBooks.push(b); }
        }
      }

      setState(prev => ({
        ...prev,
        aiMatches,
        aiMovies: aiMovies.slice(0, 20),
        aiBooks: aiBooks.slice(0, 20),
        themes: cur.themes ?? [],
        sourceWork: cur.sourceWork ?? '',
      }));
      setCurated(true);
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

  // AI 결과가 비어 있으면(예: 매칭 0건) 기본 결과를 유지한다.
  const matches = curated && state.aiMatches.length > 0 ? state.aiMatches : state.baseMatches;

  return {
    matches,
    currLoading: state.currLoading,
    currError: state.currError,
    activeFilters,
    setFilters,
    movies: curated ? state.aiMovies : state.baseMovies,
    books: curated ? state.aiBooks : state.baseBooks,
    moviesLoading: state.moviesLoading,
    booksLoading: state.booksLoading,
    moviesError: state.moviesError,
    booksError: state.booksError,
    runCuration,
    aiLoading,
    curated,
    aiError,
    themes: state.themes,
    sourceWork: state.sourceWork,
    canCurate: performance !== null && !state.currLoading && !state.moviesLoading && !state.booksLoading && !aiLoading,
  };
}
