import { useState, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import type { InsightBoard, InsightItem, InsightMemo } from '../types';
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

function shareAsUrl(board: InsightBoard): string {
  // URL-safe base64: +→-, /→_, 패딩(=) 제거 → URL 인코딩 불필요
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(board))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${window.location.origin}${window.location.pathname}?share=${encoded}`;
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
    const url = shareAsUrl(insightBoard);
    try {
      await navigator.clipboard.writeText(url);
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      setShareMsg('✅ 공유 URL 복사됨!');
      shareTimerRef.current = setTimeout(() => setShareMsg(''), 3000);
    } catch {
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      setShareMsg('❌ 복사 실패');
      shareTimerRef.current = setTimeout(() => setShareMsg(''), 2500);
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
              <button className="btn btn-ghost" onClick={onBack} style={{ flexShrink: 0 }}>
                ← 뒤로가기
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
                          {item.thumbnail && (
                            <img src={item.thumbnail} alt={item.title} className={styles.itemThumbnail} />
                          )}
                          <div className={styles.itemBody}>
                            <span className="tag">{TYPE_LABELS[item.type] ?? item.type}</span>
                            <strong className={styles.itemTitle}>{item.title}</strong>
                            {item.subtitle && (
                              <small className={styles.itemSubtitle}>{item.subtitle}</small>
                            )}
                            {item.detail && (
                              <p className={styles.itemDetail}>{item.detail}</p>
                            )}
                            <small className={styles.itemDate}>
                              {new Date(item.savedAt).toLocaleDateString('ko-KR')}
                            </small>
                          </div>
                          <button
                            className={styles.removeBtn}
                            onClick={e => { e.stopPropagation(); removeInsightItem(item.id); }}
                            aria-label="삭제"
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
    </div>
  );
}
