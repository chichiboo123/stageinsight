import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { aiLessonIdeas } from '../services/ai';
import { encodeBoardGzip, encodeBoardBase64, supportsCompression } from '../services/shareCodec';
import type { InsightBoard, InsightItem, InsightMemo, InsightPerformanceMeta, LessonPlan } from '../types';
import styles from './InsightPage.module.css';

interface InsightPageProps {
  onBack?: () => void;
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

function exportAsImage(board: InsightBoard) {
  const W = 760;
  const PAD = 40;
  const LH = 22;
  const groups = groupByPerformance(board.items, board.memos);

  let estimatedLines = 4;
  for (const g of groups) {
    estimatedLines += 2 + g.items.length * 2 + g.memos.reduce((acc, m) => acc + m.content.split('\n').length + 1, 0);
  }
  const H = Math.max(300, PAD * 2 + estimatedLines * LH + 80);

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4F46E5';
  ctx.fillRect(0, 0, W, 6);

  let y = 50;
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText('🛒 인사이트 바구니', PAD, y);
  y += 36;

  for (const group of groups) {
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillText(`■ ${group.performanceTitle ?? '공연 미지정'}`, PAD, y);
    y += 24;

    for (const item of group.items) {
      const label = { performance: '🎭', standard: '📋', movie: '🎬', book: '📚' }[item.type] ?? '•';
      ctx.fillStyle = '#333333';
      ctx.font = '13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      ctx.fillText(`${label}  ${item.title}`.slice(0, 70), PAD + 8, y);
      y += LH;
      if (item.subtitle) {
        ctx.fillStyle = '#888888';
        ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.fillText('    ' + item.subtitle.slice(0, 80), PAD + 8, y);
        y += LH - 4;
      }
    }

    for (const memo of group.memos) {
      ctx.fillStyle = '#555555';
      ctx.font = 'italic 12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      for (const line of memo.content.split('\n').slice(0, 3)) {
        ctx.fillText('📝 ' + line.slice(0, 88), PAD + 8, y);
        y += LH - 2;
      }
    }
    y += 8;
  }

  ctx.fillStyle = '#bbbbbb';
  ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText('created by. 교육뮤지컬 꿈꾸는 치수쌤', PAD, H - 16);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '인사이트바구니.webp';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/webp');
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
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px', flexShrink: 0 }}>×</button>
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
  if (plan.gradeBand) lines.push(`권장 학년군: ${plan.gradeBand}`);
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
function LessonPlanModal({
  performanceTitle, plan, meta, loading, error, onClose, onSaveMemo,
}: {
  performanceTitle: string;
  plan: LessonPlan | null;
  meta: InsightPerformanceMeta | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaveMemo: () => void;
}) {
  const infoRows = metaToRows(meta);
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
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }}>×</button>
        </div>

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

            {plan.gradeBand && (
              <span className="tag" style={{ margin: '14px 0 8px', display: 'inline-block' }}>권장 학년군: {plan.gradeBand}</span>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={onSaveMemo}>📝 메모로 저장</button>
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

export function InsightPage({ onBack }: InsightPageProps) {
  const { state, removeInsightItem, addInsightMemo, updateInsightMemo, deleteInsightMemo, clearInsightBoard, reorderInsightItems } = useApp();
  const { insightBoard } = state;

  const [newMemo, setNewMemo] = useState('');
  const [selectedPerfId, setSelectedPerfId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [selectedItem, setSelectedItem] = useState<InsightItem | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── AI 수업 아이디어 ──
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonPerfId, setLessonPerfId] = useState<string | null>(null);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(null);
  const [lessonMeta, setLessonMeta] = useState<InsightPerformanceMeta | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);

  const handleGenerateLesson = useCallback(async (group: PerformanceGroup) => {
    const title = group.performanceTitle ?? '공연 미지정';
    const perfItem = group.items.find(i => i.type === 'performance');
    const meta = perfItem?.meta ?? null;

    setLessonOpen(true);
    setLessonTitle(title);
    setLessonPerfId(group.performanceId);
    setLessonPlan(null);
    setLessonMeta(meta);
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
        cacheKey: `${group.performanceId ?? 'none'}:${standards.map(s => s.id).join(',')}:m${movies.length}:b${books.length}`,
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
  }, []);

  const handleSaveLessonMemo = useCallback(() => {
    if (!lessonPlan) return;
    addInsightMemo(
      lessonPlanToText(lessonPlan, lessonTitle, lessonMeta),
      lessonPerfId ?? undefined,
      lessonPerfId ? lessonTitle : undefined,
    );
    setLessonOpen(false);
  }, [lessonPlan, lessonTitle, lessonMeta, lessonPerfId, addInsightMemo]);

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
    const fromIdx = items.findIndex(i => i.id === dragId.current);
    const toIdx = items.findIndex(i => i.id === targetId);
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

    // 1) 서버에 저장해 짧은 ?s=<id> 링크 생성 (가장 짧음)
    // 2) 서버 실패 시 gzip 압축 링크(?z=)로 폴백 — 긴 링크를 크게 단축
    // 3) gzip 미지원 브라우저는 비압축 ?share= 링크 최종 폴백
    let url: string;
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insightBoard),
      });
      if (!res.ok) throw new Error('share failed');
      const { id } = await res.json() as { id: string };
      url = `${window.location.origin}${window.location.pathname}?s=${id}`;
    } catch {
      url = await shareAsCompressedUrl(insightBoard); // 폴백: gzip 압축 링크
    }

    try {
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            {onBack && (
              <button className="btn btn-ghost" onClick={onBack} style={{ flexShrink: 0 }} aria-label="뒤로가기">
                <span aria-hidden="true">←</span>
                <span className={styles.backText}>뒤로가기</span>
              </button>
            )}
            <h1 className={styles.title}>🛒 인사이트 바구니</h1>
            {totalCount > 0 && (
              <span className="tag" style={{ fontSize: '11px' }}>
                총 {totalCount}개
              </span>
            )}
          </div>
          {!isEmpty && (
            <button
              className={`btn btn-ghost ${styles.clearBtn}`}
              title="바구니 비우기"
              onClick={() => {
                if (window.confirm('바구니에 담긴 모든 항목과 메모가 삭제됩니다. 계속하시겠습니까?')) {
                  clearInsightBoard();
                }
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
        <p className={styles.subtitle}>
          공연 작품 · 성취기준 · 미디어 · 메모가 공연별로 함께 관리됩니다.
        </p>
      </div>

      {/* 내보내기 버튼 */}
      {!isEmpty && (
        <div className={styles.exportSection}>
          <span className={styles.exportLabel}>내보내기</span>
          <div className={styles.exportBtns}>
            <button className={`btn btn-outline ${styles.exportBtn}`} onClick={() => exportAsImage(insightBoard)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              이미지 저장
            </button>
            <button className={`btn btn-outline ${styles.exportBtn}`} onClick={() => exportAsPDF(insightBoard)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              PDF 인쇄
            </button>
            <button className={`btn btn-outline ${styles.exportBtn}`} onClick={handleCopy}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              {copyMsg || '클립보드 복사'}
            </button>
            <button className={`btn btn-outline ${styles.exportBtn}`} onClick={handleShare}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              {shareMsg || 'URL 공유'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* 왼쪽: 공연별 그룹 (아이템 + 메모) */}
        <section className={styles.section}>
          <h2 className="section-title">담은 항목</h2>

          {isEmpty ? (
            <div className="empty-state">
              <span style={{ fontSize: '36px' }}>🛒</span>
              <p>아직 담긴 항목이 없습니다.<br />공연, 성취기준, 영화, 도서에서 담기 버튼으로 담으세요.</p>
            </div>
          ) : (
            <div className={styles.groupsContainer}>
              {grouped.map(group => (
                <div key={group.performanceId ?? 'ungrouped'} className={styles.performanceGroup}>
                  {/* 그룹 헤더 */}
                  <div className={styles.groupHeader}>
                    <span style={{ fontSize: '18px' }}>🎭</span>
                    <strong className={styles.groupTitle}>{group.performanceTitle ?? '공연 미지정'}</strong>
                    <span className="tag" style={{ fontSize: '11px' }}>
                      {group.items.length + group.memos.length}개
                    </span>
                    {group.items.some(i => i.type === 'performance' || i.type === 'standard') && (
                      <button
                        className="btn btn-outline"
                        style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 10px' }}
                        title="담긴 공연·성취기준·영화·도서로 작품 줄거리부터 AI 융합예술 수업까지 설계합니다."
                        onClick={() => handleGenerateLesson(group)}
                      >
                        ✨ AI 융합수업 설계
                      </button>
                    )}
                  </div>

                  {/* 아이템 그리드 */}
                  {group.items.length > 0 && (
                    <div className={styles.itemGrid}>
                      {group.items.map((item: InsightItem) => (
                        <div
                          key={item.id}
                          className={`card ${styles.insightItem} ${dragOverId === item.id ? styles.dragOver : ''}`}
                          draggable
                          onDragStart={e => handleDragStart(e, item.id)}
                          onDragOver={e => handleDragOver(e, item.id)}
                          onDrop={e => handleDrop(e, item.id)}
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
                            onClick={e => { e.stopPropagation(); removeInsightItem(item.id); }}
                            aria-label={`${item.title} 삭제`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
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
                            ) : (
                              <>
                                <div className={styles.groupMemoHeader}>
                                  <span className={styles.memoIcon}>📝</span>
                                  <p className={styles.memoContent}>{memo.content}</p>
                                </div>
                                <div className={styles.memoBtns}>
                                  <small className={styles.memoDate}>
                                    {new Date(memo.updatedAt).toLocaleString('ko-KR')}
                                  </small>
                                  <div className={styles.memoEditBtns}>
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
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 오른쪽: 메모 입력 */}
        <section className={styles.section}>
          <h2 className="section-title">수업 아이디어 메모</h2>

          <div className={`card ${styles.memoInput}`}>
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
              rows={5}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.ctrlKey) handleAddMemo();
              }}
            />
            <div className={styles.memoActions}>
              <small className={styles.hint}>Ctrl+Enter로 저장</small>
              <button
                className="btn btn-primary"
                onClick={handleAddMemo}
                disabled={!newMemo.trim()}
              >
                메모 추가
              </button>
            </div>
          </div>

          {insightBoard.memos.length === 0 && insightBoard.items.length > 0 && (
            <p className={styles.emptyMemo}>
              위에서 메모를 추가하면 공연 그룹 안에 함께 표시됩니다.
            </p>
          )}
        </section>
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      {lessonOpen && (
        <LessonPlanModal
          performanceTitle={lessonTitle}
          plan={lessonPlan}
          meta={lessonMeta}
          loading={lessonLoading}
          error={lessonError}
          onClose={() => setLessonOpen(false)}
          onSaveMemo={handleSaveLessonMemo}
        />
      )}
    </div>
  );
}
