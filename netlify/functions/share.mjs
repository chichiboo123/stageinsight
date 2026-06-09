/**
 * Netlify Function — 인사이트 바구니 공유 단축 링크 (모던 함수 형식)
 * 경로: /api/share  →  /.netlify/functions/share  (netlify.toml redirect)
 *
 * - POST { items, memos }  → Netlify Blobs에 저장하고 짧은 id 반환 → 공유 URL은 ?s=<id>
 * - GET  ?id=<id>          → 저장된 보드 JSON 반환
 *
 * 모던 함수 형식(`export default async (req) => Response`)을 사용한다.
 * 레거시 Lambda 형식(`export const handler`)은 connectLambda(event)로
 * Blobs 컨텍스트를 직접 연결해야 하는데, 그 컨텍스트에는 강한 일관성 읽기에
 * 필요한 'uncachedEdgeURL'이 빠져 있어 consistency:'strong'을 쓸 수 없다.
 * 모던 형식은 런타임이 전체 Blobs 컨텍스트(edge + uncached URL)를 자동 주입하므로
 * getStore()가 별도 설정 없이 동작하고 강한 일관성도 사용할 수 있다.
 */

import { getStore } from '@netlify/blobs';

const STORE = 'insight-shares';
// 긴 AI 수업 메모/여러 작품을 담아도 쿼리스트링 폴백으로 떨어지지 않도록
// 함수 payload 한도보다 낮은 선에서 넉넉히 허용한다.
const MAX_BYTES = 2 * 1024 * 1024; // 2MB 상한 (남용 방지)
const ID_PATTERN = /^[a-z0-9]{8,16}$/;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genId() {
  // 항상 정확히 10자 영숫자. URL은 짧게 유지하면서 충돌 가능성을 낮춘다.
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return id;
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: cors });

/**
 * 강한 일관성으로 읽되, 환경에 uncachedEdgeURL이 없어 강한 일관성을 못 쓰는
 * 경우(BlobsConsistencyError)에는 일반(eventual) 읽기로 안전하게 폴백한다.
 * 강한 일관성은 "저장 직후 다른 기기/사용자가 즉시 열어도 404가 나지 않게" 해준다.
 */
async function readBoard(store, id) {
  try {
    return await store.get(id, { type: 'json', consistency: 'strong' });
  } catch (err) {
    if (err?.name === 'BlobsConsistencyError') {
      return await store.get(id, { type: 'json' });
    }
    throw err;
  }
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  let store;
  try {
    store = getStore(STORE);
  } catch (err) {
    return json(503, { error: 'share store unavailable', detail: String(err?.message || err) });
  }

  // ── 조회 ──
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json(400, { error: 'id required' });
    if (!ID_PATTERN.test(id)) return json(400, { error: 'invalid id' });
    let board;
    try {
      board = await readBoard(store, id);
    } catch (err) {
      // 조회 자체가 실패한 경우는 404로 감추지 않고 503 + detail로 노출한다.
      return json(503, { error: 'store read failed', detail: String(err?.message || err) });
    }
    if (!board) return json(404, { error: 'not found' });
    return json(200, board);
  }

  // ── 저장 ──
  if (req.method === 'POST') {
    let raw;
    try {
      raw = await req.text();
    } catch {
      return json(400, { error: 'invalid body' });
    }
    if (raw.length > MAX_BYTES) return json(413, { error: 'too large' });
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
      for (let attempt = 0; attempt < 5; attempt++) {
        const id = genId();
        // 충돌 검사는 일반(eventual) 읽기로 충분하다.
        const existing = await store.get(id);
        if (existing) continue;
        await store.set(id, JSON.stringify({ items: board.items, memos: board.memos }));
        return json(200, { id });
      }
    } catch (err) {
      return json(503, { error: 'store failed', detail: String(err?.message || err) });
    }
    return json(503, { error: 'id collision' });
  }

  return json(405, { error: 'Method Not Allowed' });
};
