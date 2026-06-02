/**
 * AIStatusBadge — "현재 어떤 AI 모델을 쓰는지"를 배터리처럼 보여주는 표시기
 * ────────────────────────────────────────────────────────────
 * - 전역 aiStatus 스토어를 구독한다.
 * - 배터리 눈금(3칸)이 모델 우선순위를 의미한다:
 *     · 1순위(gemini-2.5-flash)      → 3칸(가득) · 초록
 *     · 2순위(gemini-3.1-flash-lite) → 2칸 · 노랑 (폴백 발생)
 *     · 3순위(gemini-2.5-flash-lite) → 1칸 · 주황 (최종 폴백)
 * - 호출 중에는 점멸 표시, 실패 시 빨강으로 안내한다.
 * - 한 번도 호출되지 않은 idle 상태에서는 숨긴다.
 */

import { useAIStatus, tierOf, MAX_TIER } from '../../services/aiStatus';

// 모델 ID → 사용자용 짧은 이름
const MODEL_LABEL: Record<string, string> = {
  'gemini-2.5-flash': '2.5 Flash',
  'gemini-3.1-flash-lite': '3.1 Flash-Lite',
  'gemini-2.5-flash-lite': '2.5 Flash-Lite',
};

export function AIStatusBadge() {
  const status = useAIStatus();
  if (status.phase === 'idle') return null;

  const tier = tierOf(status.model);
  const filled = tier === 0 ? MAX_TIER : MAX_TIER - tier + 1; // 1순위=3칸 … 3순위=1칸

  let color = '#22c55e';        // 1순위(초록)
  if (tier === 2) color = '#eab308';   // 2순위(노랑)
  else if (tier >= 3) color = '#f97316'; // 3순위(주황)

  let text: string;
  if (status.phase === 'calling') { text = '호출 중…'; color = '#3b82f6'; }
  else if (status.phase === 'error') { text = 'AI 오류'; color = '#ef4444'; }
  else text = status.model ? (MODEL_LABEL[status.model] ?? status.model) : 'AI';

  const tooltip =
    status.phase === 'calling' ? `AI ${status.label ?? ''} 처리 중`
    : status.phase === 'error' ? `AI 호출 실패 (${status.label ?? ''})`
    : `사용 모델: ${status.model ?? '알 수 없음'} · 우선순위 ${tier}순위\n(폴백 시 자동으로 다른 무료 모델로 전환됩니다)`;

  return (
    <div
      title={tooltip}
      aria-live="polite"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 9px', borderRadius: 999,
        background: 'var(--color-surface, rgba(0,0,0,0.04))',
        border: `1px solid ${color}55`,
        fontSize: 11, fontWeight: 600, color: 'var(--color-text, #333)',
        whiteSpace: 'nowrap',
      }}
    >
      {/* 배터리 아이콘 */}
      <svg width="22" height="13" viewBox="0 0 22 13" aria-hidden="true">
        <rect x="0.5" y="0.5" width="18" height="12" rx="2.5" fill="none" stroke={color} strokeWidth="1" />
        <rect x="19.5" y="4" width="2" height="5" rx="1" fill={color} />
        {[0, 1, 2].map(i => (
          <rect
            key={i}
            x={2.5 + i * 5.3} y={2.5} width="4.3" height="8" rx="1"
            fill={i < filled ? color : 'transparent'}
            opacity={status.phase === 'calling' ? 0.5 : 1}
          />
        ))}
      </svg>
      <span>{text}</span>
    </div>
  );
}
