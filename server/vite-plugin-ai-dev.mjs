/**
 * Vite 개발 서버용 AI 미들웨어
 * - `npm run dev` 환경에서도 /api/ai/* 엔드포인트가 동작하도록 한다.
 * - 운영(Netlify Functions)과 동일한 핸들러를 재사용한다.
 * - GEMINI_API_KEY는 .env(또는 셸 env)에서 읽으며 클라이언트로 노출되지 않는다.
 */

import { loadEnv } from 'vite';
// 운영(Netlify Functions)과 동일한 핸들러를 재사용한다.
import { HANDLERS } from '../netlify/functions/_handlers.mjs';
import { GeminiError } from '../netlify/functions/_gemini.mjs';

export function aiDevPlugin() {
  return {
    name: 'ai-dev-middleware',
    configureServer(server) {
      // VITE_ 접두사 없는 변수까지 모두 로드 (서버 전용 키 포함)
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

      server.middlewares.use('/api/ai', async (req, res) => {
        const name = (req.url || '').split('?')[0].split('/').filter(Boolean).pop();
        const fn = HANDLERS[name];
        const send = (status, obj) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };

        if (req.method !== 'POST') return send(405, { error: 'Method Not Allowed' });
        if (!fn) return send(404, { error: `Unknown AI handler: ${name}` });

        let raw = '';
        req.on('data', chunk => { raw += chunk; });
        req.on('end', async () => {
          let body;
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            return send(400, { error: 'Invalid JSON body' });
          }
          try {
            const result = await fn(body, apiKey);
            send(200, result);
          } catch (err) {
            const status = err instanceof GeminiError ? err.status : 500;
            send(status, { error: err?.message ?? 'AI 처리 실패' });
          }
        });
      });
    },
  };
}
