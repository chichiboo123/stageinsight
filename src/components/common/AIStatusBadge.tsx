/**
 * AIStatusBadge — "방금 어떤 AI 모델이 호출됐는지"를 보여주는 표시기
 * ────────────────────────────────────────────────────────────
 * - 전역 aiStatus 스토어를 구독한다.
 * - 항상 "같은 모양"의 AI 아이콘(✦ 스파클)을 쓰고, 색만 모델에 따라 다르게 칠한다.
 *     · 모델마다 고유 색 → 어떤 모델이 호출됐는지 색으로 구분(배터리 눈금 아님).
 * - 모델 이름은 서버가 돌려준 실제 모델 ID를 그대로 정확히 표시한다.
 * - 호출 중에는 아이콘이 점멸, 실패 시 빨강으로 안내한다.
 * - 한 번도 호출되지 않은 idle 상태에서는 숨긴다.
 */

import { useAIStatus, modelColor, modelLabel } from '../../services/aiStatus';

export function AIStatusBadge() {
  const status = useAIStatus();
  if (status.phase === 'idle') return null;

  const calling = status.phase === 'calling';
  const error = status.phase === 'error';

  // 색: 호출 중=중립 파랑, 실패=빨강, 성공=모델별 고유 색
  let color = modelColor(status.model);
  if (calling) color = '#3b82f6';
  else if (error) color = '#ef4444';

  let text: string;
  if (calling) text = '호출 중…';
  else if (error) text = 'AI 오류';
  else text = modelLabel(status.model);

  const tooltip =
    calling ? `AI ${status.label ?? ''} 처리 중`
    : error ? `AI 호출 실패 (${status.label ?? ''})`
    : `호출된 모델: ${status.model ?? '알 수 없음'}\n(한도 초과 시 자동으로 다른 무료 모델로 전환되며, 이 색/이름이 실제 사용된 모델입니다)`;

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
      {/* AI 아이콘 — 모든 모델에서 동일한 모양(✦ 스파클), 색만 모델에 따라 달라진다 */}
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 1.5 L14 9.2 L21.8 11.2 L14 13.2 L12 21.0 L10 13.2 L2.2 11.2 L10 9.2 Z"
          fill={color}
        >
          {calling && (
            <animate attributeName="opacity" values="1;0.35;1" dur="1s" repeatCount="indefinite" />
          )}
        </path>
        {/* 작은 보조 스파클 — 모양 일관성을 위해 고정 */}
        <path d="M19 2.5 L19.7 5 L22.2 5.7 L19.7 6.4 L19 8.9 L18.3 6.4 L15.8 5.7 L18.3 5 Z" fill={color} opacity="0.55" />
      </svg>
      <span>{text}</span>
    </div>
  );
}
