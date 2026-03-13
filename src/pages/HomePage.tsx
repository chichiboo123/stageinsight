import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { SearchBar } from '../components/common/SearchBar';
import { useSchoolSearch } from '../hooks/useSchoolSearch';
import { useNearbyVenues } from '../hooks/useNearbyVenues';
import { fetchPerformancesByVenue } from '../services/kopis';
import type { School, Venue } from '../types';
import styles from './HomePage.module.css';

interface HomePageProps {
  onSchoolSelect: (school: School) => void;
  onVenueSelect: (venue: Venue) => void;
}

export function HomePage({ onSchoolSelect, onVenueSelect }: HomePageProps) {
  const { state } = useApp();
  const { query, setQuery, schools, loading, error, clearResults } = useSchoolSearch();
  const { venues, loading: venueLoading } = useNearbyVenues(state.selectedSchool, 10000);

  // 공연 보유 여부: Map<venueId, boolean> — undefined = 아직 로딩 중
  const [perfStatus, setPerfStatus] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (venues.length === 0) { setPerfStatus(new Map()); return; }
    let cancelled = false;
    setPerfStatus(new Map()); // 새 목록이면 초기화
    Promise.allSettled(
      venues.map(v =>
        fetchPerformancesByVenue(v.name).then(perfs => ({ id: v.id, has: perfs.length > 0 }))
      )
    ).then(results => {
      if (cancelled) return;
      const map = new Map<string, boolean>();
      results.forEach(r => { if (r.status === 'fulfilled') map.set(r.value.id, r.value.has); });
      setPerfStatus(map);
    });
    return () => { cancelled = true; };
  }, [venues]);

  function handleSchoolSelect(school: School) {
    clearResults();
    onSchoolSelect(school);
  }

  const hasSchool = !!state.selectedSchool;

  return (
    <main className={styles.main}>
      {/* 히어로 섹션 */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            학교와 예술을<br />
            <span className={styles.heroAccent}>연결하다</span>
          </h1>
          <p className={styles.heroSubtitle}>
            학교명 → 공연장 → 작품 → 교육과정 연계
          </p>

          {/* 검색창 */}
          <div className={styles.searchWrapper}>
            <SearchBar
              value={query}
              onChange={setQuery}
              onClear={clearResults}
              placeholder="학교 이름을 입력하세요"
              loading={loading}
              autoFocus
            />

            {/* 자동완성 드롭다운 */}
            {(schools.length > 0 || error) && (
              <div className={styles.dropdown}>
                {error && <div className={styles.dropdownError}>{error}</div>}
                {schools.map(school => (
                  <button
                    key={school.id}
                    className={styles.dropdownItem}
                    onClick={() => handleSchoolSelect(school)}
                  >
                    <span className={styles.schoolIcon}>🏫</span>
                    <span className={styles.schoolInfo}>
                      <strong>{school.name}</strong>
                      <small>{school.address}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 힌트 태그 */}
          <div className={styles.hints}>
            {['초등학교', '중학교', '고등학교', '유치원', '특수학교'].map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 학교 선택 후: 주변 공연장 목록 */}
      {hasSchool && (
        <section className={`container ${styles.venueSection}`}>
          <div className={styles.venueSectionHeader}>
            <h2 className={styles.venueSectionTitle}>
              📍 {state.selectedSchool!.name} 주변 공연장
            </h2>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 'var(--font-size-sm)' }}
              onClick={() => onSchoolSelect(state.selectedSchool!)}
            >
              학교 재검색
            </button>
          </div>

          {venueLoading && (
            <div className={styles.venueLoading}>
              <span className={styles.spinner} />
              <span>공연장 검색 중...</span>
            </div>
          )}

          {!venueLoading && venues.length === 0 && (
            <div className="empty-state">
              <span style={{ fontSize: '32px' }}>🎭</span>
              <p>반경 10km 내 공연장을 찾지 못했습니다.</p>
            </div>
          )}

          {!venueLoading && venues.length > 0 && (
            <>
              <p className={styles.venueCount}>총 {venues.length}곳 검색됨</p>
              <div className={styles.venueGrid}>
                {venues.map(venue => {
                  const hasPerf = perfStatus.get(venue.id);  // undefined = 로딩 중, true/false = 확정
                  const isEmpty = hasPerf === false;
                  return (
                    <button
                      key={venue.id}
                      className={`card ${styles.venueCard} ${isEmpty ? styles.venueCardEmpty : ''}`}
                      onClick={() => onVenueSelect(venue)}
                      title={isEmpty ? '현재 공연 예정 작품이 없습니다' : undefined}
                    >
                      <div className={styles.venueCardIcon}>{isEmpty ? '🎭' : '🎪'}</div>
                      <div className={styles.venueCardBody}>
                        <strong className={styles.venueName}>{venue.name}</strong>
                        <small className={styles.venueAddress}>{venue.address}</small>
                        <div className={styles.venueBadges}>
                          {venue.walkingMinutes != null && (
                            <span className={`tag ${isEmpty ? '' : styles.badgeWalk}`}>
                              🚶 {venue.walkingMinutes}분
                            </span>
                          )}
                          {venue.transitMinutes != null && (
                            <span className={`tag ${isEmpty ? '' : styles.badgeCar}`}>
                              🚗 {venue.transitMinutes}분
                            </span>
                          )}
                          {venue.distanceMeters != null && (
                            <span className="tag">
                              {venue.distanceMeters >= 1000
                                ? `${(venue.distanceMeters / 1000).toFixed(1)}km`
                                : `${Math.round(venue.distanceMeters)}m`}
                            </span>
                          )}
                          {isEmpty && (
                            <span className={`tag ${styles.badgeEmpty}`}>공연 없음</span>
                          )}
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

      {/* 기능 소개 카드 (학교 미선택 시만 표시) */}
      {!hasSchool && (
        <section className={`container ${styles.features}`}>
          {FEATURES.map((feat, i) => (
            <div
              key={i}
              className={`card ${styles.featureCard} fade-in`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
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
  {
    icon: '🗺️',
    title: '공연장 탐색',
    desc: '학교 주변 공연장 찾기',
  },
  {
    icon: '🎭',
    title: '공연 정보',
    desc: 'KOPIS 공연 정보 제공',
  },
  {
    icon: '📚',
    title: '교육과정 연계',
    desc: '최신 성취기준 자동 매칭',
  },
  {
    icon: '🎬',
    title: '예술의 확장',
    desc: '영화·독서 등 융합 수업 아이디어 제공',
  },
];
