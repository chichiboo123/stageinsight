/**
 * Vite 개발 서버용 공유 링크 미들웨어
 * - `npm run dev`에서도 /api/share 가 동작하도록 한다.
 * - 운영(Netlify Blobs) 대신 인메모리 Map에 저장한다(개발 세션 한정).
 */

export function shareDevPlugin() {
  const store = new Map();
  const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const genId = () => {
    // 운영(share.mjs)과 동일하게 항상 10자 영숫자로 생성한다.
    let id = '';
    for (let i = 0; i < 10; i++) id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    return id;
  };
  const isValidId = id => /^[a-z0-9]{8,16}$/.test(id);

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
          if (!id || !isValidId(id)) return send(400, { error: 'invalid id' });
          const board = store.get(id);
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
            let id = genId();
            while (store.has(id)) id = genId();
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
