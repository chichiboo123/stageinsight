import { useRef, useEffect } from 'react';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder = '학교 이름을 입력하세요',
  loading = false,
  onClear,
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div className={styles.wrapper}>
      {/* 검색 아이콘 */}
      <span className={styles.iconLeft} aria-hidden="true">
        {loading ? (
          <span className={styles.spinner} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        )}
      </span>

      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
      />

      {/* 클리어 버튼 */}
      {value && onClear && (
        <button
          className={styles.clearBtn}
          onClick={onClear}
          aria-label="검색어 지우기"
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}
