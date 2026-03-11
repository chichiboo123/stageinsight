import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '/stageinsight/',
  plugins: [react()],
  server: {
    proxy: {
      // 네이버 도서 API CORS 우회 (개발 환경)
      '/api/naver': {
        target: 'https://openapi.naver.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/naver/, ''),
      },
    },
  },
});
