/**
 * Vite 개발 서버용 관리자 저장소 미들웨어
 * - `npm run dev`에서도 /api/admin 이 동작하도록 한다.
 * - 운영(Netlify Blobs) 대신 인메모리 변수에 저장한다(개발 세션 한정 — 서버 재시작 시 초기화).
 * - 비밀번호는 환경변수 ADMIN_PASSWORD를 쓰되, 미설정 시 개발 편의를 위해 기본값을 사용한다.
 */

export function adminDevPlugin() {
  // 개발 세션 동안만 유지되는 단일 저장칸(운영의 고정 KEY에 대응).
  let board = { items: [], memos: [] };
  const password = process.env.ADMIN_PASSWORD || 'admin1234';

  return {
    name: 'admin-dev-middleware',
    configureServer(server) {
      if (!process.env.ADMIN_PASSWORD) {
        server.config.logger.warn(
          '[admin-dev] ADMIN_PASSWORD 환경변수가 없어 개발용 기본 비밀번호 "admin1234"를 사용합니다.',
        );
      }

      server.middlewares.use('/api/admin', (req, res) => {
        const send = (status, obj) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };

        const given = req.headers['x-admin-password'] || '';
        if (given !== password) return send(401, { error: '비밀번호가 올바르지 않습니다.' });

        if (req.method === 'GET') {
          return send(200, board);
        }

        if (req.method === 'POST') {
          let raw = '';
          req.on('data', c => { raw += c; });
          req.on('end', () => {
            let b;
            try { b = raw ? JSON.parse(raw) : null; }
            catch { return send(400, { error: 'invalid json' }); }
            if (!b || !Array.isArray(b.items) || !Array.isArray(b.memos)) {
              return send(400, { error: 'invalid board' });
            }
            board = { items: b.items, memos: b.memos };
            send(200, { ok: true, savedAt: new Date().toISOString() });
          });
          return;
        }

        send(405, { error: 'Method Not Allowed' });
      });
    },
  };
}
