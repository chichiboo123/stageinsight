/**
 * Netlify Function — 관리자 전용 인사이트 저장소 (나만의 클라우드 바구니)
 * 경로: /api/admin  →  /.netlify/functions/admin  (netlify.toml redirect)
 *
 * 공유 링크(share.mjs)가 "누구나 열 수 있는 임의 id"를 쓰는 것과 달리,
 * 관리자 저장소는 항상 고정된 한 칸(KEY)에 저장한다. 대신 매 요청마다
 * 비밀번호(서버 환경변수 ADMIN_PASSWORD)를 검사해 본인만 접근할 수 있다.
 *
 * - GET   (헤더 X-Admin-Password)            → 저장된 보드 JSON 반환 (= 로그인 + 불러오기)
 * - POST  (헤더 X-Admin-Password, body=보드) → 보드를 저장(덮어쓰기)
 *
 * 비밀번호는 코드가 아니라 Netlify 환경변수에 둔다(소스에 노출 금지).
 * share.mjs와 동일하게 모던 함수 형식을 써서 강한 일관성 읽기를 지원한다.
 */

import { getStore } from '@netlify/blobs';

const STORE = 'insight-admin';
const KEY = 'board';                 // 항상 이 한 칸에만 저장한다(나만의 저장소).
const MAX_BYTES = 4 * 1024 * 1024;   // 4MB 상한 (여러 작품·긴 수업 메모 대비)

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: cors });

/** 요청의 비밀번호가 환경변수와 일치하는지 검사한다. */
function checkPassword(req) {
  const expected = process.env.ADMIN_PASSWORD;
  // 환경변수 미설정 시 "아무 비밀번호나 통과"되는 사고를 막기 위해 명시적으로 차단한다.
  if (!expected) return { ok: false, status: 503, error: '관리자 비밀번호가 서버에 설정되지 않았습니다.' };
  const given = req.headers.get('x-admin-password') || '';
  if (given !== expected) return { ok: false, status: 401, error: '비밀번호가 올바르지 않습니다.' };
  return { ok: true };
}

/**
 * 강한 일관성으로 읽되, 환경에 uncachedEdgeURL이 없으면(BlobsConsistencyError)
 * 일반(eventual) 읽기로 폴백한다. (share.mjs와 동일한 전략)
 * 강한 일관성은 "한 기기에서 저장한 직후 다른 기기에서 즉시 열어도 최신값"을 보장한다.
 */
async function readBoard(store) {
  try {
    return await store.get(KEY, { type: 'json', consistency: 'strong' });
  } catch (err) {
    if (err?.name === 'BlobsConsistencyError') {
      return await store.get(KEY, { type: 'json' });
    }
    throw err;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  // 모든 요청은 먼저 비밀번호 검사를 통과해야 한다.
  const auth = checkPassword(req);
  if (!auth.ok) return json(auth.status, { error: auth.error });

  let store;
  try {
    store = getStore(STORE);
  } catch (err) {
    return json(503, { error: '관리자 저장소를 사용할 수 없습니다.', detail: String(err?.message || err) });
  }

  // ── 불러오기 (로그인 검증 겸용) ──
  if (req.method === 'GET') {
    let board;
    try {
      board = await readBoard(store);
    } catch (err) {
      return json(503, { error: '저장소 읽기 실패', detail: String(err?.message || err) });
    }
    // 아직 한 번도 저장한 적이 없으면 빈 보드를 돌려준다(404 아님).
    return json(200, board ?? { items: [], memos: [] });
  }

  // ── 저장(덮어쓰기) ──
  if (req.method === 'POST') {
    let raw;
    try {
      raw = await req.text();
    } catch {
      return json(400, { error: 'invalid body' });
    }
    if (raw.length > MAX_BYTES) return json(413, { error: '저장 용량이 너무 큽니다.' });
    let board;
    try {
      board = raw ? JSON.parse(raw) : null;
    } catch {
      return json(400, { error: 'invalid json' });
    }
    if (!board || !Array.isArray(board.items) || !Array.isArray(board.memos)) {
      return json(400, { error: 'invalid board' });
    }
    try {
      await store.set(KEY, JSON.stringify({ items: board.items, memos: board.memos }));
    } catch (err) {
      return json(503, { error: '저장 실패', detail: String(err?.message || err) });
    }
    return json(200, { ok: true, savedAt: new Date().toISOString() });
  }

  return json(405, { error: 'Method Not Allowed' });
};
