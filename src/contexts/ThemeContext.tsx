import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { ThemeKey, ThemeOption } from '../types';

// ---------- 테마 옵션 정의 ----------
export const THEME_OPTIONS: ThemeOption[] = [
  { key: 'pastel-blue',   label: '파스텔 블루',   preview: '#3B82F6' },
  { key: 'pastel-green',  label: '파스텔 그린',   preview: '#22C55E' },
  { key: 'pastel-yellow', label: '파스텔 옐로',   preview: '#EAB308' },
  { key: 'pastel-pink',   label: '파스텔 핑크',   preview: '#F43F5E' },
];

const STORAGE_KEY = 'stageinsight-theme';
const DEFAULT_THEME: ThemeKey = 'pastel-blue';

// ---------- Context 타입 ----------
interface ThemeContextValue {
  theme: ThemeKey;
  themeOptions: ThemeOption[];
  setTheme: (theme: ThemeKey) => void;
}

// ---------- Context 생성 ----------
const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  themeOptions: THEME_OPTIONS,
  setTheme: () => {},
});

// ---------- Provider ----------
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
    return saved && THEME_OPTIONS.some(o => o.key === saved) ? saved : DEFAULT_THEME;
  });

  // data-theme 속성을 document.documentElement에 적용
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeKey) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, themeOptions: THEME_OPTIONS, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ---------- Hook ----------
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
