
import { useState, useRef, useEffect } from 'react';
import { useTheme, THEME_OPTIONS } from '../../contexts/ThemeContext';
import type { ThemeKey } from '../../types';
import styles from './Header.module.css';

interface HeaderProps {
  onHomeClick: () => void;
  onInsightClick: () => void;
  insightCount: number;
  onSaveJSON: () => void;
  onLoadJSON: () => void;
  onHelpClick: () => void;
}

// 위치 핀 아이콘 SVG (free-icon-location-6649508 스타일)
function LocationIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="var(--color-accent-primary)"
        d="M32 2C20.954 2 12 10.954 12 22c0 17.673 20 42 20 42S52 39.673 52 22C52 10.954 43.046 2 32 2zm0 28c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z"
      />
    </svg>
  );
}

export function Header({ onHomeClick, onInsightClick, insightCount, onSaveJSON, onLoadJSON, onHelpClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 테마 드롭다운 닫기
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    if (themeOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [themeOpen]);

  const currentTheme = THEME_OPTIONS.find(o => o.key === theme);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* 로고 */}
        <button className={styles.logo} onClick={onHomeClick} aria-label="홈으로 이동">
          <LocationIcon />
          <span className={styles.logoText}>여기 있어 공연장</span>
        </button>

        {/* 우측 컨트롤 */}
        <div className={styles.controls}>
          {/* 테마 드롭다운 */}
          <div className={styles.themeDropdown} ref={themeRef}>
            <button
              className={styles.themeToggleBtn}
              onClick={() => setThemeOpen(o => !o)}
              title="테마 변경"
              aria-label="테마 변경"
              aria-expanded={themeOpen}
            >
              <span
                className={styles.themeColorDot}
                style={{ background: currentTheme?.preview ?? '#3B82F6' }}
              />
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ opacity: 0.6 }}>
                <path d="M6 8L1 3h10z"/>
              </svg>
            </button>
            {themeOpen && (
              <div className={styles.themeMenu}>
                {THEME_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    className={`${styles.themeMenuItem} ${theme === opt.key ? styles.themeMenuItemActive : ''}`}
                    onClick={() => { setTheme(opt.key as ThemeKey); setThemeOpen(false); }}
                  >
                    <span className={styles.themeMenuDot} style={{ background: opt.preview }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* JSON 저장/불러오기 */}
          <div className={styles.jsonBtns}>
            <button
              className={styles.iconBtn}
              onClick={onSaveJSON}
              title="장바구니 JSON 저장"
              aria-label="JSON 저장"
            >
              {/* 플로피 디스크 아이콘 */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            </button>
            <button
              className={styles.iconBtn}
              onClick={onLoadJSON}
              title="장바구니 JSON 불러오기"
              aria-label="JSON 불러오기"
            >
              {/* 업로드 아이콘 */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>
          </div>

          {/* 장바구니 버튼 */}
          <button
            className={`btn btn-primary ${styles.cartBtn}`}
            onClick={onInsightClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            <span>장바구니</span>
            {insightCount > 0 && (
              <span className={styles.badge}>{insightCount}</span>
            )}
          </button>

          {/* 사용법 버튼 */}
          <button
            className={`btn btn-outline ${styles.helpBtn}`}
            onClick={onHelpClick}
            title="사용법 안내"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>사용법</span>
          </button>
        </div>
      </div>
    </header>
  );
}
