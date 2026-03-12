import { useState, useRef } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { HomePage } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightPage } from './pages/InsightPage';
import type { School, Venue, InsightBoard } from './types';

type Page = 'home' | 'map' | 'dashboard' | 'insight';

const HELP_CONTENT = [
  { step: '1', title: '학교 검색', desc: '홈 화면에서 학교 이름을 검색하세요.' },
  { step: '2', title: '공연장 선택', desc: '지도에서 주변 공연장을 클릭하세요.' },
  { step: '3', title: '공연 선택', desc: '현재 공연 목록에서 원하는 공연을 선택하세요.' },
  { step: '4', title: '교육과정 연계', desc: '성취기준, 연계 영화·도서가 자동으로 표시됩니다.' },
  { step: '5', title: '장바구니 담기', desc: '📌 버튼으로 마음에 드는 항목을 장바구니에 담으세요.' },
  { step: '6', title: '내보내기', desc: '장바구니에서 이미지·PDF 저장, 클립보드 복사가 가능합니다.' },
  { step: '7', title: 'JSON 저장/불러오기', desc: '💾 버튼으로 장바구니 데이터를 파일로 저장하거나 불러올 수 있습니다.' },
];

function AppInner() {
  const { state, selectSchool, selectVenue, loadInsightBoard } = useApp();
  const [page, setPage] = useState<Page>('home');
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSchoolSelect(school: School) {
    selectSchool(school);
    setPage('map');
  }

  function handleVenueSelect(venue: Venue) {
    selectVenue(venue);
    setPage('dashboard');
  }

  function handleSaveJSON() {
    const json = JSON.stringify(state.insightBoard, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '수업장바구니.json';
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
      } catch {
        // invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // insightBoard 아이템 수 계산
  const insightCount = state.insightBoard.items.length + state.insightBoard.memos.length;

  return (
    <>
      <Header
        onHomeClick={() => setPage('home')}
        onInsightClick={() => setPage(p => p === 'insight' ? 'home' : 'insight')}
        insightCount={insightCount}
        onSaveJSON={handleSaveJSON}
        onLoadJSON={() => fileInputRef.current?.click()}
        onHelpClick={() => setShowHelp(true)}
      />
      <div style={{ flex: 1 }}>
        {page === 'home' && (
          <HomePage onSchoolSelect={handleSchoolSelect} />
        )}
        {page === 'map' && (
          <MapPage onVenueSelect={handleVenueSelect} />
        )}
        {page === 'dashboard' && (
          <DashboardPage onGoToMap={() => setPage('map')} />
        )}
        {page === 'insight' && (
          <InsightPage />
        )}
      </div>

      {/* 푸터 */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '16px 0',
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
      </footer>

      {/* 사용법 모달 */}
      {showHelp && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              background: 'var(--color-bg-primary)', borderRadius: '16px',
              padding: '32px', maxWidth: '480px', width: '100%',
              boxShadow: 'var(--shadow-xl)',
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
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px' }}
              onClick={() => setShowHelp(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* JSON 불러오기 숨김 input */}
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
