/**
 * AI 호출 상태 스토어 (전역, 초경량 pub-sub)
 * ────────────────────────────────────────────────────────────
 * - "지금 어떤 AI 모델을 호출 중인지"를 배터리처럼 표시하기 위한 상태.
 * - 어떤 컴포넌트든 useAIStatus()로 구독해 동일한 상태를 본다.
 * - 라이브러리 없이 useSyncExternalStore로 구현한다.
 */

import { useSyncExternalStore } from 'react';

export type AIPhase = 'idle' | 'calling' | 'success' | 'error';

export interface AIStatus {
  phase: AIPhase;
  model: string | null;   // 호출 중/성공한 모델 ID
  label: string | null;   // 어떤 작업인지 (예: '성취기준 큐레이션')
  at: number;             // 마지막 갱신 시각(ms)
}

/**
 * 모델 → 배터리 단계(1=최상위/풀, 숫자가 클수록 하위 폴백 모델).
 * 사용자가 "현재 1순위 모델인지, 폴백 중인지"를 색/눈금으로 인지하게 한다.
 */
export const MODEL_TIER: Record<string, number> = {
  'gemini-2.5-flash': 1,
  'gemini-3.1-flash-lite': 2,
  'gemini-2.5-flash-lite': 3,
};
export const MAX_TIER = 3;

export function tierOf(model: string | null): number {
  if (!model) return 0;
  return MODEL_TIER[model] ?? 2;
}

let state: AIStatus = { phase: 'idle', model: null, label: null, at: Date.now() };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setAIStatus(patch: Partial<AIStatus>) {
  state = { ...state, ...patch, at: Date.now() };
  emit();
}

export function getAIStatus(): AIStatus {
  return state;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React 훅: 전역 AI 상태 구독 */
export function useAIStatus(): AIStatus {
  return useSyncExternalStore(subscribe, getAIStatus, getAIStatus);
}
