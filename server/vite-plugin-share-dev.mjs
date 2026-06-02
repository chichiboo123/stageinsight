/**
 * Vite 개발 서버용 공유 링크 미들웨어
 * - `npm run dev`에서도 /api/share 가 동작하도록 한다.
 * - 운영(Netlify Blobs) 대신 인메모리 Map에 저장한다(개발 세션 한정).
 */

export function shareDevPlugin() {
  const store = new Map();
  const genId = () =>
    Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);

  return {
    name: 'share-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/share', (req, res) => {
        const send = (status, obj) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(obj));
        };

        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://localhost');
          const id = url.searchParams.get('id');
          const board = id && store.get(id);
          if (!board) return send(404, { error: 'not found' });
          return send(200, board);
        }

        if (req.method === 'POST') {
          let raw = '';
          req.on('data', c => { raw += c; });
          req.on('end', () => {
            let board;
            try { board = raw ? JSON.parse(raw) : null; }
            catch { return send(400, { error: 'invalid json' }); }
            if (!board || !Array.isArray(board.items) || !Array.isArray(board.memos)) {
              return send(400, { error: 'invalid board' });
            }
            const id = genId();
            store.set(id, { items: board.items, memos: board.memos });
            send(200, { id });
          });
          return;
        }

        send(405, { error: 'Method Not Allowed' });
      });
    },
  };
}
