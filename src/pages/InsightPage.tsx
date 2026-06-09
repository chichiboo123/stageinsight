import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { aiLessonIdeas } from '../services/ai';
import { encodeBoardGzip, encodeBoardBase64, supportsCompression } from '../services/shareCodec';
import type { InsightBoard, InsightItem, InsightMemo, InsightPerformanceMeta, LessonPlan } from '../types';
import styles from './InsightPage.module.css';

interface InsightPageProps {
  onBack?: () => void;
  /** 특정 공연 작품의 대시보드로 돌아가 성취기준·영화·도서를 더 담기 위한 콜백 */
  onOpenPerformance?: (performanceId: string, performanceTitle: string, meta?: InsightPerformanceMeta) => void;
}

const TYPE_LABELS: Record<string, string> = {
  performance: '🎭 공연',
  standard: '📋 성취기준',
  movie: '🎬 영화',
  book: '📚 도서',
};

const TYPE_ICONS: Record<string, string> = {
  performance: '🎭',
  standard: '📋',
  movie: '🎬',
  book: '📚',
};

const TYPE_TEXT: Record<string, string> = {
  performance: '공연',
  standard: '성취기준',
  movie: '영화',
  book: '도서',
};

// AI 융합수업 설계 — 선택 입력 옵션
const AUDIENCE_OPTIONS = ['유아', '초등 1~2학년', '초등 3~4학년', '초등 5~6학년', '중학생', '고등학생'];

interface LessonOptions {
  audiences: string[];
  direction: string;
  focusSubject: string;
}
const EMPTY_LESSON_OPTIONS: LessonOptions = { audiences: [], direction: '', focusSubject: '' };

// 같은 id라도 작품(performanceId)이 다르면 별개 항목이므로 복합 키로 식별한다.
function itemKey(item: InsightItem): string {
  return `${item.type}:${item.id}:${item.performanceId ?? ''}`;
}

// ---------- 그룹핑 유틸 ----------
interface PerformanceGroup {
  performanceId: string | null;
  performanceTitle: string | null;
  items: InsightItem[];
  memos: InsightMemo[];
}

function groupByPerformance(items: InsightItem[], memos: InsightMemo[]): PerformanceGroup[] {
  const map = new Map<string, PerformanceGroup>();
  const ungroupedKey = '__ungrouped__';

  for (const item of items) {
    const key = item.performanceId ?? ungroupedKey;
    if (!map.has(key)) {
      map.set(key, {
        performanceId: item.performanceId ?? null,
        performanceTitle: item.performanceTitle ?? null,
        items: [],
        memos: [],
      });
    }
    map.get(key)!.items.push(item);
  }

  for (const memo of memos) {
    const key = memo.performanceId ?? ungroupedKey;
    if (!map.has(key)) {
      map.set(key, {
        performanceId: memo.performanceId ?? null,
        performanceTitle: memo.performanceTitle ?? null,
        items: [],
        memos: [],
      });
    }
    map.get(key)!.memos.push(memo);
  }

  const groups = Array.from(map.values());
  groups.sort((a, b) => {
    if (a.performanceId === null) return 1;
    if (b.performanceId === null) return -1;
    return 0;
  });

  // 각 그룹 안에서 공연 항목은 항상 맨 위에 고정한다(나머지는 기존 순서 유지 — 안정 정렬).
  for (const group of groups) {
    group.items.sort((a, b) => Number(b.type === 'performance') - Number(a.type === 'performance'));
  }

  return groups;
}

// ---------- 내보내기 함수 ----------
function buildTextSummary(board: InsightBoard): string {
  const groups = groupByPerformance(board.items, board.memos);
  const lines: string[] = ['🛒 인사이트 바구니', ''];

  for (const group of groups) {
    const title = group.performanceTitle ?? '공연 미지정';
    lines.push(`■ ${title}`);
    for (const item of group.items) {
      const label = { performance: '[공연]', standard: '[성취기준]', movie: '[영화]', book: '[도서]' }[item.type] ?? `[${item.type}]`;
      lines.push(`  ${label} ${item.title}${item.subtitle ? ' — ' + item.subtitle : ''}`);
      if (item.detail) lines.push(`    ${item.detail}`);
    }
    for (const memo of group.memos) {
      lines.push(`  [메모] ${memo.content}`);
    }
    lines.push('');
  }

  lines.push('created by. 교육뮤지컬 꿈꾸는 치수쌤');
  return lines.join('\n');
}

async function copyToClipboard(board: InsightBoard): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildTextSummary(board));
    return true;
  } catch {
    return false;
  }
}

/** 최종 폴백: 비압축 base64url 링크(?share=). gzip 미지원 브라우저에서만 사용. */
function shareAsUrl(board: InsightBoard): string {
  return `${window.location.origin}${window.location.pathname}?share=${encodeBoardBase64(board)}`;
}

/** gzip 압축 링크(?z=). 서버 단축링크 실패 시 폴백 — 긴 링크를 크게 단축한다. */
async function shareAsCompressedUrl(board: InsightBoard): Promise<string> {
  if (!supportsCompression()) return shareAsUrl(board);
  try {
    const z = await encodeBoardGzip(board);
    return `${window.location.origin}${window.location.pathname}?z=${z}`;
  } catch {
    return shareAsUrl(board);
  }
}

/**
 * 인사이트 바구니를 고해상도 PNG 이미지로 내보낸다.
 * ────────────────────────────────────────────────────────────
 * 품질 개선 포인트:
 *  - 화면 DPR과 무관하게 항상 3배(SCALE) 해상도로 렌더 → 어떤 기기에서도 선명
 *  - 웹폰트 로드 완료(document.fonts.ready)를 기다린 뒤 그려 글자 깨짐 방지
 *  - 길이를 잘라내지 않고 실제 폭 기준으로 줄바꿈(한글 친화) → 내용 누락 없음
 *  - 2-패스 레이아웃으로 정확한 캔버스 높이 계산 → 불필요한 여백 제거
 *  - 손실 압축(webp) 대신 무손실 PNG로 텍스트를 또렷하게 저장
 */
const IMG_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/** maxWidth(px)에 맞춰 텍스트를 여러 줄로 나눈다(한글은 글자 단위, 공백은 보존). */
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

async function exportAsImage(board: InsightBoard) {
  const SCALE = 3;        // 고해상도 렌더 배율
  const W = 800;
  const PAD = 44;
  const CARD_PAD = 18;
  const CONTENT_W = W - PAD * 2;
  const ICONS: Record<string, string> = { performance: '🎭', standard: '📋', movie: '🎬', book: '📚' };
  const groups = groupByPerformance(board.items, board.memos);

  // 웹폰트가 준비된 뒤에 그려야 글자가 또렷하게 렌더된다.
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* 무시 */ }

  // ── 1패스: 측정용 컨텍스트로 모든 줄바꿈/높이를 미리 계산 ──
  const measure = document.createElement('canvas').getContext('2d')!;
  type Op =
    | { kind: 'text'; x: number; y: number; text: string; font: string; color: string }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string; radius: number }
    | { kind: 'line'; x: number; y: number; w: number; color: string };
  const ops: Op[] = [];

  const F_TITLE = `bold 28px ${IMG_FONT}`;
  const F_GROUP = `bold 16px ${IMG_FONT}`;
  const F_ITEM = `600 15px ${IMG_FONT}`;
  const F_SUB = `13px ${IMG_FONT}`;
  const F_DETAIL = `13px ${IMG_FONT}`;
  const F_MEMO = `13px ${IMG_FONT}`;
  const F_FOOT = `12px ${IMG_FONT}`;

  let y = 56;
  // 헤더
  ops.push({ kind: 'text', x: PAD, y, text: '🛒 인사이트 바구니', font: F_TITLE, color: '#1f2937' });
  y += 16;
  const totalCount = board.items.length + board.memos.length;
  ops.push({ kind: 'text', x: PAD, y, text: `총 ${totalCount}개 항목`, font: F_SUB, color: '#9ca3af' });
  y += 30;

  const innerW = CONTENT_W - CARD_PAD * 2;

  for (const group of groups) {
    const cardTop = y;
    let cy = y + CARD_PAD + 18; // 카드 내부 첫 줄 baseline

    // 그룹 헤더
    const groupOps: Op[] = [];
    groupOps.push({ kind: 'text', x: PAD + CARD_PAD, y: cy, text: `🎭 ${group.performanceTitle ?? '공연 미지정'}`, font: F_GROUP, color: '#4F46E5' });
    cy += 26;

    for (const item of group.items) {
      const icon = ICONS[item.type] ?? '•';
      measure.font = F_ITEM;
      for (const line of wrapCanvasText(measure, `${icon}  ${item.title}`, innerW)) {
        groupOps.push({ kind: 'text', x: PAD + CARD_PAD, y: cy, text: line, font: F_ITEM, color: '#1f2937' });
        cy += 22;
      }
      if (item.subtitle) {
        measure.font = F_SUB;
        for (const line of wrapCanvasText(measure, item.subtitle, innerW - 16)) {
          groupOps.push({ kind: 'text', x: PAD + CARD_PAD + 16, y: cy, text: line, font: F_SUB, color: '#6b7280' });
          cy += 19;
        }
      }
      if (item.type === 'standard' && item.detail) {
        measure.font = F_DETAIL;
        for (const line of wrapCanvasText(measure, item.detail, innerW - 16)) {
          groupOps.push({ kind: 'text', x: PAD + CARD_PAD + 16, y: cy, text: line, font: F_DETAIL, color: '#6b7280' });
          cy += 19;
        }
      }
      cy += 6;
    }

    for (const memo of group.memos) {
      measure.font = F_MEMO;
      for (const line of wrapCanvasText(measure, `📝 ${memo.content}`, innerW)) {
        groupOps.push({ kind: 'text', x: PAD + CARD_PAD, y: cy, text: line, font: F_MEMO, color: '#374151' });
        cy += 20;
      }
      cy += 4;
    }

    const cardBottom = cy - 2 + CARD_PAD;
    // 카드 배경(텍스트보다 먼저 그려지도록 ops 앞쪽에 push)
    ops.push({ kind: 'rect', x: PAD, y: cardTop, w: CONTENT_W, h: cardBottom - cardTop, color: '#f8f9fc', radius: 14 });
    ops.push(...groupOps);
    y = cardBottom + 16;
  }

  // 푸터
  const footY = y + 18;
  ops.push({ kind: 'line', x: PAD, y: y + 2, w: CONTENT_W, color: '#e5e7eb' });
  ops.push({ kind: 'text', x: PAD, y: footY, text: 'created by. 교육뮤지컬 꿈꾸는 치수쌤', font: F_FOOT, color: '#9ca3af' });
  const H = footY + 24;

  // ── 2패스: 실제 캔버스에 고해상도로 렌더 ──
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 배경 + 상단 강조 바
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4F46E5';
  ctx.fillRect(0, 0, W, 6);

  const roundRect = (x: number, yy: number, w: number, h: number, r: number) => {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, yy);
    ctx.arcTo(x + w, yy, x + w, yy + h, rad);
    ctx.arcTo(x + w, yy + h, x, yy + h, rad);
    ctx.arcTo(x, yy + h, x, yy, rad);
    ctx.arcTo(x, yy, x + w, yy, rad);
    ctx.closePath();
  };

  for (const op of ops) {
    if (op.kind === 'rect') {
      roundRect(op.x, op.y, op.w, op.h, op.radius);
      ctx.fillStyle = op.color;
      ctx.fill();
      ctx.strokeStyle = '#e8eaf2';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (op.kind === 'line') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(op.x, op.y);
      ctx.lineTo(op.x + op.w, op.y);
      ctx.stroke();
    } else {
      ctx.font = op.font;
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
    }
  }

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '인사이트바구니.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function exportAsPDF(board: InsightBoard) {
  const text = buildTextSummary(board);
  const w = window.open('', '_blank', 'width=700,height=800');
  if (!w) return;
  w.document.write(`<!doctype html>
<html><head><meta charset="UTF-8"><title>인사이트 바구니</title>
<style>
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",sans-serif; max-width:600px; margin:40px auto; color:#1a1a1a; line-height:1.8; }
  h1 { font-size:22px; color:#4F46E5; }
  pre { white-space:pre-wrap; font-family:inherit; font-size:14px; }
  footer { margin-top:40px; color:#aaa; font-size:12px; border-top:1px solid #eee; padding-top:12px; }
  @media print { body { margin:20px; } }
</style></head><body>
<h1>🛒 인사이트 바구니</h1>
<pre>${text.replace(/</g, '&lt;')}</pre>
<footer>created by. 교육뮤지컬 꿈꾸는 치수쌤</footer>
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
  w.document.close();
}

// ---------- 아이템 상세 팝업 ----------
function ItemDetailModal({ item, onClose }: { item: InsightItem; onClose: () => void }) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} 상세`}
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '16px',
          padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '85vh',
          overflow: 'auto', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flex: 1 }}>
            {item.thumbnail && (
              <img src={item.thumbnail} alt={item.title}
                style={{ width: '80px', height: '110px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
            )}
            <div>
              <span className="tag" style={{ marginBottom: '8px', display: 'inline-block' }}>{TYPE_LABELS[item.type] ?? item.type}</span>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                {item.title}
              </h3>
              {item.subtitle && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{item.subtitle}</p>
              )}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px', flexShrink: 0 }} aria-label="닫기">×</button>
        </div>
        {item.detail && (
          <div style={{ marginTop: '12px' }}>
            <h4 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              내용
            </h4>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
              {item.detail}
            </p>
          </div>
        )}
        <small style={{ display: 'block', marginTop: '16px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          담은 날짜: {new Date(item.savedAt).toLocaleDateString('ko-KR')}
        </small>
      </div>
    </div>
  );
}

// ---------- 메인 컴포넌트 ----------
// ---------- 작품 기본 정보 → 라벨/값 목록 ----------
function metaToRows(meta: InsightPerformanceMeta | null | undefined): Array<{ label: string; value: string }> {
  if (!meta) return [];
  const rows: Array<{ label: string; value: string }> = [];
  if (meta.genre) rows.push({ label: '장르', value: meta.genre });
  if (meta.rating) rows.push({ label: '관람연령', value: meta.rating });
  if (meta.runtime) rows.push({ label: '러닝타임', value: meta.runtime });
  if (meta.period && meta.period.trim() !== '~') rows.push({ label: '공연기간', value: meta.period });
  if (meta.venue) rows.push({ label: '공연장', value: meta.venue });
  if (meta.price) rows.push({ label: '티켓 금액', value: meta.price });
  return rows;
}

// ---------- AI 수업 아이디어: 텍스트 변환 (메모 저장/복사용) ----------
function lessonPlanToText(plan: LessonPlan, performanceTitle: string, meta?: InsightPerformanceMeta | null): string {
  const lines: string[] = [];
  lines.push(`✨ AI 융합예술 수업 — ${plan.title || performanceTitle}`);
  if (plan.gradeBand) lines.push(`🎯 수업 대상: ${plan.gradeBand}`);
  lines.push('');
  // 작품 줄거리
  if (plan.plotSummary) {
    lines.push('[작품 줄거리]');
    lines.push(plan.plotSummary);
    lines.push('');
  }
  // 작품 기본 정보
  const rows = metaToRows(meta);
  if (rows.length > 0 || plan.workSummary) {
    lines.push('[작품 기본 정보]');
    rows.forEach(r => lines.push(`· ${r.label}: ${r.value}`));
    if (plan.workSummary) lines.push(plan.workSummary);
    lines.push('');
  }
  if (plan.learningValue?.length) {
    lines.push('[이 작품으로 배울 수 있는 것]');
    plan.learningValue.forEach(v => lines.push(`· ${v}`));
    lines.push('');
  }
  if (plan.overview) { lines.push(`[수업 개요] ${plan.overview}`); lines.push(''); }
  if (plan.convergenceFocus) { lines.push(`[융합 포인트] ${plan.convergenceFocus}`); lines.push(''); }
  if (plan.objectives?.length) {
    lines.push('[학습 목표]');
    plan.objectives.forEach(o => lines.push(`· ${o}`));
    lines.push('');
  }
  if (plan.activities?.length) {
    lines.push('[수업 활동]');
    plan.activities.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.title}${a.duration ? ` (${a.duration})` : ''}${a.linkedMedia ? ` [연계: ${a.linkedMedia}]` : ''}`);
      lines.push(`   ${a.description}`);
    });
    lines.push('');
  }
  if (plan.discussionQuestions?.length) {
    lines.push('[발문/토의 질문]');
    plan.discussionQuestions.forEach(q => lines.push(`· ${q}`));
    lines.push('');
  }
  if (plan.assessment) { lines.push(`[평가] ${plan.assessment}`); }
  return lines.join('\n').trim();
}

// ---------- AI 수업 아이디어 모달 ----------
// 수업 옵션 입력 폼 (수업 대상 중복선택 · 수업 방향 · 주요 교과)
function LessonOptionsForm({
  options, onChange,
}: {
  options: LessonOptions;
  onChange: (o: LessonOptions) => void;
}) {
  const toggleAudience = (a: string) => {
    onChange({
      ...options,
      audiences: options.audiences.includes(a)
        ? options.audiences.filter(x => x !== a)
        : [...options.audiences, a],
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          수업 대상 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(중복 선택 가능 · 선택)</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AUDIENCE_OPTIONS.map(a => {
            const on = options.audiences.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAudience(a)}
                aria-pressed={on}
                style={{
                  fontSize: 12.5, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--color-accent-primary)' : 'var(--color-border)'}`,
                  background: on ? 'var(--color-accent-primary)' : 'var(--color-bg-primary)',
                  color: on ? '#fff' : 'var(--color-text-primary)', fontWeight: on ? 600 : 400,
                }}
              >
                {on ? '✓ ' : ''}{a}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          수업 방향 / 키워드 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span>
        </label>
        <textarea
          value={options.direction}
          onChange={e => onChange({ ...options, direction: e.target.value })}
          placeholder="예: 협력과 공감을 중심으로 표현 활동을 강조하고 싶어요"
          rows={2}
          style={{
            width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
          주요 교과 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span>
        </label>
        <input
          type="text"
          value={options.focusSubject}
          onChange={e => onChange({ ...options, focusSubject: e.target.value })}
          placeholder="예: 국어, 도덕 (중심으로 삼을 교과)"
          style={{
            width: '100%', fontSize: 13.5, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}

function LessonPlanModal({
  performanceTitle, plan, meta, loading, error, options, onOptionsChange, onGenerate, onClose, onSaveMemo, onRegenerate,
}: {
  performanceTitle: string;
  plan: LessonPlan | null;
  meta: InsightPerformanceMeta | null;
  loading: boolean;
  error: string | null;
  options: LessonOptions;
  onOptionsChange: (o: LessonOptions) => void;
  onGenerate: () => void;
  onClose: () => void;
  onSaveMemo: () => void;
  onRegenerate: () => void;
}) {
  const infoRows = metaToRows(meta);
  // 옵션 입력 단계: 아직 결과가 없고 로딩 중이 아닐 때(에러 시에도 폼을 노출해 다시 시도 가능)
  const inputPhase = !plan && !loading;
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(lessonPlanToText(plan, performanceTitle, meta));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="AI 융합예술 수업"
        style={{ maxWidth: '640px', width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '24px' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '17px' }}>✨ AI 융합예술 수업<br /><small style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{plan?.title || performanceTitle}</small></h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }} aria-label="닫기">×</button>
        </div>

        {/* 옵션 입력 단계 — 선택 입력 후 생성 */}
        {inputPhase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              아래 옵션을 입력하면 더 맞춤형으로 설계됩니다. 비워 두면 담긴 성취기준·작품 특성으로 자동 설계합니다.
            </p>
            <LessonOptionsForm options={options} onChange={onOptionsChange} />
            <button className="btn btn-primary" onClick={onGenerate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>auto_awesome</span>
              수업 설계 생성
            </button>
          </div>
        )}

        {loading && (
          <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            공연을 중심으로 영화·도서를 엮은 융합 수업을 구성하고 있어요… ⏳
          </p>
        )}
        {error && (
          <p style={{ padding: '16px', color: 'var(--color-danger)', fontSize: '14px' }} role="alert">
            {error}
          </p>
        )}

        {plan && !loading && (
          <div style={{ fontSize: '14px', lineHeight: 1.6 }}>
            {plan.gradeBand && (
              <div style={{ marginBottom: 10 }}>
                <span className="tag" style={{ fontSize: 12, background: 'rgba(107,138,253,0.15)' }}>🎯 수업 대상: {plan.gradeBand}</span>
              </div>
            )}
            {/* ① 작품 줄거리 (KOPIS 줄거리 또는 AI 지식 기반) */}
            {plan.plotSummary && (
              <div style={{
                background: 'var(--color-info-bg)', border: '1px solid var(--color-border)',
                borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px',
              }}>
                <h4 style={{ margin: '0 0 6px', fontSize: 14 }}>📖 작품 줄거리</h4>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>{plan.plotSummary}</p>
              </div>
            )}

            {/* ② 작품 기본 정보 (사실 정보 + AI 요약) */}
            {(infoRows.length > 0 || plan.workSummary) && (
              <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 10, padding: '12px 14px', margin: '4px 0 12px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>🎭 작품 기본 정보</h4>
                {infoRows.length > 0 && (
                  <ul style={{ margin: '0 0 6px', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 3 }}>
                    {infoRows.map(r => (
                      <li key={r.label} style={{ fontSize: 13 }}>
                        <span style={{ color: 'var(--color-text-muted)', display: 'inline-block', minWidth: 64 }}>{r.label}</span>
                        <span>{r.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {plan.workSummary && <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{plan.workSummary}</p>}
              </div>
            )}

            {/* ② 이 작품으로 배울 수 있는 것 */}
            {plan.learningValue && plan.learningValue.length > 0 && (
              <>
                <h4 style={{ margin: '12px 0 6px' }}>🎓 이 작품으로 배울 수 있는 것</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {plan.learningValue.map((v, i) => <li key={i}>{v}</li>)}
                </ul>
              </>
            )}

            {plan.overview && <p style={{ marginTop: 4 }}>{plan.overview}</p>}

            {plan.convergenceFocus && (
              <div style={{ background: 'rgba(107,138,253,0.08)', borderRadius: 8, padding: '8px 12px', margin: '8px 0' }}>
                <strong style={{ fontSize: 13 }}>🔗 융합 포인트 </strong>
                <span style={{ fontSize: 13 }}>{plan.convergenceFocus}</span>
              </div>
            )}

            {plan.objectives?.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 6px' }}>🎯 학습 목표</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {plan.objectives.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </>
            )}

            {plan.activities?.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 6px' }}>🧩 수업 활동</h4>
                {plan.activities.map((a, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <strong>{i + 1}. {a.title}</strong>
                    {a.duration && <span className="tag" style={{ marginLeft: 6, fontSize: 11 }}>{a.duration}</span>}
                    {a.linkedMedia && <span className="tag" style={{ marginLeft: 4, fontSize: 11, background: 'rgba(107,138,253,0.15)' }}>🔗 {a.linkedMedia}</span>}
                    <p style={{ margin: '2px 0 0' }}>{a.description}</p>
                  </div>
                ))}
              </>
            )}

            {plan.discussionQuestions?.length > 0 && (
              <>
                <h4 style={{ margin: '16px 0 6px' }}>💬 발문 · 토의 질문</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {plan.discussionQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </>
            )}

            {plan.assessment && (
              <>
                <h4 style={{ margin: '16px 0 6px' }}>📊 평가</h4>
                <p style={{ margin: 0 }}>{plan.assessment}</p>
              </>
            )}

            {/* 옵션 수정 후 다시 생성 */}
            <div style={{ marginTop: 18, border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setOptionsExpanded(v => !v)}
                aria-expanded={optionsExpanded}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '10px 14px', background: 'var(--color-bg-secondary)', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
                }}
              >
                <span>⚙️ 수업 옵션 {options.audiences.length || options.direction.trim() || options.focusSubject.trim() ? '(적용됨)' : '(선택)'} — 수정 후 다시 생성</span>
                <span aria-hidden="true">{optionsExpanded ? '▲' : '▼'}</span>
              </button>
              {optionsExpanded && (
                <div style={{ padding: 14 }}>
                  <LessonOptionsForm options={options} onChange={onOptionsChange} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={onRegenerate} title="현재 옵션으로 새로운 수업안을 생성합니다." style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>refresh</span>
                다시 생성
              </button>
              <button className="btn btn-outline" onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {copied
                  ? <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span> 복사됨</>
                  : <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_copy</span> 텍스트 복사</>}
              </button>
              <button className="btn btn-primary" onClick={onSaveMemo} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
                메모로 저장
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
              AI 생성 결과는 참고용입니다. 수업 적용 전 내용을 검토해 주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function InsightPage({ onBack, onOpenPerformance }: InsightPageProps) {
  const { state, removeInsightItem, addInsightMemo, updateInsightMemo, deleteInsightMemo, clearInsightBoard, reorderInsightItems } = useApp();
  const { insightBoard } = state;

  const [newMemo, setNewMemo] = useState('');
  const [selectedPerfId, setSelectedPerfId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [selectedItem, setSelectedItem] = useState<InsightItem | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 보기 방식(목록형/카드형) + 공연별 아코디언 접기 상태 ──
  const [viewMode, setViewMode] = useState<'list' | 'card'>(() =>
    (localStorage.getItem('stageinsight-insight-view') === 'card' ? 'card' : 'list'),
  );
  const changeView = useCallback((mode: 'list' | 'card') => {
    setViewMode(mode);
    try { localStorage.setItem('stageinsight-insight-view', mode); } catch { /* ignore */ }
  }, []);
  // 접힌 공연 그룹 key 집합 (기본: 모두 접힘 — 바구니를 한눈에 보기 위함)
  const groupKeysOf = useCallback((board: InsightBoard): Set<string> => {
    const keys = new Set<string>();
    for (const it of board.items) keys.add(it.performanceId ?? 'ungrouped');
    for (const m of board.memos) keys.add(m.performanceId ?? 'ungrouped');
    return keys;
  }, []);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => groupKeysOf(insightBoard));
  // 이미 한 번 본 그룹 key (새로 생긴 그룹만 기본 접힘 처리하기 위함)
  const seenGroupKeys = useRef<Set<string>>(new Set(groupKeysOf(insightBoard)));
  // 세션 중 새로 추가된 공연 그룹도 기본은 접힌 상태로 둔다(사용자 토글은 보존).
  useEffect(() => {
    const current = groupKeysOf(insightBoard);
    const fresh = [...current].filter(k => !seenGroupKeys.current.has(k));
    if (fresh.length > 0) {
      setCollapsed(prev => {
        const next = new Set(prev);
        fresh.forEach(k => next.add(k));
        return next;
      });
      fresh.forEach(k => seenGroupKeys.current.add(k));
    }
  }, [insightBoard, groupKeysOf]);
  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // 긴 메모(특히 AI 융합수업) 펼침 상태 + 복사 피드백
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());
  const toggleMemo = useCallback((id: string) => {
    setExpandedMemos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const [copiedMemoId, setCopiedMemoId] = useState<string | null>(null);
  // 메모 작성 팝업
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const openMemoComposer = useCallback((perfId = '') => {
    setSelectedPerfId(perfId);
    setMemoModalOpen(true);
  }, []);
  const handleCopyMemo = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMemoId(id);
      setTimeout(() => setCopiedMemoId(c => (c === id ? null : c)), 2000);
    } catch { /* ignore */ }
  }, []);

  // ── AI 수업 아이디어 ──
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonPerfId, setLessonPerfId] = useState<string | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [lessonMeta, setLessonMeta] = useState<InsightPerformanceMeta | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  // 선택 입력 옵션 (수업 대상·방향·주요교과)
  const [lessonOptions, setLessonOptions] = useState<LessonOptions>(EMPTY_LESSON_OPTIONS);
  // 재생성을 위해 현재 모달이 다루는 그룹을 보관
  const lessonGroupRef = useRef<PerformanceGroup | null>(null);

  // 설계 버튼 → 옵션 입력 단계로 모달을 연다(즉시 생성하지 않음).
  const openLessonDesigner = useCallback((group: PerformanceGroup) => {
    const title = group.performanceTitle ?? '공연 미지정';
    const perfItem = group.items.find(i => i.type === 'performance');
    const meta = perfItem?.meta ?? null;
    lessonGroupRef.current = group;

    setLessonTitle(title);
    setLessonPerfId(group.performanceId);
    setLessonMeta(meta);
    setLessonPlan(null);
    setLessonError(null);
    setLessonLoading(false);
    setLessonOptions(EMPTY_LESSON_OPTIONS);
    setLessonOpen(true);
  }, []);

  const handleGenerateLesson = useCallback(async (force = false) => {
    const group = lessonGroupRef.current;
    if (!group) return;
    const title = group.performanceTitle ?? '공연 미지정';
    const perfItem = group.items.find(i => i.type === 'performance');
    const meta = perfItem?.meta ?? null;

    setLessonPlan(null);
    setLessonError(null);
    setLessonLoading(true);

    const standards = group.items
      .filter(i => i.type === 'standard')
      .map(i => {
        const [subject, grade] = (i.subtitle ?? '').split(' · ');
        return { id: i.title, grade: (grade ?? '').trim(), subject: (subject ?? '').trim(), content: i.detail ?? '' };
      });
    const movies = group.items.filter(i => i.type === 'movie').map(i => i.title);
    const books = group.items.filter(i => i.type === 'book').map(i => i.title);
    const synopsis = perfItem?.detail ?? '';

    // 옵션을 캐시 키에 반영해 옵션이 바뀌면 새로 생성되게 한다.
    const opt = lessonOptions;
    const optKey = `a${opt.audiences.join('+')}|d${opt.direction.trim()}|s${opt.focusSubject.trim()}`;

    try {
      const plan = await aiLessonIdeas({
        performanceTitle: title,
        genre: meta?.genre,
        synopsis,
        runtime: meta?.runtime,
        rating: meta?.rating,
        venue: meta?.venue,
        price: meta?.price,
        period: meta?.period,
        child: meta?.child,
        keywords: meta?.keywords,
        standards,
        movies,
        books,
        audiences: opt.audiences,
        direction: opt.direction.trim() || undefined,
        focusSubject: opt.focusSubject.trim() || undefined,
        cacheKey: `${group.performanceId ?? 'none'}:${standards.map(s => s.id).join(',')}:m${movies.length}:b${books.length}:${optKey}`,
        force,
      });
      setLessonPlan(plan);
    } catch (err) {
      setLessonError(
        err instanceof Error
          ? `수업 아이디어 생성에 실패했습니다. (${err.message})`
          : '수업 아이디어 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setLessonLoading(false);
    }
  }, [lessonOptions]);

  const handleSaveLessonMemo = useCallback(() => {
    if (!lessonPlan) return;
    addInsightMemo(
      lessonPlanToText(lessonPlan, lessonTitle, lessonMeta),
      lessonPerfId ?? undefined,
      lessonPerfId ? lessonTitle : undefined,
    );
    setLessonOpen(false);
  }, [lessonPlan, lessonTitle, lessonMeta, lessonPerfId, addInsightMemo]);

  // 같은 그룹으로 캐시를 무시하고 새 수업안 생성(현재 옵션 반영)
  const handleRegenerateLesson = useCallback(() => {
    if (lessonGroupRef.current) handleGenerateLesson(true);
  }, [handleGenerateLesson]);

  // ── 드래그 앤 드롭 ──
  const dragId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragId.current) setDragOverId(id);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId.current || dragId.current === targetId) { setDragOverId(null); return; }
    const items = [...insightBoard.items];
    const fromIdx = items.findIndex(i => itemKey(i) === dragId.current);
    const toIdx = items.findIndex(i => itemKey(i) === targetId);
    if (fromIdx < 0 || toIdx < 0) { setDragOverId(null); return; }
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    reorderInsightItems(items);
    dragId.current = null;
    setDragOverId(null);
  }, [insightBoard.items, reorderInsightItems]);

  const handleDragEnd = useCallback(() => {
    dragId.current = null;
    setDragOverId(null);
  }, []);

  // 담긴 공연 목록 (고유)
  const linkedPerformances = useMemo(() => {
    const map = new Map<string, string>();
    insightBoard.items.forEach(item => {
      if (item.performanceId && !map.has(item.performanceId)) {
        map.set(item.performanceId, item.performanceTitle ?? item.performanceId);
      }
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [insightBoard.items]);

  function handleAddMemo() {
    if (!newMemo.trim()) return;
    const perf = linkedPerformances.find(p => p.id === selectedPerfId);
    addInsightMemo(newMemo.trim(), perf?.id, perf?.title);
    setNewMemo('');
    setMemoModalOpen(false);
  }

  function handleStartEdit(id: string, content: string) {
    setEditingId(id);
    setEditContent(content);
  }

  function handleSaveEdit(id: string) {
    if (!editContent.trim()) return;
    updateInsightMemo(id, editContent.trim());
    setEditingId(null);
    setEditContent('');
  }

  async function handleCopy() {
    const ok = await copyToClipboard(insightBoard);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopyMsg(ok ? '✅ 복사됨!' : '❌ 복사 실패');
    copyTimerRef.current = setTimeout(() => setCopyMsg(''), 2500);
  }

  async function handleShare() {
    const flash = (msg: string, ms = 3000) => {
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      setShareMsg(msg);
      shareTimerRef.current = setTimeout(() => setShareMsg(''), ms);
    };

    // HTTP 414를 피하려고 공유 URL 폴백은 보수적으로 제한한다.
    // 서버 저장 단축링크(?s=)가 기본 경로이며, 긴 데이터를 쿼리스트링에 싣지 않는다.
    const MAX_SAFE_URL = 1900;

    // 1) 서버에 저장해 짧은 ?s=<id> 링크 생성 (가장 짧음)
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insightBoard),
      });
      if (!res.ok) throw new Error(`share api ${res.status}`);
      const { id } = await res.json() as { id: string };
      const url = `${window.location.origin}${window.location.pathname}?s=${id}`;
      await navigator.clipboard.writeText(url);
      flash('✅ 단축 공유 URL 복사됨!');
      return;
    } catch {
      // 서버 저장 실패 → 압축 URL 폴백 시도
    }

    // 2) 서버가 일시적으로 실패한 경우에만 짧은 gzip URL을 폴백으로 허용한다.
    // 긴 압축 URL은 일부 기기/프록시에서 HTTP 414를 만들 수 있으므로 복사하지 않는다.
    try {
      const url = await shareAsCompressedUrl(insightBoard);
      if (url.length > MAX_SAFE_URL) {
        flash('❌ 단축링크 저장에 실패했습니다. 잠시 후 다시 시도하거나 JSON 저장을 사용해 주세요.', 6000);
        return;
      }
      await navigator.clipboard.writeText(url);
      flash('✅ 공유 URL 복사됨!');
    } catch {
      flash('❌ 복사 실패', 2500);
    }
  }

  const grouped = groupByPerformance(insightBoard.items, insightBoard.memos);
  const totalCount = insightBoard.items.length + insightBoard.memos.length;
  const isEmpty = totalCount === 0;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.pageHeader}>
        {onBack && (
          <button className={`btn btn-ghost ${styles.backLink}`} onClick={onBack} aria-label="뒤로가기">
            <span aria-hidden="true">←</span>
            <span>뒤로가기</span>
          </button>
        )}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>🛒 인사이트 바구니</h1>
          {totalCount > 0 && (
            <span className="tag" style={{ fontSize: '11px' }}>총 {totalCount}개</span>
          )}
        </div>
      </div>

      {/* 액션 툴바: 메모 작성 + 비우기 */}
      {!isEmpty && (
        <div className={styles.actionBar}>
          <button
            className={`btn btn-primary ${styles.memoBtn}`}
            onClick={() => openMemoComposer('')}
            title="수업 아이디어 메모를 작성합니다."
          >
            <span className="material-symbols-outlined" aria-hidden="true">edit_note</span>
            메모 작성
          </button>
          <button
            className={`btn btn-ghost ${styles.clearBtn}`}
            title="바구니 비우기"
            onClick={() => {
              if (window.confirm('바구니에 담긴 모든 항목과 메모가 삭제됩니다. 계속하시겠습니까?')) {
                clearInsightBoard();
              }
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">delete</span>
            비우기
          </button>
        </div>
      )}

      {/* 내보내기 FAB Speed Dial */}
      {!isEmpty && (
        <div className={styles.exportFab}>
          {fabOpen && (
            <>
              <button className={styles.fabOverlay} onClick={() => setFabOpen(false)} aria-label="닫기" />
              <div className={styles.fabMenu}>
                {(copyMsg || shareMsg) && (
                  <span className={styles.fabToast}>{copyMsg || shareMsg}</span>
                )}
                <button className={styles.fabMenuItem} onClick={() => { exportAsImage(insightBoard); setFabOpen(false); }}>
                  <span className="material-symbols-outlined">image</span>
                  이미지 저장
                </button>
                <button className={styles.fabMenuItem} onClick={() => { exportAsPDF(insightBoard); setFabOpen(false); }}>
                  <span className="material-symbols-outlined">picture_as_pdf</span>
                  PDF 인쇄
                </button>
                <button className={styles.fabMenuItem} onClick={handleCopy}>
                  <span className="material-symbols-outlined">content_copy</span>
                  {copyMsg || '클립보드 복사'}
                </button>
                <button className={styles.fabMenuItem} onClick={handleShare}>
                  <span className="material-symbols-outlined">ios_share</span>
                  {shareMsg || 'URL 공유'}
                </button>
              </div>
            </>
          )}
          <button
            className={`${styles.fabMainBtn} ${fabOpen ? styles.fabMainBtnOpen : ''}`}
            onClick={() => setFabOpen(f => !f)}
            aria-expanded={fabOpen}
            aria-label="내보내기"
          >
            <span className="material-symbols-outlined">{fabOpen ? 'close' : 'ios_share'}</span>
          </button>
        </div>
      )}

      <div className={styles.layout}>
        {/* 왼쪽: 공연별 그룹 (아이템 + 메모) */}
        <section className={styles.section}>
          <div className={styles.sectionTitleRow}>
            <h2 className="section-title" style={{ margin: 0 }}>담은 항목</h2>
            {!isEmpty && (
              <div className={styles.viewToggle} role="group" aria-label="보기 방식">
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                  onClick={() => changeView('list')}
                  aria-pressed={viewMode === 'list'}
                  title="목록형(바)으로 보기"
                ><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px', verticalAlign: 'middle' }}>view_list</span> 목록</button>
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'card' ? styles.viewToggleActive : ''}`}
                  onClick={() => changeView('card')}
                  aria-pressed={viewMode === 'card'}
                  title="카드형(폴더)으로 보기"
                ><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px', verticalAlign: 'middle' }}>view_module</span> 카드</button>
              </div>
            )}
          </div>

          {isEmpty ? (
            <div className="empty-state">
              <span style={{ fontSize: '36px' }}>🛒</span>
              <p>아직 담긴 항목이 없습니다.<br />공연, 성취기준, 영화, 도서에서 담기 버튼으로 담으세요.</p>
            </div>
          ) : (
            <div className={`${styles.groupsContainer} ${viewMode === 'card' ? styles.groupsGrid : ''}`}>
              {grouped.map(group => {
                const groupKey = group.performanceId ?? 'ungrouped';
                const isCollapsed = collapsed.has(groupKey);
                const groupCount = group.items.length + group.memos.length;
                const perfThumb = group.items.find(i => i.type === 'performance')?.thumbnail;
                return (
                <div
                  key={groupKey}
                  className={`${styles.performanceGroup} ${viewMode === 'card' ? styles.folderCard : ''}`}
                >
                  {/* 그룹 헤더 (클릭 시 아코디언 토글) */}
                  <div
                    className={styles.groupHeader}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleCollapse(groupKey)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(groupKey); } }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={styles.collapseChevron} aria-hidden="true">{isCollapsed ? '▶' : '▼'}</span>
                    {viewMode === 'card' && perfThumb
                      ? <img src={perfThumb} alt="" className={styles.folderThumb} />
                      : <span style={{ fontSize: '18px' }}>🎭</span>}
                    <strong className={styles.groupTitle}>{group.performanceTitle ?? '공연 미지정'}</strong>
                    <span className="tag" style={{ fontSize: '11px' }}>
                      {groupCount}개
                    </span>
                    <div className={styles.groupActions}>
                      <button
                        className="btn btn-outline"
                        style={{ fontSize: '12px', padding: '4px 10px' }}
                        title="이 작품에 수업 아이디어 메모를 추가합니다."
                        onClick={e => { e.stopPropagation(); openMemoComposer(group.performanceId ?? ''); }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px' }}>edit_note</span>
                        메모
                      </button>
                      {group.performanceId && onOpenPerformance && (
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          title="이 작품의 대시보드로 돌아가 성취기준·영화·도서를 더 담습니다."
                          onClick={e => {
                            e.stopPropagation();
                            const perfMeta = group.items.find(i => i.type === 'performance')?.meta;
                            onOpenPerformance(group.performanceId!, group.performanceTitle ?? '', perfMeta);
                          }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px' }}>add</span>
                          더 담기
                        </button>
                      )}
                      {group.items.some(i => i.type === 'performance' || i.type === 'standard') && (
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: '12px', padding: '4px 10px' }}
                          title="담긴 공연·성취기준·영화·도서로 작품 줄거리부터 AI 융합예술 수업까지 설계합니다."
                          onClick={e => { e.stopPropagation(); openLessonDesigner(group); }}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px' }}>auto_awesome</span>
                          AI 융합수업 설계
                        </button>
                      )}
                    </div>
                  </div>

                  {!isCollapsed && (<div className={styles.groupBody}>
                  {/* 아이템 그리드 */}
                  {group.items.length > 0 && (
                    <div className={styles.itemGrid}>
                      {group.items.map((item: InsightItem) => {
                        const key = itemKey(item);
                        return (
                        <div
                          key={key}
                          className={`card ${styles.insightItem} ${dragOverId === key ? styles.dragOver : ''}`}
                          draggable
                          onDragStart={e => handleDragStart(e, key)}
                          onDragOver={e => handleDragOver(e, key)}
                          onDrop={e => handleDrop(e, key)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedItem(item)}
                        >
                          {/* 드래그 핸들 */}
                          <span className={styles.dragHandle} title="드래그하여 순서 변경" onClick={e => e.stopPropagation()}>
                            ⠿
                          </span>
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className={styles.itemThumbnail} />
                          ) : (
                            <span className={styles.itemIcon} aria-hidden="true">{TYPE_ICONS[item.type] ?? '•'}</span>
                          )}
                          <div className={styles.itemBody}>
                            <span className={styles.itemType}>{TYPE_TEXT[item.type] ?? item.type}</span>
                            <strong className={item.type === 'standard' ? styles.itemTitleWrap : styles.itemTitle}>{item.title}</strong>
                            {item.subtitle && (
                              <small className={styles.itemSubtitle}>{item.subtitle}</small>
                            )}
                            {/* 성취기준은 풀텍스트를 바로 보이도록 인라인 표시 */}
                            {item.type === 'standard' && item.detail && (
                              <p className={styles.itemStandardText}>{item.detail}</p>
                            )}
                          </div>
                          <button
                            className={styles.removeBtn}
                            onClick={e => { e.stopPropagation(); removeInsightItem(item.id, item.performanceId); }}
                            aria-label={`${item.title} 삭제`}
                          >
                            ×
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 이 그룹의 메모 */}
                  {group.memos.length > 0 && (
                    <div className={styles.groupMemoList}>
                      {[...group.memos]
                        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                        .map(memo => (
                          <div key={memo.id} className={`card ${styles.groupMemoCard}`}>
                            {editingId === memo.id ? (
                              <>
                                <textarea
                                  className={styles.textarea}
                                  value={editContent}
                                  onChange={e => setEditContent(e.target.value)}
                                  rows={3}
                                  autoFocus
                                />
                                <div className={styles.memoActions}>
                                  <button className="btn btn-ghost" onClick={() => setEditingId(null)}>취소</button>
                                  <button className="btn btn-primary" onClick={() => handleSaveEdit(memo.id)}>저장</button>
                                </div>
                              </>
                            ) : (() => {
                              const isLesson = memo.content.startsWith('✨ AI 융합예술 수업');
                              const isLong = isLesson || memo.content.length > 200;
                              const expanded = expandedMemos.has(memo.id);
                              return (
                              <>
                                <div className={styles.groupMemoHeader}>
                                  <span className={styles.memoIcon}>{isLesson ? '✨' : '📝'}</span>
                                  <p className={`${styles.memoContent} ${isLong && !expanded ? styles.memoClamped : ''}`}>{memo.content}</p>
                                </div>
                                {isLong && (
                                  <button
                                    className={styles.memoToggle}
                                    onClick={() => toggleMemo(memo.id)}
                                    aria-expanded={expanded}
                                  >
                                    {expanded ? '▲ 접기' : '▼ 펼치기'}
                                  </button>
                                )}
                                <div className={styles.memoBtns}>
                                  <small className={styles.memoDate}>
                                    {new Date(memo.updatedAt).toLocaleString('ko-KR')}
                                  </small>
                                  <div className={styles.memoEditBtns}>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
                                      onClick={() => handleCopyMemo(memo.id, memo.content)}
                                    >{copiedMemoId === memo.id ? '복사됨' : '복사'}</button>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}
                                      onClick={() => handleStartEdit(memo.id, memo.content)}
                                    >수정</button>
                                    <button
                                      className="btn btn-ghost"
                                      style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px', color: 'var(--color-accent-primary)' }}
                                      onClick={() => deleteInsightMemo(memo.id)}
                                    >삭제</button>
                                  </div>
                                </div>
                              </>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  )}
                  </div>)}
                </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {/* 메모 작성 모달 — 우측 고정 패널 대신 팝업으로 전환해 바구니를 넓게 사용 */}
      {memoModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
          onClick={() => setMemoModalOpen(false)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label="수업 아이디어 메모 작성"
            style={{ maxWidth: '520px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '17px' }}>📝 수업 아이디어 메모</h3>
              <button className="btn btn-ghost" onClick={() => setMemoModalOpen(false)} style={{ fontSize: '20px', padding: '4px 10px' }} aria-label="닫기">×</button>
            </div>
            {linkedPerformances.length > 0 && (
              <div className={styles.perfSelectRow}>
                <label className={styles.perfSelectLabel}>공연 연결</label>
                <select
                  className={styles.perfSelect}
                  value={selectedPerfId}
                  onChange={e => setSelectedPerfId(e.target.value)}
                >
                  <option value="">공연 미지정</option>
                  {linkedPerformances.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}
            <textarea
              className={styles.textarea}
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              placeholder="수업 아이디어, 활동 계획, 참고사항 등을 자유롭게 기록하세요..."
              rows={6}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleAddMemo(); }}
            />
            <div className={styles.memoActions}>
              <small className={styles.hint}>Ctrl+Enter로 저장 · 저장한 메모는 공연 그룹 안에 표시됩니다</small>
              <button className="btn btn-primary" onClick={handleAddMemo} disabled={!newMemo.trim()}>
                메모 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {lessonOpen && (
        <LessonPlanModal
          performanceTitle={lessonTitle}
          plan={lessonPlan}
          meta={lessonMeta}
          loading={lessonLoading}
          error={lessonError}
          options={lessonOptions}
          onOptionsChange={setLessonOptions}
          onGenerate={() => handleGenerateLesson(false)}
          onClose={() => setLessonOpen(false)}
          onSaveMemo={handleSaveLessonMemo}
          onRegenerate={handleRegenerateLesson}
        />
      )}
    </div>
  );
}
