import { useEffect } from 'react';

/**
 * 모달 공통 동작 훅
 * - Escape 키로 닫기 (키보드 사용자가 모달에서 빠져나올 수 있어야 함 — WCAG 2.1.2)
 * - 열려 있는 동안 배경(body) 스크롤 잠금 — 특히 모바일에서 모달 뒤 페이지가
 *   함께 스크롤되는 불편을 방지한다.
 */
export function useModalDismiss(onClose: () => void) {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
}
