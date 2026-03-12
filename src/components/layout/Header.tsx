
import { useTheme, THEME_OPTIONS } from '../../contexts/ThemeContext';
import type { ThemeKey } from '../../types';
import styles from './Header.module.css';

interface HeaderProps {
  onHomeClick: () => void;
  onInsightClick: () => void;
  insightCount: number;
}

export function Header({ onHomeClick, onInsightClick, insightCount }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* 로고 — 클릭 시 홈으로 */}
        <button className={styles.logo} onClick={onHomeClick} aria-label="홈으로 이동">
          <span className={styles.logoIcon}>🎭</span>
          <span className={styles.logoText}>여기 있어 공연장</span>
        </button>

        {/* 우측 컨트롤 */}
        <div className={styles.controls}>
          {/* 테마 선택 */}
          <div className={styles.themeSelector} role="group" aria-label="테마 선택">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.key}
                className={`${styles.themeBtn} ${theme === opt.key ? styles.themeBtnActive : ''}`}
                style={{ '--theme-color': opt.preview } as React.CSSProperties}
                onClick={() => setTheme(opt.key as ThemeKey)}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={theme === opt.key}
              />
            ))}
          </div>

          {/* 인사이트 보드 버튼 */}
          <button
            className={`btn btn-primary ${styles.insightBtn}`}
            onClick={onInsightClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            인사이트
            {insightCount > 0 && (
              <span className={styles.badge}>{insightCount}</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
