import { useState, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import type { InsightBoard, InsightItem } from '../types';
import styles from './InsightPage.module.css';

const TYPE_LABELS: Record<string, string> = {
  performance: '🎭 공연',
  standard: '📋 성취기준',
  movie: '🎬 영화',
  book: '📚 도서',
};

// ---------- 내보내기 함수 ----------

function buildTextSummary(board: InsightBoard): string {
  const lines: string[] = ['🛒 수업 장바구니', ''];
  if (board.items.length > 0) {
    lines.push('■ 담은 항목');
    for (const item of board.items) {
      const label = { performance: '[공연]', standard: '[성취기준]', movie: '[영화]', book: '[도서]' }[item.type] ?? `[${item.type}]`;
      lines.push(`  ${label} ${item.title}${item.subtitle ? ' — ' + item.subtitle : ''}`);
    }
    lines.push('');
  }
  if (board.memos.length > 0) {
    lines.push('■ 수업 메모');
    const sorted = [...board.memos].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    for (const memo of sorted) {
      lines.push(memo.content);
      lines.push('');
    }
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

function exportAsImage(board: InsightBoard) {
  const W = 760;
  const PAD = 40;
  const LH = 22;

  // 높이 계산
  let estimatedLines = 4 + board.items.length * 2 + board.memos.reduce((acc, m) => acc + m.content.split('\n').length + 2, 0);
  const H = Math.max(300, PAD * 2 + estimatedLines * LH + 80);

  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 상단 강조 바
  ctx.fillStyle = '#4F46E5';
  ctx.fillRect(0, 0, W, 6);

  let y = 50;
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText('🛒 수업 장바구니', PAD, y);
  y += 36;

  if (board.items.length > 0) {
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillText('담은 항목', PAD, y);
    y += 24;

    for (const item of board.items) {
      const label = { performance: '🎭', standard: '📋', movie: '🎬', book: '📚' }[item.type] ?? '•';
      ctx.fillStyle = '#333333';
      ctx.font = '13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      const title = `${label}  ${item.title}`.slice(0, 70);
      ctx.fillText(title, PAD + 8, y);
      y += LH;
      if (item.subtitle) {
        ctx.fillStyle = '#888888';
        ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.fillText('    ' + item.subtitle.slice(0, 80), PAD + 8, y);
        y += LH - 4;
      }
    }
    y += 10;
  }

  if (board.memos.length > 0) {
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold 13px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.fillText('수업 메모', PAD, y);
    y += 24;

    const sorted = [...board.memos].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    for (const memo of sorted) {
      const lines = memo.content.split('\n').slice(0, 5);
      ctx.fillStyle = '#333333';
      ctx.font = '12px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      for (const line of lines) {
        ctx.fillText(line.slice(0, 90), PAD + 8, y);
        y += LH - 2;
      }
      y += 8;
    }
  }

  // 푸터
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '11px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText('created by. 교육뮤지컬 꿈꾸는 치수쌤', PAD, H - 16);

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '수업장바구니.webp';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/webp');
}

function exportAsPDF(board: InsightBoard) {
  const text = buildTextSummary(board);
  const w = window.open('', '_blank', 'width=700,height=800');
  if (!w) return;
  w.document.write(`<!doctype html>
<html><head><meta charset="UTF-8"><title>수업 장바구니</title>
<style>
  body { font-family: "Apple SD Gothic Neo","Malgun Gothic",sans-serif; max-width:600px; margin:40px auto; color:#1a1a1a; line-height:1.8; }
  h1 { font-size:22px; color:#4F46E5; }
  pre { white-space:pre-wrap; font-family:inherit; font-size:14px; }
  footer { margin-top:40px; color:#aaa; font-size:12px; border-top:1px solid #eee; padding-top:12px; }
  @media print { body { margin:20px; } }
</style></head><body>
<h1>🛒 수업 장바구니</h1>
<pre>${text.replace(/</g,'&lt;')}</pre>
<footer>created by. 교육뮤지컬 꿈꾸는 치수쌤</footer>
<script>window.onload=()=>window.print();<\/script>
</body></html>`);
  w.document.close();
}

// ---------- 컴포넌트 ----------

export function InsightPage() {
  const { state, removeInsightItem, addInsightMemo, updateInsightMemo, deleteInsightMemo } = useApp();
  const { insightBoard } = state;
  const [newMemo, setNewMemo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleAddMemo() {
    if (!newMemo.trim()) return;
    addInsightMemo(newMemo.trim());
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

  const totalCount = insightBoard.items.length + insightBoard.memos.length;
  const isEmpty = totalCount === 0;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>🛒 수업 장바구니</h1>
        <p className={styles.subtitle}>
          마음에 드는 공연, 성취기준, 미디어를 담고 수업 아이디어를 메모해 보세요.
        </p>
        {totalCount > 0 && (
          <span className="tag" style={{ alignSelf: 'flex-start' }}>
            총 {totalCount}개
          </span>
        )}
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
          </div>
        </div>
      )}

      <div className={styles.layout}>
        {/* 담은 항목 */}
        <section className={styles.section}>
          <h2 className="section-title">담은 항목</h2>

          {insightBoard.items.length === 0 ? (
            <div className="empty-state">
              <span style={{ fontSize: '36px' }}>🛒</span>
              <p>아직 담긴 항목이 없습니다.<br />공연, 성취기준, 영화, 도서에서 📌 버튼으로 담으세요.</p>
            </div>
          ) : (
            <div className={styles.itemGrid}>
              {insightBoard.items.map((item: InsightItem) => (
                <div key={item.id} className={`card ${styles.insightItem}`}>
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt={item.title} className={styles.itemThumbnail} />
                  )}
                  <div className={styles.itemBody}>
                    <span className="tag">{TYPE_LABELS[item.type] ?? item.type}</span>
                    <strong className={styles.itemTitle}>{item.title}</strong>
                    {item.subtitle && (
                      <small className={styles.itemSubtitle}>{item.subtitle}</small>
                    )}
                    <small className={styles.itemDate}>
                      {new Date(item.savedAt).toLocaleDateString('ko-KR')}
                    </small>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeInsightItem(item.id)}
                    aria-label="삭제"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 수업 메모 */}
        <section className={styles.section}>
          <h2 className="section-title">수업 아이디어 메모</h2>

          <div className={`card ${styles.memoInput}`}>
            <textarea
              className={styles.textarea}
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              placeholder="수업 아이디어, 활동 계획, 참고사항 등을 자유롭게 기록하세요..."
              rows={4}
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

          <div className={styles.memoList}>
            {insightBoard.memos.length === 0 && (
              <p className={styles.emptyMemo}>메모가 없습니다.</p>
            )}
            {[...insightBoard.memos]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map(memo => (
                <div key={memo.id} className={`card ${styles.memoCard}`}>
                  {editingId === memo.id ? (
                    <>
                      <textarea
                        className={styles.textarea}
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        rows={4}
                        autoFocus
                      />
                      <div className={styles.memoActions}>
                        <button className="btn btn-ghost" onClick={() => setEditingId(null)}>취소</button>
                        <button className="btn btn-primary" onClick={() => handleSaveEdit(memo.id)}>저장</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.memoContent}>{memo.content}</p>
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
        </section>
      </div>
    </div>
  );
}
