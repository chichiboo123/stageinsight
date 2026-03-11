import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import styles from './InsightPage.module.css';

const TYPE_LABELS: Record<string, string> = {
  performance: '🎭 공연',
  standard: '📋 성취기준',
  movie: '🎬 영화',
  book: '📚 도서',
};

export function InsightPage() {
  const { state, removeInsightItem, addInsightMemo, updateInsightMemo, deleteInsightMemo } = useApp();
  const { insightBoard } = state;
  const [newMemo, setNewMemo] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

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

  const totalCount = insightBoard.items.length + insightBoard.memos.length;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>인사이트 보드</h1>
        <p className={styles.subtitle}>
          마음에 드는 공연, 성취기준, 미디어를 저장하고 수업 아이디어를 메모해 보세요.
        </p>
        {totalCount > 0 && (
          <span className="tag" style={{ alignSelf: 'flex-start' }}>
            총 {totalCount}개 저장됨
          </span>
        )}
      </div>

      <div className={styles.layout}>
        {/* 스크랩 아이템 */}
        <section className={styles.section}>
          <h2 className="section-title">스크랩</h2>

          {insightBoard.items.length === 0 ? (
            <div className="empty-state">
              <span style={{ fontSize: '36px' }}>📌</span>
              <p>아직 저장된 항목이 없습니다.<br />공연, 성취기준, 영화, 도서에서 저장하세요.</p>
            </div>
          ) : (
            <div className={styles.itemGrid}>
              {insightBoard.items.map(item => (
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

        {/* 메모 */}
        <section className={styles.section}>
          <h2 className="section-title">수업 아이디어 메모</h2>

          {/* 새 메모 입력 */}
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

          {/* 메모 목록 */}
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
                        <button className="btn btn-ghost" onClick={() => setEditingId(null)}>
                          취소
                        </button>
                        <button className="btn btn-primary" onClick={() => handleSaveEdit(memo.id)}>
                          저장
                        </button>
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
                          >
                            수정
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px', color: 'var(--color-accent-primary)' }}
                            onClick={() => deleteInsightMemo(memo.id)}
                          >
                            삭제
                          </button>
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
