/**
 * TMDB (The Movie Database) API 서비스
 * 문서: https://developer.themoviedb.org/reference
 *
 * 환경 변수:
 *   VITE_TMDB_API_KEY=your_api_key
 */

import type { Movie } from '../types';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const API_KEY = import.meta.env.VITE_TMDB_KEY as string;

// ---------- 이미지 URL 헬퍼 ----------
export function tmdbImageUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'original' = 'w342'): string | undefined {
  if (!path) return undefined;
  return `${IMAGE_BASE}/${size}${path}`;
}

// ---------- 타입 ----------
interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  genre_ids: number[];
}

interface TMDBSearchResponse {
  results: TMDBMovie[];
  total_results: number;
  total_pages: number;
}

interface TMDBGenre {
  id: number;
  name: string;
}

// 장르 캐시 (1회 요청 후 메모이제이션)
let genreCache: Record<number, string> | null = null;

async function getGenreMap(): Promise<Record<number, string>> {
  if (genreCache) return genreCache;
  const res = await fetch(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=ko-KR`);
  const data: { genres: TMDBGenre[] } = await res.json();
  genreCache = Object.fromEntries(data.genres.map(g => [g.id, g.name]));
  return genreCache;
}

function mapTMDB(item: TMDBMovie, genreMap: Record<number, string>): Movie {
  return {
    id: item.id,
    title: item.title,
    originalTitle: item.original_title,
    overview: item.overview,
    posterPath: tmdbImageUrl(item.poster_path),
    backdropPath: tmdbImageUrl(item.backdrop_path, 'w500'),
    releaseDate: item.release_date,
    voteAverage: Math.round(item.vote_average * 10) / 10,
    genres: item.genre_ids.map(id => genreMap[id] ?? '').filter(Boolean),
  };
}

// ---------- 키워드 기반 영화 검색 ----------
export async function searchMoviesByKeywords(keywords: string[], title?: string): Promise<Movie[]> {
  const query = [title, ...keywords].filter(Boolean).join(' ');
  if (!query.trim()) return [];

  const [searchRes, genreMap] = await Promise.all([
    fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&language=ko-KR&query=${encodeURIComponent(query)}&region=KR&page=1`),
    getGenreMap(),
  ]);

  if (!searchRes.ok) throw new Error(`TMDB 영화 검색 실패: ${searchRes.statusText}`);

  const data: TMDBSearchResponse = await searchRes.json();
  return data.results
    .slice(0, 20)
    .map(item => mapTMDB(item, genreMap));
}

// ---------- 공연 제목으로 연관 영화 추천 ----------
export async function recommendMoviesForPerformance(
  performanceTitle: string,
  keywords: string[] = [],
): Promise<Movie[]> {
  // 1차: 공연 제목으로 검색
  // 2차: 키워드로 검색
  // 중복 제거 후 상위 20개 반환
  const [byTitle, byKeywords] = await Promise.all([
    searchMoviesByKeywords([], performanceTitle).catch(() => [] as Movie[]),
    keywords.length > 0
      ? searchMoviesByKeywords(keywords).catch(() => [] as Movie[])
      : Promise.resolve([] as Movie[]),
  ]);

  const seen = new Set<number>();
  const merged: Movie[] = [];
  for (const m of [...byTitle, ...byKeywords]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push(m);
    }
  }
  return merged.slice(0, 20);
}
