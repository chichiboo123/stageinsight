import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error - 서버 전용 mjs 모듈 (타입 선언 불필요)
import { aiDevPlugin } from './server/vite-plugin-ai-dev.mjs';
// @ts-expect-error - 서버 전용 mjs 모듈 (타입 선언 불필요)
import { shareDevPlugin } from './server/vite-plugin-share-dev.mjs';
// @ts-expect-error - 서버 전용 mjs 모듈 (타입 선언 불필요)
import { adminDevPlugin } from './server/vite-plugin-admin-dev.mjs';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), aiDevPlugin(), shareDevPlugin(), adminDevPlugin()],
  server: {
    proxy: {
      // KOPIS 포스터 이미지 CORS 우회 (개발 환경) — 더 구체적인 경로를 먼저 둔다
      '/api/kopis-img': {
        target: 'http://www.kopis.or.kr/upload',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/kopis-img/, ''),
      },
      // KOPIS API CORS 우회 (개발 환경)
      '/api/kopis': {
        target: 'http://www.kopis.or.kr/openApi/restful',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/kopis/, ''),
      },
      // 네이버 도서 API CORS 우회 (개발 환경)
      '/api/naver': {
        target: 'https://openapi.naver.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/naver/, ''),
      },
    },
  },
});
