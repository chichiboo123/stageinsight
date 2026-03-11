import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// 초기 테마 적용 (CSS Variables가 깜빡이지 않도록)
const savedTheme = localStorage.getItem('stageinsight-theme') ?? 'pastel-blue';
document.documentElement.setAttribute('data-theme', savedTheme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
