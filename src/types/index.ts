/* ============================================================
   여기 있어 공연장 - 공통 TypeScript 타입 정의
   ============================================================ */

// ---------- 테마 ----------
export type ThemeKey = 'pastel-blue' | 'pastel-green' | 'pastel-yellow' | 'pastel-pink';

export interface ThemeOption {
  key: ThemeKey;
  label: string;
  preview: string; // 미리보기 색상 (hex)
}

// ---------- 학교 / 위치 ----------
export interface School {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// ---------- 공연장 ----------
export interface Venue {
  id: string;         // KOPIS fcltyCd
  name: string;       // 공연장명
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  seats?: number;
  distanceMeters?: number;    // 학교까지의 직선 거리
  walkingMinutes?: number;    // 도보 시간(분)
  transitMinutes?: number;   // 대중교통 시간(분)
  thumbnail?: string;
}

// ---------- 공연 (KOPIS) ----------
export type PerformanceGenre =
  | '뮤지컬' | '연극' | '무용' | '클래식' | '국악' | '오페라' | '서커스/마술' | '복합';

export type PerformanceState = '공연중' | '공연예정' | '공연완료';

export interface Performance {
  id: string;           // KOPIS mt20id
  title: string;
  venue: string;        // 공연장명
  venueId: string;
  genre: PerformanceGenre;
  state: PerformanceState;
  startDate: string;    // YYYYMMDD
  endDate: string;
  poster?: string;
  runtime?: string;     // e.g. '90분'
  rating?: string;      // 관람연령
  price?: string;
  synopsis?: string;
  keywords?: string[];
  cast?: string[];
}

// ---------- 교육과정 성취기준 ----------
export type CurriculumType = '2022 개정' | '2022 개정 특수' | '2019 누리과정';

export type SchoolLevel = '유아' | '초등' | '중등' | '고등';

export interface AchievementStandard {
  id: string;           // e.g. "2국01-01"
  curriculumType: CurriculumType;
  schoolLevel: SchoolLevel;
  grade: string;        // e.g. "초등학교 1~2학년"
  subject: string;      // e.g. "국어", "도덕"
  domain?: string;      // 영역
  content: string;      // 성취기준 내용
}

export interface CurriculumMatch {
  standard: AchievementStandard;
  score: number;          // 매칭 점수 (0~1)
  matchedKeywords: string[];
}

// ---------- 영화 (TMDB) ----------
export interface Movie {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate: string;
  voteAverage: number;
  genres?: string[];
  runtime?: number;
}

// ---------- 도서 (네이버북) ----------
export interface Book {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  pubdate: string;      // YYYYMMDD
  description: string;
  image?: string;
  link: string;
  price?: number;
}

// ---------- 인사이트 보드 ----------
export interface InsightItem {
  type: 'performance' | 'standard' | 'movie' | 'book';
  id: string;
  title: string;
  subtitle?: string;
  thumbnail?: string;
  savedAt: string;      // ISO 날짜
}

export interface InsightMemo {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface InsightBoard {
  items: InsightItem[];
  memos: InsightMemo[];
}

// ---------- API 응답 공통 ----------
export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// ---------- 앱 전역 상태 ----------
export interface AppState {
  selectedSchool: School | null;
  selectedVenue: Venue | null;
  selectedPerformance: Performance | null;
  theme: ThemeKey;
}
