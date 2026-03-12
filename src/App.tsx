import { useState } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { HomePage } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightPage } from './pages/InsightPage';
import type { School, Venue } from './types';

type Page = 'home' | 'map' | 'dashboard' | 'insight';

function AppInner() {
  const { state, selectSchool, selectVenue } = useApp();
  const [page, setPage] = useState<Page>('home');

  function handleSchoolSelect(school: School) {
    selectSchool(school);
    setPage('map');
  }

  function handleVenueSelect(venue: Venue) {
    selectVenue(venue);
    setPage('dashboard');
  }

  // insightBoard 아이템 수 계산
  const insightCount = state.insightBoard.items.length + state.insightBoard.memos.length;

  return (
    <>
      <Header
        onHomeClick={() => setPage('home')}
        onInsightClick={() => setPage(p => p === 'insight' ? 'home' : 'insight')}
        insightCount={insightCount}
      />
      <div style={{ flex: 1 }}>
        {page === 'home' && (
          <HomePage onSchoolSelect={handleSchoolSelect} />
        )}
        {page === 'map' && (
          <MapPage onVenueSelect={handleVenueSelect} />
        )}
        {page === 'dashboard' && (
          <DashboardPage />
        )}
        {page === 'insight' && (
          <InsightPage />
        )}
      </div>
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
