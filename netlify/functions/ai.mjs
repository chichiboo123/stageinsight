/**
 * Netlify Function — AI 게이트웨이 (운영 환경)
 * 경로: /api/ai/<handler>  →  /.netlify/functions/ai/<handler>  (netlify.toml redirect)
 *
 * GEMINI_API_KEY는 Netlify 환경변수(서버 전용)로만 주입한다.
 */

import { HANDLERS } from './_handlers.mjs';
import { GeminiError } from './_gemini.mjs';

export const handler = async (event) => {
  const cors = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  // 핸들러 이름: 경로 마지막 세그먼트 → 쿼리(h) → body(__handler) 순으로 안정적으로 해석
  const name =
    (event.path || '').split('/').filter(Boolean).pop()
    || event.queryStringParameters?.h
    || body.__handler;
  const fn = HANDLERS[name];
  if (!fn) {
    return { statusCode: 404, headers: cors, body: JSON.stringify({ error: `Unknown AI handler: ${name}` }) };
  }

  try {
    const result = await fn(body, process.env.GEMINI_API_KEY);
    return { statusCode: 200, headers: cors, body: JSON.stringify(result) };
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 500;
    // Netlify 함수 로그에 원인을 남겨 진단 가능하게 한다.
    console.error(`[ai] '${name}' 처리 실패 (status ${status}):`, err?.message ?? err);
    return { statusCode: status, headers: cors, body: JSON.stringify({ error: err?.message ?? 'AI 처리 실패' }) };
  }
};
