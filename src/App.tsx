import { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { HomePage } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightPage } from './pages/InsightPage';
import type { School, Venue, InsightBoard } from './types';

export type Page = 'home' | 'map' | 'dashboard' | 'insight';
const VALID_PAGES: Page[] = ['home', 'map', 'dashboard', 'insight'];
const PAGE_KEY = 'stageinsight-page';

const HELP_CONTENT = [
  { step: '1', title: '학교 검색', desc: '홈 화면에서 학교 이름을 검색하세요. 유치원·초·중·고 모두 지원합니다.' },
  { step: '2', title: '공연장 선택', desc: '학교 주변 공연장이 자동으로 표시됩니다. 공연장 카드를 클릭하세요.' },
  { step: '3', title: '공연 선택', desc: '공연 대시보드에서 현재 공연 목록을 확인하고 원하는 공연을 선택하세요.' },
  { step: '4', title: '교육과정 연계', desc: '공연 선택 시 성취기준·연계 영화·도서가 자동으로 표시됩니다. 학년군·교과 필터로 좁힐 수 있습니다.' },
  { step: '5', title: '인사이트 바구니 담기', desc: '북마크 버튼으로 공연·성취기준·영화·도서를 인사이트 바구니에 담으세요.' },
  { step: '6', title: '메모 작성', desc: '인사이트 바구니에서 공연별 메모를 작성하고 정리할 수 있습니다.' },
  { step: '7', title: '내보내기', desc: '이미지·PDF 저장, 클립보드 복사, URL 공유가 가능합니다. 💾 버튼으로 JSON 파일 저장/불러오기도 지원합니다.' },
];

function AppInner() {
  const { state, selectSchool, selectVenue, loadInsightBoard } = useApp();
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 페이지 상태 (localStorage 초기화 + 유효성 검사) ──
  const [page, setPageState] = useState<Page>(() => {
    // URL share 파라미터가 있으면 insight 페이지로 시작
    if (new URLSearchParams(window.location.search).has('share')) return 'insight';
    const saved = localStorage.getItem(PAGE_KEY) as Page | null;
    // 학교나 공연장이 없으면 map/dashboard로 복원하지 않음
    if (saved === 'map' && !state.selectedSchool) return 'home';
    if (saved === 'dashboard' && !state.selectedVenue) return saved === 'dashboard' ? 'map' : 'home';
    return saved && VALID_PAGES.includes(saved) ? saved : 'home';
  });

  // 인사이트 바구니를 열기 전 페이지 기억 (뒤로가기용)
  const prevPageRef = useRef<Page>('home');

  // ── URL share 초기 로드 ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('share');
    if (shareParam) {
      try {
        // URL-safe base64 복원 (- → +, _ → /) 후 패딩 추가
        const restored = shareParam.replace(/-/g, '+').replace(/_/g, '/');
        const padded = restored + '='.repeat((4 - restored.length % 4) % 4);
        const decoded = JSON.parse(decodeURIComponent(escape(atob(padded)))) as InsightBoard;
        if (decoded && Array.isArray(decoded.items) && Array.isArray(decoded.memos)) {
          loadInsightBoard(decoded);
        }
      } catch {
        // 구버전 표준 base64 fallback
        try {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(shareParam)))) as InsightBoard;
          if (decoded && Array.isArray(decoded.items) && Array.isArray(decoded.memos)) {
            loadInsightBoard(decoded);
          }
        } catch {
          try {
            const decoded = JSON.parse(atob(shareParam)) as InsightBoard;
            if (decoded && Array.isArray(decoded.items) && Array.isArray(decoded.memos)) {
              loadInsightBoard(decoded);
            }
          } catch { /* invalid share data */ }
        }
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── History API ──
  const navigateTo = useCallback((newPage: Page) => {
    localStorage.setItem(PAGE_KEY, newPage);
    history.pushState({ page: newPage }, '');
    setPageState(newPage);
  }, []);

  useEffect(() => {
    // 앱 시작 시 현재 페이지로 replaceState
    history.replaceState({ page }, '');

    function handlePopState(e: PopStateEvent) {
      const prev = e.state?.page as Page | undefined;
      const target = prev && VALID_PAGES.includes(prev) ? prev : 'home';
      localStorage.setItem(PAGE_KEY, target);
      setPageState(target);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 네비게이션 핸들러 ──
  function handleSchoolSelect(school: School) {
    selectSchool(school);
    // 홈 페이지에서 공연장 목록이 바로 표시되므로 페이지 전환 없음
  }

  function handleVenueSelect(venue: Venue) {
    selectVenue(venue);
    navigateTo('dashboard');
  }

  function handleGoToHome() {
    selectSchool(null);
    navigateTo('home');
  }

  function handleGoToMap() {
    selectVenue(null);
    navigateTo('home');  // 공연장 목록은 홈 페이지에 인라인으로 표시
  }

  // ── JSON 저장/불러오기 ──
  function handleSaveJSON() {
    const json = JSON.stringify(state.insightBoard, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '인사이트바구니.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleLoadJSONFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as InsightBoard;
        if (data && Array.isArray(data.items) && Array.isArray(data.memos)) {
          loadInsightBoard(data);
        }
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const insightCount = state.insightBoard.items.length + state.insightBoard.memos.length;

  return (
    <>
      <Header
        onHomeClick={handleGoToHome}
        onInsightClick={() => {
          if (page !== 'insight') {
            prevPageRef.current = page;
            navigateTo('insight');
          } else {
            navigateTo(prevPageRef.current);
          }
        }}
        insightCount={insightCount}
        onSaveJSON={handleSaveJSON}
        onLoadJSON={() => fileInputRef.current?.click()}
        onHelpClick={() => setShowHelp(true)}
      />

      <div style={{ flex: 1 }}>
        {page === 'home'      && <HomePage onSchoolSelect={handleSchoolSelect} onVenueSelect={handleVenueSelect} />}
        {page === 'map'       && <MapPage onVenueSelect={handleVenueSelect} onGoToHome={handleGoToHome} />}
        {page === 'dashboard' && <DashboardPage onGoToMap={handleGoToMap} />}
        {page === 'insight'   && (
          <InsightPage onBack={() => navigateTo(prevPageRef.current)} />
        )}
      </div>

      {/* 푸터 */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '14px 0 16px',
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--color-text-muted)',
      }}>
        created by.{' '}
        <a
          href="https://litt.ly/chichiboo"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-accent-primary)', textDecoration: 'none' }}
        >
          교육뮤지컬 꿈꾸는 치수쌤
        </a>
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-muted)', opacity: 0.75 }}>
          데이터 출처: KOPIS(공연예술통합전산망) · 카카오맵 API · NAVER Search API · TMDB
        </div>
      </footer>

      {/* 사용법 모달 */}
      {showHelp && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              background: 'var(--color-bg-primary)', borderRadius: '16px',
              padding: '32px', maxWidth: '520px', width: '100%', maxHeight: '90vh',
              overflow: 'auto', boxShadow: 'var(--shadow-xl)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
              📖 사용법
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {HELP_CONTENT.map(({ step, title, desc }) => (
                <div key={step} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span style={{
                    flexShrink: 0, width: '28px', height: '28px', borderRadius: '50%',
                    background: 'var(--color-accent-primary)', color: 'var(--color-text-on-accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: 700,
                  }}>{step}</span>
                  <div>
                    <strong style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>{title}</strong>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* 면책 조항 */}
            <div style={{
              marginTop: '20px', padding: '14px 16px',
              background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)',
              borderLeft: '3px solid var(--color-accent-primary)',
            }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
                본 서비스의 성취기준 및 연계 자료(영화, 도서) 추천 기능에는 별도의 AI 기술이 포함되어 있지 않습니다.
                이는 작품명의 핵심 키워드를 기반으로 한 매칭 시스템으로, 기계적인 추출 특성상 추천 결과가 교육적 의도와
                완벽히 일치하지 않을 수 있습니다. 수업 설계 시 반드시 내용을 재확인하시고 단순 참고용으로 활용해 주시기 바랍니다.
              </p>
            </div>

            {/* API 출처 */}
            <div style={{
              marginTop: '16px', padding: '12px 14px',
              background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)',
            }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                데이터 출처
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {[
                  { label: 'KOPIS', desc: '공연예술통합전산망 — 공연·공연장 정보' },
                  { label: '카카오맵 API', desc: '학교·공연장 위치 검색 및 경로 안내' },
                  { label: 'NAVER Search API', desc: '연계 도서 검색' },
                  { label: 'TMDB', desc: '연계 영화 검색' },
                ].map(({ label, desc }) => (
                  <span key={label} style={{
                    fontSize: '11px', color: 'var(--color-text-secondary)',
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                    borderRadius: '6px', padding: '3px 8px',
                  }} title={desc}>
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* 개발자 정보 */}
            <p style={{ marginTop: '14px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              개발자:{' '}
              <a
                href="https://litt.ly/chichiboo"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--color-accent-primary)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
              >
                교육뮤지컬을 꿈꾸는 치수쌤
              </a>
            </p>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => setShowHelp(false)}>
              확인
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleLoadJSONFile}
      />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </ThemeProvider>
  );
}
