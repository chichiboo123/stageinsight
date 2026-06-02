/**
 * useMediaRecommendations
 * ────────────────────────────────────────────────────────────
 * - 기본 추천: 공연 선택 시 TMDB(영화) + 네이버북(도서)을 자동 조회 (AI 미사용).
 * - AI 큐레이션: 사용자가 버튼을 눌렀을 때만(curate) 실행한다.
 *   · 기본 추천 후보를 Gemini에 보내 공연과 연관성 높은 것만 선별·랭킹(근거 포함)
 *   · 더 적합한 작품을 위한 정밀 검색어를 추가로 받아 보강 검색
 *   → 부정확하던 추천을 '공연 연계' 관점으로 큐레이션해 정확도를 높인다.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { recommendMoviesForPerformance, searchMoviesByKeywords } from '../services/tmdb';
import { recommendBooksForPerformance, searchBooks } from '../services/naverBook';
import { aiCurateMedia } from '../services/ai';
import type { Performance, Movie, Book } from '../types';

interface MediaState {
  // 기본(비-AI) 추천
  baseMovies: Movie[];
  baseBooks: Book[];
  // AI 큐레이션 결과
  aiMovies: Movie[];
  aiBooks: Book[];
  moviesLoading: boolean;
  booksLoading: boolean;
  moviesError: string | null;
  booksError: string | null;
}

interface MediaReturn {
  movies: Movie[];          // 화면에 보여줄 유효 목록(큐레이션 시 AI 결과)
  books: Book[];
  moviesLoading: boolean;
  booksLoading: boolean;
  moviesError: string | null;
  booksError: string | null;
  // AI 큐레이션
  curate: () => void;
  curating: boolean;
  curated: boolean;
  curateError: string | null;
  canCurate: boolean;
}

const EMPTY: MediaState = {
  baseMovies: [], baseBooks: [], aiMovies: [], aiBooks: [],
  moviesLoading: false, booksLoading: false, moviesError: null, booksError: null,
};

export function useMediaRecommendations(performance: Performance | null): MediaReturn {
  const [state, setState] = useState<MediaState>(EMPTY);
  const [curating, setCurating] = useState(false);
  const [curated, setCurated] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);

  // 최신 기본 후보를 curate에서 참조하기 위한 ref
  const baseRef = useRef<{ movies: Movie[]; books: Book[] }>({ movies: [], books: [] });

  useEffect(() => {
    if (!performance) {
      setState(EMPTY);
      setCurated(false);
      setCurateError(null);
      baseRef.current = { movies: [], books: [] };
      return;
    }

    let cancelled = false;
    setState(prev => ({
      ...prev,
      aiMovies: [], aiBooks: [],
      moviesLoading: true, booksLoading: true, moviesError: null, booksError: null,
    }));
    setCurated(false);
    setCurateError(null);

    recommendMoviesForPerformance(performance.title, performance.keywords ?? [])
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

    recommendBooksForPerformance(performance.title, performance.keywords ?? [], performance.genre)
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
  }, [performance]);

  const curate = useCallback(async () => {
    if (!performance) return;
    const baseMovies = baseRef.current.movies;
    const baseBooks = baseRef.current.books;

    setCurating(true);
    setCurateError(null);
    try {
      const cur = await aiCurateMedia(performance, baseMovies, baseBooks);

      // 1) 기존 후보 중 AI가 선별한 것(근거 부여)을 앞쪽에 배치
      const movieMap = new Map(baseMovies.map(m => [String(m.id), m]));
      const bookMap = new Map(baseBooks.map(b => [b.isbn, b]));

      const aiMovies: Movie[] = cur.movieSelections
        .map(s => { const m = movieMap.get(s.id); return m ? ({ ...m, aiReason: s.reason } as Movie) : null; })
        .filter((m): m is Movie => m !== null);
      const aiBooks: Book[] = cur.bookSelections
        .map(s => { const b = bookMap.get(s.isbn); return b ? ({ ...b, aiReason: s.reason } as Book) : null; })
        .filter((b): b is Book => b !== null);

      // 2) AI 정밀 검색어로 보강 검색 → 기존에 없던 작품을 뒤에 추가
      if (cur.movieQueries.length > 0) {
        const extra = await Promise.all(
          cur.movieQueries.map(q => searchMoviesByKeywords([], q).catch(() => [] as Movie[])),
        );
        const seen = new Set(aiMovies.map(m => m.id));
        for (const batch of extra) for (const m of batch) {
          if (!seen.has(m.id)) { seen.add(m.id); aiMovies.push(m); }
        }
      }
      if (cur.bookQueries.length > 0) {
        const extra = await Promise.all(
          cur.bookQueries.map(q => searchBooks(q, 6).catch(() => [] as Book[])),
        );
        const seen = new Set(aiBooks.map(b => b.isbn));
        for (const batch of extra) for (const b of batch) {
          if (!seen.has(b.isbn)) { seen.add(b.isbn); aiBooks.push(b); }
        }
      }

      setState(prev => ({ ...prev, aiMovies: aiMovies.slice(0, 20), aiBooks: aiBooks.slice(0, 20) }));
      setCurated(true);
    } catch (err) {
      setCurateError(
        err instanceof Error
          ? `AI 추천 큐레이션에 실패했습니다. (${err.message})`
          : 'AI 추천 큐레이션에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setCurating(false);
    }
  }, [performance]);

  return {
    movies: curated ? state.aiMovies : state.baseMovies,
    books: curated ? state.aiBooks : state.baseBooks,
    moviesLoading: state.moviesLoading,
    booksLoading: state.booksLoading,
    moviesError: state.moviesError,
    booksError: state.booksError,
    curate,
    curating,
    curated,
    curateError,
    // 기본 추천이 0개여도(=관련 작품이 안 잡힌 공연) AI 큐레이션은 가능해야 한다.
    // → 정밀 검색어 보강으로 의미 있는 결과를 새로 찾아낸다.
    canCurate: performance !== null && !state.moviesLoading && !state.booksLoading,
  };
}
