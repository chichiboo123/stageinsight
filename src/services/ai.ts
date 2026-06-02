/**
 * AI 클라이언트 서비스 (브라우저)
 * ────────────────────────────────────────────────────────────
 * - 서버리스 AI 게이트웨이(/api/ai/*)를 호출한다. API 키는 서버에만 존재한다.
 * - 모든 AI 동작은 "사용자가 버튼을 눌렀을 때만" 실행된다(자동 호출 없음 → API 남용 방지).
 * - 토큰 절약: 결과를 localStorage에 캐싱하여 동일 입력 재호출을 차단한다.
 * - 신뢰성: 호출 실패 시 명확한 에러를 던지거나(모달 표시) null을 반환(폴백)한다.
 * - 호출 시작/성공/실패를 aiStatus 스토어에 보고해 '배터리' 표시를 갱신한다.
 */

import type {
  Performance,
  AchievementStandard,
  LessonPlan,
  PerformanceIntro,
  MediaCuration,
} from '../types';
import { setAIStatus } from './aiStatus';

const CACHE_PREFIX = 'ai-cache:v5:';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return v as T;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* 용량 초과 등은 무시 */
  }
}

/**
 * AI 게이트웨이 호출 래퍼.
 * - 시작 시 phase='calling', 성공 시 phase='success'(+사용 모델), 실패 시 phase='error'를 보고.
 * - 응답의 `_model`로 실제 사용된(폴백 포함) 모델을 배터리 표시에 반영한다.
 */
async function postAI<T extends { _model?: string | null }>(
  handler: string,
  label: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  setAIStatus({ phase: 'calling', model: null, label });
  try {
    const res = await fetch(`/api/ai/${handler}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // __handler: 경로 splat 라우팅이 어긋나도 서버가 핸들러를 식별하도록 body에도 포함
      body: JSON.stringify({ ...(body as object), __handler: handler }),
      signal,
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error((detail as { error?: string }).error ?? `AI 요청 실패 (${res.status})`);
    }
    const data = (await res.json()) as T;
    setAIStatus({ phase: 'success', model: data._model ?? null, label });
    return data;
  } catch (err) {
    setAIStatus({ phase: 'error', model: null, label });
    throw err;
  }
}

/* ============================================================
   1) 성취기준 AI 큐레이션 (버튼 트리거)
   ============================================================ */
export interface CurriculumSelection {
  id: string;
  reason: string;
  relevance: number; // 1~5
}

export async function aiRerankCurriculum(
  performance: Performance,
  candidates: AchievementStandard[],
  topN = 12,
  signal?: AbortSignal,
): Promise<CurriculumSelection[]> {
  if (candidates.length === 0) return [];

  const cacheKey = `rerank:${performance.id}:${topN}:${candidates.slice(0, 40).map(c => c.id).join(',')}`;
  const cached = cacheGet<CurriculumSelection[]>(cacheKey);
  if (cached) return cached;

  const { selections } = await postAI<{ selections: CurriculumSelection[]; _model?: string | null }>(
    'curriculum-rerank',
    '성취기준 큐레이션',
    {
      performance: {
        title: performance.title,
        genre: performance.genre,
        synopsis: performance.synopsis ?? '',
        keywords: performance.keywords ?? [],
      },
      candidates: candidates.slice(0, 40).map(c => ({
        id: c.id, grade: c.grade, subject: c.subject, content: c.content,
      })),
      topN,
    },
    signal,
  );
  if (selections?.length) cacheSet(cacheKey, selections);
  return selections ?? [];
}

/* ============================================================
   2) 융합예술 수업 아이디어 생성 (버튼 트리거)
   ============================================================ */
export async function aiLessonIdeas(params: {
  performanceTitle: string;
  genre?: string;
  synopsis?: string;
  // 작품 기본 정보 (있으면 함께 전달 → 작품 소개·학습가치 종합 답변에 활용)
  runtime?: string;
  rating?: string;
  venue?: string;
  price?: string;
  period?: string;
  child?: boolean;
  keywords?: string[];
  standards: Array<Pick<AchievementStandard, 'id' | 'grade' | 'subject' | 'content'>>;
  movies: string[];
  books: string[];
  cacheKey: string;
}): Promise<LessonPlan> {
  const cached = cacheGet<LessonPlan>(`lesson:${params.cacheKey}`);
  if (cached) return cached;

  const result = await postAI<LessonPlan>('lesson-ideas', '융합수업 설계', {
    performanceTitle: params.performanceTitle,
    genre: params.genre,
    synopsis: params.synopsis,
    runtime: params.runtime,
    rating: params.rating,
    venue: params.venue,
    price: params.price,
    period: params.period,
    child: params.child,
    keywords: params.keywords,
    standards: params.standards,
    movies: params.movies,
    books: params.books,
  });
  cacheSet(`lesson:${params.cacheKey}`, result);
  return result;
}

/* ============================================================
   3) 작품 상세 소개 (버튼 트리거)
   ============================================================ */
export async function aiIntroducePerformance(performance: Performance): Promise<PerformanceIntro> {
  const cacheKey = `intro:${performance.id}`;
  const cached = cacheGet<PerformanceIntro>(cacheKey);
  if (cached) return cached;

  const fmt = (d?: string) => (d && d.length >= 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d ?? '');
  const result = await postAI<PerformanceIntro>('introduce-performance', '작품 소개', {
    title: performance.title,
    genre: performance.genre,
    synopsis: performance.synopsis ?? '',
    // 웹 검색 그라운딩으로 "바로 그 공연"을 특정하기 위한 단서
    venue: performance.venue ?? '',
    period: `${fmt(performance.startDate)} ~ ${fmt(performance.endDate)}`,
    cast: performance.cast ?? [],
  });
  cacheSet(cacheKey, result);
  return result;
}

/* ============================================================
   4) 영화·도서 추천 AI 큐레이션 (버튼 트리거)
   ============================================================ */
export async function aiCurateMedia(
  performance: Performance,
  movies: Array<{ id: number | string; title: string; overview?: string }>,
  books: Array<{ isbn: string; title: string; description?: string }>,
  signal?: AbortSignal,
): Promise<MediaCuration> {
  const cacheKey = `curate:${performance.id}`;
  const cached = cacheGet<MediaCuration>(cacheKey);
  if (cached) return cached;

  const result = await postAI<MediaCuration>('curate-media', '추천 큐레이션', {
    performance: {
      title: performance.title,
      genre: performance.genre,
      synopsis: performance.synopsis ?? '',
      // 내용 기반 큐레이션: 키워드·관람연령까지 전달해 작품 '내용'을 더 깊이 이해시킨다
      keywords: performance.keywords ?? [],
      rating: performance.rating ?? '',
    },
    movies: movies.map(m => ({ id: m.id, title: m.title, overview: m.overview })),
    books: books.map(b => ({ isbn: b.isbn, title: b.title, description: b.description })),
  }, signal);
  cacheSet(cacheKey, result);
  return result;
}
