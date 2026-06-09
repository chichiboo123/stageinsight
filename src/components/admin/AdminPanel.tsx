/**
 * 관리자 모드 패널 — "나만의 클라우드 바구니"
 * ────────────────────────────────────────────────────────────
 * - 화면 좌측 하단에 눈에 잘 띄지 않는 작은 진입점을 숨겨둔다.
 * - 비밀번호로 로그인하면 클라우드(/api/admin)에 저장된 인사이트를 불러오고,
 *   이후 바구니 변경 사항을 자동으로 클라우드에 저장(동기화)한다.
 * - 따라서 어느 기기에서 로그인하든 같은 내용을 보고/담을 수 있다.
 *
 * 동기화 전략:
 *   로그인 시 → 클라우드가 비어 있으면 현재 로컬 바구니를 올려 시드(seed),
 *               내용이 있으면 클라우드 내용을 불러와 화면에 반영.
 *   로그인 후 → 바구니가 바뀔 때마다 0.8초 디바운스 후 자동 저장.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../contexts/AppContext';
import { adminLogin, adminSave } from '../../services/admin';
import type { InsightBoard } from '../../types';

// 로그인 상태(비밀번호)를 기기에 기억해, 새로고침/재방문해도 관리자 모드를 유지한다.
const PW_KEY = 'stageinsight-admin-pw';

type SyncStatus = 'idle' | 'loading' | 'syncing' | 'saved' | 'error';

function boardKey(board: InsightBoard): string {
  return JSON.stringify({ items: board.items, memos: board.memos });
}

function isEmptyBoard(board: InsightBoard): boolean {
  return board.items.length === 0 && board.memos.length === 0;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function AdminPanel() {
  const { state, loadInsightBoard } = useApp();

  const [password, setPassword] = useState<string | null>(null); // null = 로그아웃 상태
  const [open, setOpen] = useState(false);                       // 모달 열림 여부
  const [pwInput, setPwInput] = useState('');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // 항상 최신 보드를 참조하기 위한 ref (콜백 deps를 늘리지 않으려는 목적).
  const boardRef = useRef(state.insightBoard);
  useEffect(() => { boardRef.current = state.insightBoard; }, [state.insightBoard]);

  // 자동 저장 활성화 플래그 + 마지막으로 동기화한 보드 스냅샷 + 디바운스 타이머.
  const syncEnabledRef = useRef(false);
  const lastSyncedRef = useRef<string>('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 비밀번호로 관리자 모드를 활성화한다(로그인 + 시드/불러오기 + 동기화 시작).
   * @returns 성공 여부
   */
  const activate = useCallback(async (pw: string): Promise<boolean> => {
    setStatus('loading');
    setMessage('');
    try {
      const cloud = await adminLogin(pw);
      const local = boardRef.current;

      if (isEmptyBoard(cloud) && !isEmptyBoard(local)) {
        // 클라우드가 비어 있으면 현재 로컬 바구니를 올려 첫 저장(시드)한다 — 기존 작업 보존.
        await adminSave(pw, local);
        lastSyncedRef.current = boardKey(local);
        setMessage('현재 바구니를 관리자 저장소에 처음 저장했습니다.');
      } else {
        // 클라우드 내용을 화면에 반영한다(어느 기기에서나 동일한 내용).
        loadInsightBoard(cloud);
        lastSyncedRef.current = boardKey(cloud);
        setMessage('관리자 저장소에서 인사이트를 불러왔습니다.');
      }

      localStorage.setItem(PW_KEY, pw);
      setPassword(pw);
      syncEnabledRef.current = true;
      setLastSavedAt(new Date().toISOString());
      setStatus('saved');
      return true;
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      return false;
    }
  }, [loadInsightBoard]);

  // 재방문 시: 기억된 비밀번호가 있으면 조용히 다시 로그인해 동기화를 잇는다.
  // (effect 본문에서 setState를 동기로 부르지 않도록 다음 틱으로 미뤄 실행한다.)
  useEffect(() => {
    const saved = localStorage.getItem(PW_KEY);
    if (!saved) return;
    const t = setTimeout(() => { void activate(saved); }, 0);
    return () => clearTimeout(t);
  }, [activate]);

  // 자동 저장: 관리자 모드에서 바구니가 바뀌면 디바운스 후 클라우드에 저장한다.
  useEffect(() => {
    if (!password || !syncEnabledRef.current) return;
    const key = boardKey(state.insightBoard);
    if (key === lastSyncedRef.current) return; // 직전에 동기화한 내용과 같으면 건너뛴다.

    // setState는 동기 effect 본문이 아니라 디바운스 콜백(외부 시스템 동기화) 안에서만 호출한다.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus('syncing');
      try {
        const savedAt = await adminSave(password, boardRef.current);
        lastSyncedRef.current = boardKey(boardRef.current);
        setLastSavedAt(savedAt);
        setStatus('saved');
        setMessage('');
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : '자동 저장에 실패했습니다.');
      }
    }, 800);

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state.insightBoard, password]);

  // 모달: Esc로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleLogin = useCallback(async () => {
    const pw = pwInput.trim();
    if (!pw) return;
    const ok = await activate(pw);
    if (ok) { setPwInput(''); setOpen(false); }
  }, [pwInput, activate]);

  const handleLogout = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    localStorage.removeItem(PW_KEY);
    syncEnabledRef.current = false;
    lastSyncedRef.current = '';
    setPassword(null);
    setStatus('idle');
    setMessage('');
    setLastSavedAt(null);
    setOpen(false);
  }, []);

  const handleSaveNow = useCallback(async () => {
    if (!password) return;
    setStatus('syncing');
    try {
      const savedAt = await adminSave(password, boardRef.current);
      lastSyncedRef.current = boardKey(boardRef.current);
      setLastSavedAt(savedAt);
      setStatus('saved');
      setMessage('클라우드에 저장했습니다.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }, [password]);

  const handleReload = useCallback(async () => {
    if (!password) return;
    setStatus('loading');
    try {
      const cloud = await adminLogin(password);
      loadInsightBoard(cloud);
      lastSyncedRef.current = boardKey(cloud);
      setStatus('saved');
      setMessage('클라우드에서 다시 불러왔습니다.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '불러오기에 실패했습니다.');
    }
  }, [password, loadInsightBoard]);

  const loggedIn = password !== null;

  const statusLabel = (() => {
    switch (status) {
      case 'loading': return '⏳ 불러오는 중…';
      case 'syncing': return '🔄 동기화 중…';
      case 'saved': return lastSavedAt ? `✅ 저장됨 ${formatTime(lastSavedAt)}` : '✅ 동기화됨';
      case 'error': return '⚠️ 동기화 오류';
      default: return '';
    }
  })();

  return (
    <>
      {/* 좌측 하단 숨김 진입점 — 로그아웃 상태에서는 거의 투명한 작은 점 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={loggedIn ? '관리자 모드' : ''}
        aria-label="관리자 모드"
        style={{
          position: 'fixed', left: 10, bottom: 10, zIndex: 900,
          width: loggedIn ? 'auto' : 14, height: loggedIn ? 'auto' : 14,
          padding: loggedIn ? '5px 10px' : 0,
          borderRadius: loggedIn ? 999 : '50%',
          border: loggedIn ? '1px solid var(--color-border)' : 'none',
          background: loggedIn ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
          color: 'var(--color-text-secondary)',
          opacity: loggedIn ? 0.95 : 0.12,
          cursor: 'pointer',
          fontSize: 11,
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: loggedIn ? 'var(--shadow-md)' : 'none',
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={e => { if (!loggedIn) e.currentTarget.style.opacity = '0.4'; }}
        onMouseLeave={e => { if (!loggedIn) e.currentTarget.style.opacity = '0.12'; }}
      >
        {loggedIn && <span>🔒 관리자{statusLabel ? ` · ${statusLabel}` : ''}</span>}
      </button>

      {/* 모달 */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            style={{
              background: 'var(--color-bg-primary)', borderRadius: 16,
              padding: 28, maxWidth: 380, width: '100%', boxShadow: 'var(--shadow-xl)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 id="admin-modal-title" style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--color-text-primary)' }}>
              🔒 관리자 모드
            </h2>

            {!loggedIn ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
                  비밀번호를 입력하면 클라우드에 저장한 인사이트를 어느 기기에서나 불러올 수 있습니다.
                </p>
                <input
                  type="password"
                  value={pwInput}
                  autoFocus
                  placeholder="비밀번호"
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleLogin(); }}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                    border: '1px solid var(--color-border)', borderRadius: 8,
                    fontSize: 14, background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)',
                  }}
                />
                {status === 'error' && message && (
                  <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '8px 0 0' }}>{message}</p>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setOpen(false)}>취소</button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => void handleLogin()}
                    disabled={status === 'loading' || !pwInput.trim()}
                  >
                    {status === 'loading' ? '확인 중…' : '입장'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 4px', lineHeight: 1.6 }}>
                  관리자 모드가 켜져 있습니다. 바구니에 담는 내용이 자동으로 클라우드에 저장됩니다.
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 16px' }}>
                  {statusLabel}{message ? ` — ${message}` : ''}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-outline" onClick={() => void handleSaveNow()} disabled={status === 'syncing'}>
                    💾 지금 저장
                  </button>
                  <button className="btn btn-outline" onClick={() => void handleReload()} disabled={status === 'loading'}>
                    ↻ 클라우드에서 다시 불러오기
                  </button>
                  <button className="btn btn-ghost" onClick={handleLogout} style={{ color: 'var(--color-danger)' }}>
                    로그아웃
                  </button>
                </div>
                <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => setOpen(false)}>
                  닫기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
