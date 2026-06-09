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

import { connectLambda, getStore } from '@netlify/blobs';

const STORE = 'insight-shares';
// 긴 AI 수업 메모/여러 작품을 담아도 쿼리스트링 폴백으로 떨어지지 않도록
// 함수 payload 한도보다 낮은 선에서 넉넉히 허용한다.
const MAX_BYTES = 2 * 1024 * 1024; // 2MB 상한 (남용 방지)
const ID_PATTERN = /^[a-z0-9]{8,16}$/;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genId() {
  // 항상 정확히 10자 영숫자. URL은 짧게 유지하면서 충돌 가능성을 낮춘다.
  // (Math.random().toString(36).slice() 방식은 난수가 작을 때 길이가 들쭉날쭉해
  //  ID_PATTERN(8~16자) 검증을 깨뜨릴 수 있어 고정 길이로 생성한다.)
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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  let store;
  try {
    // 레거시 Lambda 핸들러(`export const handler = async (event) => ...`)는
    // Netlify Blobs 컨텍스트(siteID·token)를 자동 주입받지 못한다.
    // getStore() 전에 반드시 connectLambda(event)로 이벤트에서 컨텍스트를 연결해야
    // "MissingBlobsEnvironmentError" → 503 으로 떨어지지 않는다.
    connectLambda(event);
    // consistency: 'strong' — 기본 'eventual'은 쓰기가 모든 리전으로 전파되기 전엔
    // 다른 리전 조회에서 null을 돌려줘 "저장 성공 후 조회 404"가 발생한다.
    // 공유 링크는 작성 직후 다른 기기/사용자가 열기 때문에 강한 일관성이 필수다.
    store = getStore({ name: STORE, consistency: 'strong' });
  } catch (err) {
    return {
      statusCode: 503,
      headers: cors,
      body: JSON.stringify({ error: 'share store unavailable', detail: String(err?.message || err) }),
    };
  }

  // ── 조회 ──
  if (event.httpMethod === 'GET') {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'id required' }) };
    if (!ID_PATTERN.test(id)) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'invalid id' }) };
    try {
      const board = await store.get(id, { type: 'json' });
      // null = 실제로 존재하지 않는 id → 404.
      if (!board) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'not found' }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify(board) };
    } catch (err) {
      // Blobs 조회 자체가 실패한 경우(일관성·네트워크 등)는 404로 감추지 않고
      // 503으로 실제 원인을 노출해 진단을 가능하게 한다.
      return {
        statusCode: 503,
        headers: cors,
        body: JSON.stringify({ error: 'store read failed', detail: String(err?.message || err) }),
      };
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
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const id = genId();
        const existing = await store.get(id);
        if (existing) continue;
        await store.set(id, JSON.stringify({ items: board.items, memos: board.memos }));
        return { statusCode: 200, headers: cors, body: JSON.stringify({ id }) };
      }
    } catch (err) {
      return {
        statusCode: 503,
        headers: cors,
        body: JSON.stringify({ error: 'store failed', detail: String(err?.message || err) }),
      };
    }
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'id collision' }) };
  }

  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
