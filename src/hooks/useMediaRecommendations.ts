/**
 * useMediaRecommendations
 * - 선택된 공연 → TMDB(영화) + 네이버북(도서) 병렬 조회
 * - 두 API를 동시에 호출하여 지연 최소화
 */

import { useState, useEffect } from 'react';
import { recommendMoviesForPerformance } from '../services/tmdb';
import { recommendBooksForPerformance } from '../services/naverBook';
import { aiEnrichPerformance } from '../services/ai';
import type { Performance, Movie, Book } from '../types';

interface MediaState {
  movies: Movie[];
  books: Book[];
  moviesLoading: boolean;
  booksLoading: boolean;
  moviesError: string | null;
  booksError: string | null;
}

export function useMediaRecommendations(performance: Performance | null): MediaState {
  const [state, setState] = useState<MediaState>({
    movies: [],
    books: [],
    moviesLoading: false,
    booksLoading: false,
    moviesError: null,
    booksError: null,
  });

  useEffect(() => {
    if (!performance) {
      setState({
        movies: [],
        books: [],
        moviesLoading: false,
        booksLoading: false,
        moviesError: null,
        booksError: null,
      });
      return;
    }

    let cancelled = false;
    setState(prev => ({
      ...prev,
      moviesLoading: true,
      booksLoading: true,
      moviesError: null,
      booksError: null,
    }));

    // AI 의미 보강(1회, 캐시됨)으로 검색어 정확도 향상.
    // 실패/미설정 시 빈 배열 → 기존 제목·키워드 검색으로 자연 폴백.
    const enrichPromise = aiEnrichPerformance(performance).catch(() => null);

    // TMDB와 네이버북을 병렬로 실행 (AI 검색어가 준비되면 함께 사용)
    const moviePromise = enrichPromise.then(enrich =>
      recommendMoviesForPerformance(
        performance.title,
        performance.keywords ?? [],
        enrich?.movieQueries ?? [],
      ),
    );
    const bookPromise = enrichPromise.then(enrich =>
      recommendBooksForPerformance(
        performance.title,
        performance.keywords ?? [],
        performance.genre,
        enrich?.bookQueries ?? [],
      ),
    );

    // 영화 결과
    moviePromise
      .then(movies => {
        if (!cancelled) setState(prev => ({ ...prev, movies, moviesLoading: false }));
      })
      .catch(err => {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            moviesLoading: false,
            moviesError: err instanceof Error ? err.message : '영화 추천 조회 실패',
          }));
        }
      });

    // 도서 결과
    bookPromise
      .then(books => {
        if (!cancelled) setState(prev => ({ ...prev, books, booksLoading: false }));
      })
      .catch(err => {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            booksLoading: false,
            booksError: err instanceof Error ? err.message : '도서 추천 조회 실패',
          }));
        }
      });

    return () => { cancelled = true; };
  }, [performance]);

  return state;
}
