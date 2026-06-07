/**
 * AI 호출 상태 스토어 (전역, 초경량 pub-sub)
 * ────────────────────────────────────────────────────────────
 * - "방금 어떤 AI 모델이 호출됐는지"를 정확히 표시하기 위한 상태.
 * - 어떤 컴포넌트든 useAIStatus()로 구독해 동일한 상태를 본다.
 * - 라이브러리 없이 useSyncExternalStore로 구현한다.
 */

import { useSyncExternalStore } from 'react';

export type AIPhase = 'idle' | 'calling' | 'success' | 'error';

export interface AIStatus {
  phase: AIPhase;
  model: string | null;   // 호출 중/성공한 모델 ID (서버가 돌려준 실제 모델)
  label: string | null;   // 어떤 작업인지 (예: '성취기준 큐레이션')
  at: number;             // 마지막 갱신 시각(ms)
}

/**
 * 모델 ID → 표시용 색상.
 * ────────────────────────────────────────────────────────────
 * - 같은 모양의 AI 아이콘을 "모델마다 다른 색"으로 칠해 어떤 모델이 호출됐는지 한눈에 구분한다.
 * - 알려진 모델은 고정 색을 주고, 그 외(이름이 바뀌거나 새로 추가된 모델)는
 *   모델 ID 해시로 결정적(deterministic) 색을 만들어 "이름이 바뀌어도" 안정적으로 색이 매겨진다.
 */
const MODEL_COLORS: Record<string, string> = {
  // 3.x 계열 (현행 우선 체인)
  'gemini-3.1-flash-lite': '#f59e0b',  // 앰버 — 최우선(무료 한도 최대)
  'gemini-3.5-flash': '#10b981',       // 에메랄드
  'gemini-3-flash-preview': '#06b6d4', // 시안
  'gemini-3-flash': '#06b6d4',         // 시안(정식 승격 대비 동일 색)
  // 2.5 계열 (검증된 폴백)
  'gemini-2.5-flash': '#22c55e',       // 초록
  'gemini-2.5-flash-lite': '#0ea5e9',  // 하늘
  'gemini-2.5-pro': '#8b5cf6',         // 보라
  // 구형
  'gemini-2.0-flash': '#14b8a6',       // 청록
  'gemini-1.5-flash': '#84cc16',       // 라임
  'gemini-1.5-pro': '#a855f7',         // 자주
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** 모델 ID에 대응하는 안정적인 색을 돌려준다. (모델이 다르면 색이 다르다) */
export function modelColor(model: string | null): string {
  if (!model) return '#6366f1'; // 모델 미확정(인디고)
  if (MODEL_COLORS[model]) return MODEL_COLORS[model];
  return `hsl(${hashHue(model)} 68% 48%)`;
}

/**
 * 모델 ID → 사람이 읽기 좋은 정확한 이름.
 * 하드코딩 맵 대신 ID 자체를 보기 좋게 변환하므로, 제공사가 이름을 바꿔도
 * "실제 호출된 모델"을 항상 정확히 드러낸다. 예) gemini-2.5-flash-lite → Gemini 2.5 Flash Lite
 */
export function modelLabel(model: string | null): string {
  if (!model) return 'AI';
  return model
    .split(/[-_]/)
    .map(part => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
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
