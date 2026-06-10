import { useState, useRef, useEffect, useCallback } from 'react';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { StepProgress } from './components/layout/StepProgress';
import { HomePage, type SearchMode } from './pages/HomePage';
import { MapPage } from './pages/MapPage';
import { DashboardPage } from './pages/DashboardPage';
import { InsightPage } from './pages/InsightPage';
import { AdminPanel } from './components/admin/AdminPanel';
import { decodeBoardGzip, isValidBoard } from './services/shareCodec';
import type { School, Venue, InsightBoard, Performance, PerformanceGenre, InsightPerformanceMeta } from './types';

export type Page = 'home' | 'map' | 'dashboard' | 'insight';
const VALID_PAGES: Page[] = ['home', 'map', 'dashboard', 'insight'];
const PAGE_KEY = 'stageinsight-page';

const HELP_CONTENT = [
  { step: '1', title: '학교 검색', desc: '홈 화면에서 학교 이름을 검색하세요. 유치원·초·중·고 모두 지원합니다.' },
  { step: '2', title: '공연장 선택', desc: '학교 주변 공연장이 자동으로 표시됩니다. 공연장 카드를 클릭하세요.' },
  { step: '3', title: '공연 선택', desc: '공연 대시보드에서 현재 공연 목록을 확인하고 원하는 공연을 선택하세요.' },
  { step: '4', title: '교육과정 연계', desc: '공연 선택 시 성취기준·연계 영화·도서가 자동 표시됩니다. 학년군·교과 필터나 ✨ AI 큐레이션으로 좁히고, 원하는 성취기준이 없으면 "🔎 성취기준 직접 찾기"(교육과정→학년군→교과→영역 4단계 필터 + 키워드 검색)로 직접 골라 담을 수 있습니다.' },
  { step: '5', title: 'AI 작품 소개 · 내보내기', desc: '✨ AI 작품 소개 버튼으로 줄거리·주제·관람 포인트·교육적 의의를 받고, 📋 텍스트 복사 · 📄 TXT · 🖼️ JPG 이미지로 내보낼 수 있습니다.' },
  { step: '6', title: '인사이트 바구니 담기', desc: '북마크(🔖) 버튼으로 공연·성취기준·영화·도서를 담으세요. 성취기준·영화·도서를 담으면 해당 공연 작품도 자동으로 함께 담깁니다.' },
  { step: '7', title: '바구니 정리 · 더 담기', desc: '바구니는 공연 작품별 그룹으로 묶이며, 목록형/카드(폴더)형 보기 전환과 접기/펼치기를 지원합니다. 그룹의 "➕ 더 담기"를 누르면 그 작품의 대시보드로 돌아가 성취기준·영화·도서를 이어서 담을 수 있습니다.' },
  { step: '8', title: 'AI 융합수업 설계', desc: '공연 그룹의 "✨ AI 융합수업 설계"로 줄거리부터 학습목표·활동·발문까지 수업 초안을 생성합니다. 🔄 다시 생성으로 새 안을 받고, 📋 텍스트 복사 또는 📝 메모로 저장할 수 있습니다. 저장된 긴 수업 메모는 접기/펼치기·복사가 가능합니다. (KOPIS에 줄거리가 없어도 AI가 보완합니다.)' },
  { step: '9', title: '메모 · 내보내기', desc: '공연별 메모를 작성하고, 이미지·PDF 저장, 클립보드 복사, URL 공유, 💾 JSON 저장/불러오기로 정리·백업할 수 있습니다.' },
];

function AppInner() {
  const { state, selectSchool, selectVenue, selectPerformance, loadInsightBoard } = useApp();
  const [showHelp, setShowHelp] = useState(false);
  // 검색 모드(학교→공연장 / 작품→학교) — 홈과 상단 진행표시줄이 공유
  const [searchMode, setSearchMode] = useState<SearchMode>('school');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 페이지 상태 (localStorage 초기화 + 유효성 검사) ──
  const [page, setPageState] = useState<Page>(() => {
    // URL 공유 파라미터(단축 ?s / gzip ?z / 레거시 ?share)가 있으면 인사이트 페이지로 시작
    const sp = new URLSearchParams(window.location.search);
    if (sp.has('share') || sp.has('s') || sp.has('z')) return 'insight';
    const saved = localStorage.getItem(PAGE_KEY) as Page | null;
    // 학교나 공연장이 없으면 map/dashboard로 복원하지 않음
    if (saved === 'map' && !state.selectedSchool) return 'home';
    if (saved === 'dashboard' && !state.selectedVenue) return 'home';
    return saved && VALID_PAGES.includes(saved) ? saved : 'home';
  });

  // 인사이트 바구니를 열기 전 페이지 기억 (뒤로가기용)
  const prevPageRef = useRef<Page>('home');

  // ── URL share 초기 로드 ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ── 단축 공유 링크(?s=<id>): 서버에서 보드를 불러온다 ──
    const shortId = params.get('s');
    if (shortId) {
      fetch(`/api/share?id=${encodeURIComponent(shortId)}`)
        .then(r => (r.ok ? r.json() : null))
        .then((decoded: InsightBoard | null) => {
          if (decoded && Array.isArray(decoded.items) && Array.isArray(decoded.memos)) {
            loadInsightBoard(decoded);
          } else {
            window.alert('공유 링크를 불러오지 못했습니다.\n링크가 만료되었거나 잘못된 주소일 수 있습니다.');
          }
        })
        .catch(() => window.alert('공유 링크를 불러오지 못했습니다.\n네트워크 연결을 확인한 뒤 다시 열어 주세요.'))
        .finally(() => window.history.replaceState({}, '', window.location.pathname));
      return;
    }

    // ── 압축 공유 링크(?z=<gzip-base64url>): 클라이언트에서 복원 ──
    const gz = params.get('z');
    if (gz) {
      decodeBoardGzip(gz)
        .then((decoded) => {
          if (isValidBoard(decoded)) loadInsightBoard(decoded);
          else window.alert('공유 링크를 불러오지 못했습니다. 링크가 손상되었을 수 있습니다.');
        })
        .catch(() => window.alert('공유 링크를 불러오지 못했습니다. 링크가 손상되었을 수 있습니다.'))
        .finally(() => window.history.replaceState({}, '', window.location.pathname));
      return;
    }

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

  // ── 사용법 모달: Esc 키로 닫기 (접근성) + 배경 스크롤 잠금 ──
  useEffect(() => {
    if (!showHelp) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowHelp(false); }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [showHelp]);

  // ── 네비게이션 핸들러 ──
  function handleSchoolSelect(school: School) {
    selectSchool(school);
    // 홈 페이지에서 공연장 목록이 바로 표시되므로 페이지 전환 없음
  }

  function handleVenueSelect(venue: Venue) {
    selectVenue(venue);
    navigateTo('dashboard');
  }

  // 작품 검색 흐름에서 학교 선택을 건너뛰고 곧장 그 작품의 수업 설계 대시보드로 진입
  function handleDesignPerformance(venue: Venue, perf: Performance) {
    selectVenue(venue);        // SELECT_VENUE가 선택 공연을 비우므로 공연장을 먼저 설정
    selectPerformance(perf);
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

  // 인사이트 바구니에서 특정 작품의 대시보드로 복귀 — 성취기준·영화·도서를 더 담기 위함.
  // 상세(포스터·줄거리·연계자료)는 대시보드가 공연 ID로 다시 불러오므로 최소 정보만 복원한다.
  function handleOpenPerformance(performanceId: string, performanceTitle: string, meta?: InsightPerformanceMeta) {
    const venue: Venue = {
      id: meta?.venueId ?? '',
      name: meta?.venue ?? performanceTitle,
      address: '', lat: 0, lng: 0,
    };
    const perf: Performance = {
      id: performanceId,
      title: performanceTitle,
      venue: meta?.venue ?? '',
      venueId: meta?.venueId ?? '',
      genre: (meta?.genre as PerformanceGenre) ?? '복합',
      state: '공연중',
      startDate: '',
      endDate: '',
      poster: undefined,
    };
    // 순서 중요: SELECT_VENUE는 선택 공연을 비우므로 공연장을 먼저 설정한다.
    selectVenue(venue);
    selectPerformance(perf);
    prevPageRef.current = 'insight';
    navigateTo('dashboard');
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
          // 불러오기는 현재 바구니를 통째로 교체하므로, 담긴 항목이 있으면 먼저 확인받는다.
          const currentCount = state.insightBoard.items.length + state.insightBoard.memos.length;
          if (currentCount > 0 && !window.confirm(
            `현재 바구니에 담긴 ${currentCount}개 항목이 불러온 파일 내용으로 교체됩니다.\n계속하시겠습니까?`,
          )) return;
          loadInsightBoard(data);
          navigateTo('insight');  // 불러온 결과를 바로 확인할 수 있게 바구니로 이동
        } else {
          window.alert('인사이트 바구니 파일 형식이 아닙니다.\nJSON 저장으로 내려받은 파일인지 확인해 주세요.');
        }
      } catch {
        window.alert('파일을 읽지 못했습니다.\nJSON 저장으로 내려받은 인사이트 바구니 파일인지 확인해 주세요.');
      }
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

      {/* 검색 절차 단계 표시기 — 홈/공연장/대시보드 흐름에서만 노출 (모드별 라벨) */}
      {page !== 'insight' && (
        <StepProgress
          mode={searchMode}
          hasSchool={!!state.selectedSchool}
          hasVenue={!!state.selectedVenue}
          onDashboard={page === 'dashboard'}
          onStep1={handleGoToHome}
          onStep2={handleGoToMap}
          onStep3={() => state.selectedVenue && navigateTo('dashboard')}
        />
      )}

      <div style={{ flex: 1 }}>
        {page === 'home'      && <HomePage onSchoolSelect={handleSchoolSelect} onVenueSelect={handleVenueSelect} onOpenPerformance={handleDesignPerformance} mode={searchMode} onModeChange={setSearchMode} />}
        {page === 'map'       && <MapPage onVenueSelect={handleVenueSelect} onGoToHome={handleGoToHome} />}
        {page === 'dashboard' && <DashboardPage onGoToMap={handleGoToMap} />}
        {page === 'insight'   && (
          <InsightPage
            onBack={() => navigateTo(prevPageRef.current)}
            onOpenPerformance={handleOpenPerformance}
          />
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            style={{
              background: 'var(--color-bg-primary)', borderRadius: '16px',
              padding: '32px', maxWidth: '520px', width: '100%', maxHeight: '90vh',
              overflow: 'auto', boxShadow: 'var(--shadow-xl)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 id="help-modal-title" style={{ fontSize: '22px', fontWeight: 700, marginBottom: '20px', color: 'var(--color-text-primary)' }}>
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
                기본 성취기준·연계 자료(영화·도서) 추천은 작품명의 핵심 키워드를 기반으로 한 매칭으로, 기계적 추출
                특성상 교육적 의도와 완벽히 일치하지 않을 수 있습니다. ✨ 표시가 있는 AI 기능(작품 소개·큐레이션·융합수업
                설계)은 생성형 AI가 작성하므로 사실과 다르거나 부정확할 수 있으며, 특히 KOPIS에 줄거리가 없는 작품은 AI가
                일반 지식으로 줄거리를 보완하므로 실제 공연과 다를 수 있습니다. 수업 설계 시 반드시 내용을 재확인하시고
                참고용으로 활용해 주세요.
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

      {/* 관리자 모드 — 좌측 하단 숨김 진입점 + 비밀번호 + 클라우드 자동 동기화 */}
      <AdminPanel />
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
