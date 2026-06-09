/**
 * 관리자 전용 인사이트 저장소 — 클라이언트 호출부
 * ────────────────────────────────────────────────────────────
 * 서버 함수(/api/admin)에 비밀번호를 헤더로 보내 본인 인증을 거친 뒤,
 * "나만의 클라우드 바구니"를 불러오거나(GET) 저장한다(POST).
 *
 * 비밀번호는 헤더(X-Admin-Password)로만 전송하며, 앱 어디에도 평문으로 박아두지 않는다.
 */

import type { InsightBoard } from '../types';

const ENDPOINT = '/api/admin';

const EMPTY: InsightBoard = { items: [], memos: [] };

function isBoard(value: unknown): value is InsightBoard {
  const b = value as InsightBoard | null;
  return !!b && Array.isArray(b.items) && Array.isArray(b.memos);
}

/**
 * 비밀번호로 로그인하면서 저장된 보드를 불러온다.
 * - 비밀번호가 틀리면 에러를 던진다(401).
 * - 한 번도 저장한 적이 없으면 빈 보드를 돌려준다.
 */
export async function adminLogin(password: string): Promise<InsightBoard> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { headers: { 'X-Admin-Password': password } });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (res.status === 401) throw new Error('비밀번호가 올바르지 않습니다.');
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ? String(detail.error) : `서버 오류 (${res.status})`);
  }
  const board = await res.json().catch(() => null);
  return isBoard(board) ? board : EMPTY;
}

/**
 * 현재 보드를 클라우드에 저장(덮어쓰기)한다.
 * @returns 서버가 기록한 저장 시각(ISO 문자열)
 */
export async function adminSave(password: string, board: InsightBoard): Promise<string> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
      body: JSON.stringify({ items: board.items, memos: board.memos }),
    });
  } catch {
    throw new Error('서버에 연결할 수 없어 저장하지 못했습니다.');
  }
  if (res.status === 401) throw new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ? String(detail.error) : `저장 실패 (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  return (data as { savedAt?: string })?.savedAt ?? new Date().toISOString();
}
