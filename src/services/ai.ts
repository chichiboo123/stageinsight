/**
 * AI 클라이언트 서비스 (브라우저)
 * - 서버리스 AI 게이트웨이(/api/ai/*)를 호출한다. API 키는 서버에만 존재한다.
 * - 토큰 절약: 결과를 localStorage에 캐싱하여 동일 입력 재호출을 차단한다.
 * - 신뢰성: 호출 실패(쿼터 초과/오프라인/키 미설정) 시 null을 반환해
 *   상위 로직이 기존 키워드 기반 결과로 자연스럽게 폴백하도록 한다.
 */

import type {
  Performance,
  AchievementStandard,
  LessonPlan,
  PerformanceEnrichment,
  InsightItem,
} from '../types';

const CACHE_PREFIX = 'ai-cache:v1:';
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

async function postAI<T>(handler: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/ai/${handler}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `AI 요청 실패 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/* ============================================================
   1) 성취기준 AI 재정렬 (Phase 1)
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
): Promise<CurriculumSelection[] | null> {
  if (candidates.length === 0) return null;

  const cacheKey = `rerank:${performance.id}:${topN}:${candidates
    .slice(0, 40)
    .map(c => c.id)
    .join(',')}`;
  const cached = cacheGet<CurriculumSelection[]>(cacheKey);
  if (cached) return cached;

  try {
    const { selections } = await postAI<{ selections: CurriculumSelection[] }>(
      'curriculum-rerank',
      {
        performance: {
          title: performance.title,
          genre: performance.genre,
          synopsis: performance.synopsis ?? '',
          keywords: performance.keywords ?? [],
        },
        candidates: candidates.slice(0, 40).map(c => ({
          id: c.id,
          grade: c.grade,
          subject: c.subject,
          content: c.content,
        })),
        topN,
      },
      signal,
    );
    if (selections?.length) cacheSet(cacheKey, selections);
    return selections ?? null;
  } catch {
    return null; // 폴백: 호출 측이 키워드 결과 유지
  }
}

/* ============================================================
   2) 수업 아이디어 생성 (Phase 2)
   ============================================================ */
export async function aiLessonIdeas(params: {
  performanceTitle: string;
  genre?: string;
  standards: Array<Pick<AchievementStandard, 'id' | 'grade' | 'subject' | 'content'>>;
  extras: Array<{ type: InsightItem['type']; title: string }>;
  cacheKey: string;
}): Promise<LessonPlan> {
  const cached = cacheGet<LessonPlan>(`lesson:${params.cacheKey}`);
  if (cached) return cached;

  const result = await postAI<LessonPlan>('lesson-ideas', {
    performanceTitle: params.performanceTitle,
    genre: params.genre,
    standards: params.standards,
    extras: params.extras,
  });
  cacheSet(`lesson:${params.cacheKey}`, result);
  return result;
}

/* ============================================================
   3) 공연 의미 보강 (Phase 3)
   ============================================================ */
export async function aiEnrichPerformance(
  performance: Performance,
  signal?: AbortSignal,
): Promise<PerformanceEnrichment | null> {
  if (!performance.synopsis && !performance.title) return null;

  const cacheKey = `enrich:${performance.id}`;
  const cached = cacheGet<PerformanceEnrichment>(cacheKey);
  if (cached) return cached;

  try {
    const result = await postAI<PerformanceEnrichment>(
      'enrich-performance',
      {
        title: performance.title,
        genre: performance.genre,
        synopsis: performance.synopsis ?? '',
      },
      signal,
    );
    cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
