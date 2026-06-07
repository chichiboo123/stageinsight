/**
 * Netlify Function (v2) — 인사이트 바구니 공유 단축 링크
 * 경로: /api/share  →  /.netlify/functions/share  (netlify.toml redirect)
 *
 * - POST { items, memos }  → Netlify Blobs에 저장하고 짧은 id 반환 → 공유 URL은 ?s=<id>
 * - GET  ?id=<id>          → 저장된 보드 JSON 반환
 *
 * ★ 왜 v2(`export default async (req)`) 시그니처인가
 *   레거시 v1(`export const handler = (event)`)에서는 @netlify/blobs의 getStore()가
 *   자동 구성되지 않아 "environment has not been configured to use Netlify Blobs"
 *   예외가 나고, 그러면 단축 링크 생성이 매번 실패해 클라이언트가 거대한 ?z= 링크로
 *   폴백한다(다른 기기에서 URL이 너무 길어 414 발생). v2 함수는 Blobs가 자동 구성되므로
 *   별도 siteID/token 없이 단축 링크가 안정적으로 동작한다.
 *   Blobs 자체가 불가한 환경이면 503을 반환해 클라이언트가 우아하게 폴백한다.
 */

import { getStore } from '@netlify/blobs';

const STORE = 'insight-shares';
const MAX_BYTES = 256 * 1024; // 256KB 상한 (남용 방지)

function genId() {
  // 8자 영숫자 (충돌 가능성 사실상 무시 가능한 규모)
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
}

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: cors });

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  let store;
  try {
    store = getStore(STORE);
  } catch (err) {
    console.error('[share] Blobs 구성 실패:', err?.message ?? err);
    return json(503, { error: 'share store unavailable' });
  }

  // ── 조회 ──
  if (req.method === 'GET') {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return json(400, { error: 'id required' });
    try {
      const board = await store.get(id, { type: 'json' });
      if (!board) return json(404, { error: 'not found' });
      return json(200, board);
    } catch {
      return json(404, { error: 'not found' });
    }
  }

  // ── 저장 ──
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json(413, { error: 'too large' });
    let board;
    try {
      board = text ? JSON.parse(text) : null;
    } catch {
      return json(400, { error: 'invalid json' });
    }
    if (!board || !Array.isArray(board.items) || !Array.isArray(board.memos)) {
      return json(400, { error: 'invalid board' });
    }
    const id = genId();
    try {
      await store.set(id, JSON.stringify({ items: board.items, memos: board.memos }));
    } catch (err) {
      console.error('[share] 저장 실패:', err?.message ?? err);
      return json(503, { error: 'store failed' });
    }
    return json(200, { id });
  }

  return json(405, { error: 'Method Not Allowed' });
};
