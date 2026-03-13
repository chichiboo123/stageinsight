import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { SearchBar } from '../components/common/SearchBar';
import { useSchoolSearch } from '../hooks/useSchoolSearch';
import { useNearbyVenues } from '../hooks/useNearbyVenues';
import { usePerformanceSearch } from '../hooks/usePerformanceSearch';
import { useNearbySchools } from '../hooks/useNearbySchools';
import { fetchPerformancesByVenue } from '../services/kopis';
import type { School, Venue, Performance } from '../types';
import styles from './HomePage.module.css';

interface HomePageProps {
  onSchoolSelect: (school: School) => void;
  onVenueSelect: (venue: Venue) => void;
}

type SearchMode = 'school' | 'performance';

export function HomePage({ onSchoolSelect, onVenueSelect }: HomePageProps) {
  const { state } = useApp();
  const [mode, setMode] = useState<SearchMode>('school');

  // ── 학교 모드 ──
  const { query, setQuery, schools, loading, error, clearResults } = useSchoolSearch();
  const { venues, loading: venueLoading } = useNearbyVenues(state.selectedSchool, 10000);

  const [perfStatus, setPerfStatus] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (venues.length === 0) { setPerfStatus(new Map()); return; }
    let cancelled = false;
    setPerfStatus(new Map());
    Promise.allSettled(
      venues.map(v => fetchPerformancesByVenue(v.name).then(perfs => ({ id: v.id, has: perfs.length > 0 })))
    ).then(results => {
      if (cancelled) return;
      const map = new Map<string, boolean>();
      results.forEach(r => { if (r.status === 'fulfilled') map.set(r.value.id, r.value.has); });
      setPerfStatus(map);
    });
    return () => { cancelled = true; };
  }, [venues]);

  // ── 작품 모드 (역방향) ──
  const { query: perfQuery, setQuery: setPerfQuery, performances, loading: perfLoading, error: perfError, clearResults: clearPerfResults } = usePerformanceSearch();
  const [selectedPerf, setSelectedPerf] = useState<Performance | null>(null);
  const { schools: nearbySchools, loading: schoolsLoading } = useNearbySchools(
    selectedPerf?.venueId ?? null,
    selectedPerf?.venue ?? null,
    10000,
  );

  function handleSchoolSelect(school: School) {
    clearResults();
    onSchoolSelect(school);
  }

  function handleModeSwitch(next: SearchMode) {
    setMode(next);
    clearResults();
    clearPerfResults();
    setSelectedPerf(null);
  }

  function handlePerfSelect(perf: Performance) {
    setSelectedPerf(perf);
    clearPerfResults();
    setPerfQuery('');
  }

  function handleReverseSchoolSelect(school: School) {
    setMode('school');
    setSelectedPerf(null);
    onSchoolSelect(school);
  }

  const hasSchool = !!state.selectedSchool;

  return (
    <main className={styles.main}>
      {/* 히어로 */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            학교와 예술을<br />
            <span className={styles.heroAccent}>연결하다</span>
          </h1>

          {/* 모드 토글 */}
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${mode === 'school' ? styles.modeBtnActive : ''}`}
              onClick={() => handleModeSwitch('school')}
            >
              🏫 학교 → 공연장
            </button>
            <button
              className={`${styles.modeBtn} ${mode === 'performance' ? styles.modeBtnActive : ''}`}
              onClick={() => handleModeSwitch('performance')}
            >
              🎭 작품 → 학교
            </button>
          </div>

          <p className={styles.heroSubtitle}>
            {mode === 'school'
              ? '학교명 → 공연장 → 작품 → 교육과정 연계'
              : '작품명 → 공연장 위치 → 인근 학교 탐색'}
          </p>

          {/* 검색창 */}
          <div className={styles.searchWrapper}>
            {mode === 'school' ? (
              <>
                <SearchBar value={query} onChange={setQuery} onClear={clearResults}
                  placeholder="학교 이름을 입력하세요" loading={loading} autoFocus />
                {(schools.length > 0 || error) && (
                  <div className={styles.dropdown}>
                    {error && <div className={styles.dropdownError}>{error}</div>}
                    {schools.map(school => (
                      <button key={school.id} className={styles.dropdownItem} onClick={() => handleSchoolSelect(school)}>
                        <span className={styles.schoolIcon}>🏫</span>
                        <span className={styles.schoolInfo}>
                          <strong>{school.name}</strong>
                          <small>{school.address}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <SearchBar value={perfQuery} onChange={setPerfQuery} onClear={clearPerfResults}
                  placeholder="작품 이름을 입력하세요" loading={perfLoading} autoFocus />
                {!selectedPerf && (performances.length > 0 || perfError || (!perfLoading && perfQuery.trim() && performances.length === 0)) && (
                  <div className={styles.dropdown}>
                    {perfError && <div className={styles.dropdownError}>{perfError}</div>}
                    {!perfError && !perfLoading && perfQuery.trim() && performances.length === 0 && (
                      <div className={styles.dropdownError}>검색 결과가 없습니다.</div>
                    )}
                    {performances.map(perf => (
                      <button key={perf.id} className={styles.dropdownItem} onClick={() => handlePerfSelect(perf)}>
                        <span className={styles.schoolIcon}>🎭</span>
                        <span className={styles.schoolInfo}>
                          <strong>{perf.title}</strong>
                          <small>{perf.venue} · {perf.state} · {perf.startDate}~{perf.endDate}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 힌트 태그 */}
          <div className={styles.hints}>
            {mode === 'school'
              ? ['초등학교', '중학교', '고등학교', '유치원', '특수학교'].map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))
              : ['뮤지컬', '연극', '오페라', '무용', '클래식'].map(tag => (
                  <span key={tag} className="tag" style={{ cursor: 'pointer' }} onClick={() => setPerfQuery(tag)}>{tag}</span>
                ))}
          </div>
        </div>
      </section>

      {/* ── 학교 모드: 주변 공연장 ── */}
      {mode === 'school' && hasSchool && (
        <section className={`container ${styles.venueSection}`}>
          <div className={styles.venueSectionHeader}>
            <h2 className={styles.venueSectionTitle}>📍 {state.selectedSchool!.name} 주변 공연장</h2>
            <button className="btn btn-ghost" style={{ fontSize: 'var(--font-size-sm)' }}
              onClick={() => onSchoolSelect(state.selectedSchool!)}>학교 재검색</button>
          </div>
          {venueLoading && (
            <div className={styles.venueLoading}><span className={styles.spinner} /><span>공연장 검색 중...</span></div>
          )}
          {!venueLoading && venues.length === 0 && (
            <div className="empty-state"><span style={{ fontSize: '32px' }}>🎭</span><p>반경 10km 내 공연장을 찾지 못했습니다.</p></div>
          )}
          {!venueLoading && venues.length > 0 && (
            <>
              <p className={styles.venueCount}>총 {venues.length}곳 검색됨</p>
              <div className={styles.venueGrid}>
                {venues.map(venue => {
                  const hasPerf = perfStatus.get(venue.id);
                  const isEmpty = hasPerf === false;
                  return (
                    <button key={venue.id}
                      className={`card ${styles.venueCard} ${isEmpty ? styles.venueCardEmpty : ''}`}
                      onClick={() => onVenueSelect(venue)}
                      title={isEmpty ? '현재 공연 예정 작품이 없습니다' : undefined}>
                      <div className={styles.venueCardIcon}>{isEmpty ? '🎭' : '🎪'}</div>
                      <div className={styles.venueCardBody}>
                        <strong className={styles.venueName}>{venue.name}</strong>
                        <small className={styles.venueAddress}>{venue.address}</small>
                        <div className={styles.venueBadges}>
                          {venue.walkingMinutes != null && (
                            <span className={`tag ${isEmpty ? '' : styles.badgeWalk}`}>🚶 {venue.walkingMinutes}분</span>
                          )}
                          {venue.transitMinutes != null && (
                            <span className={`tag ${isEmpty ? '' : styles.badgeCar}`}>🚗 {venue.transitMinutes}분</span>
                          )}
                          {venue.distanceMeters != null && (
                            <span className="tag">
                              {venue.distanceMeters >= 1000
                                ? `${(venue.distanceMeters / 1000).toFixed(1)}km`
                                : `${Math.round(venue.distanceMeters)}m`}
                            </span>
                          )}
                          {isEmpty && <span className={`tag ${styles.badgeEmpty}`}>공연 없음</span>}
                        </div>
                      </div>
                      <span className={styles.venueArrow}>›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── 작품 모드: 선택된 작품 + 인근 학교 ── */}
      {mode === 'performance' && selectedPerf && (
        <section className={`container ${styles.venueSection}`}>
          {/* 선택된 작품 카드 */}
          <div className={styles.selectedPerfCard}>
            {selectedPerf.poster && (
              <img src={selectedPerf.poster} alt={selectedPerf.title} className={styles.perfPoster} />
            )}
            <div className={styles.selectedPerfInfo}>
              <span className="tag" style={{ alignSelf: 'flex-start' }}>{selectedPerf.state}</span>
              <strong className={styles.selectedPerfTitle}>{selectedPerf.title}</strong>
              <small style={{ color: 'var(--color-text-secondary)' }}>📍 {selectedPerf.venue}</small>
              <small style={{ color: 'var(--color-text-muted)' }}>{selectedPerf.startDate} ~ {selectedPerf.endDate}</small>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 'var(--font-size-sm)', alignSelf: 'flex-start' }}
              onClick={() => setSelectedPerf(null)}>다른 작품 선택</button>
          </div>

          {/* 인근 학교 */}
          <div className={styles.venueSectionHeader} style={{ marginTop: 'var(--space-5)' }}>
            <h2 className={styles.venueSectionTitle}>🏫 {selectedPerf.venue} 인근 학교</h2>
            <small className={styles.venueCount}>반경 10km</small>
          </div>

          {schoolsLoading && (
            <div className={styles.venueLoading}><span className={styles.spinner} /><span>학교 검색 중...</span></div>
          )}
          {!schoolsLoading && nearbySchools.length === 0 && (
            <div className="empty-state">
              <span style={{ fontSize: '32px' }}>🏫</span>
              <p>반경 10km 내 학교를 찾지 못했습니다.<br />공연장 좌표 정보가 없거나 도심 외 지역일 수 있습니다.</p>
            </div>
          )}
          {!schoolsLoading && nearbySchools.length > 0 && (
            <>
              <p className={styles.venueCount}>총 {nearbySchools.length}곳 검색됨 · 클릭하면 해당 학교 기준으로 주변 공연장 탐색</p>
              <div className={styles.venueGrid}>
                {nearbySchools.map(school => (
                  <button key={school.id} className={`card ${styles.venueCard}`}
                    onClick={() => handleReverseSchoolSelect(school)}>
                    <div className={styles.venueCardIcon}>🏫</div>
                    <div className={styles.venueCardBody}>
                      <strong className={styles.venueName}>{school.name}</strong>
                      <small className={styles.venueAddress}>{school.address}</small>
                      <div className={styles.venueBadges}>
                        {school.walkingMinutes != null && (
                          <span className={`tag ${styles.badgeWalk}`}>🚶 {school.walkingMinutes}분</span>
                        )}
                        {school.transitMinutes != null && (
                          <span className={`tag ${styles.badgeCar}`}>🚗 {school.transitMinutes}분</span>
                        )}
                        {school.distanceMeters != null && (
                          <span className="tag">
                            {school.distanceMeters >= 1000
                              ? `${(school.distanceMeters / 1000).toFixed(1)}km`
                              : `${Math.round(school.distanceMeters)}m`}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={styles.venueArrow}>›</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* 기능 소개 카드 */}
      {!hasSchool && mode === 'school' && !selectedPerf && (
        <section className={`container ${styles.features}`}>
          {FEATURES.map((feat, i) => (
            <div key={i} className={`card ${styles.featureCard} fade-in`} style={{ animationDelay: `${i * 80}ms` }}>
              <span className={styles.featureIcon}>{feat.icon}</span>
              <h3 className={styles.featureTitle}>{feat.title}</h3>
              <p className={styles.featureDesc}>{feat.desc}</p>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

const FEATURES = [
  { icon: '🗺️', title: '공연장 탐색', desc: '학교 주변 공연장 찾기' },
  { icon: '🎭', title: '공연 정보', desc: 'KOPIS 공연 정보 제공' },
  { icon: '📚', title: '교육과정 연계', desc: '최신 성취기준 자동 매칭' },
  { icon: '🎬', title: '예술의 확장', desc: '영화·독서 등 융합 수업 아이디어 제공' },
];
