/**
 * Netlify Function — 인사이트 바구니 공유 단축 링크
 * 경로: /api/share  →  /.netlify/functions/share  (netlify.toml redirect)
 *
 * - POST { items, memos }  → Netlify Blobs에 저장하고 짧은 id 반환 → 공유 URL은 ?s=<id>
 * - GET  ?id=<id>          → 저장된 보드 JSON 반환
 *
 * Netlify Blobs는 별도 설정 없이 사용 가능하며, 실패 시 클라이언트가
 * 기존 긴 ?share= base64 링크로 자동 폴백한다.
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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  let store;
  try {
    store = getStore(STORE);
  } catch (err) {
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'share store unavailable' }) };
  }

  // ── 조회 ──
  if (event.httpMethod === 'GET') {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id required' }) };
    try {
      const board = await store.get(id, { type: 'json' });
      if (!board) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'not found' }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(board) };
    } catch {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'not found' }) };
    }
  }

  // ── 저장 ──
  if (event.httpMethod === 'POST') {
    if (event.body && event.body.length > MAX_BYTES) {
      return { statusCode: 413, headers: cors, body: JSON.stringify({ error: 'too large' }) };
    }
    let board;
    try {
      board = event.body ? JSON.parse(event.body) : null;
    } catch {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'invalid json' }) };
    }
    if (!board || !Array.isArray(board.items) || !Array.isArray(board.memos)) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'invalid board' }) };
    }
    const id = genId();
    try {
      await store.set(id, JSON.stringify({ items: board.items, memos: board.memos }));
    } catch {
      return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'store failed' }) };
    }
    return { statusCode: 200, headers: cors, body: JSON.stringify({ id }) };
  }

  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
