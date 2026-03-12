import { useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { useNearbyVenues } from '../hooks/useNearbyVenues';
import { useKakaoMap } from '../hooks/useKakaoMap';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import type { Venue } from '../types';
import styles from './MapPage.module.css';

interface MapPageProps {
  onVenueSelect: (venue: Venue) => void;
  onGoToHome?: () => void;
}

export function MapPage({ onVenueSelect, onGoToHome }: MapPageProps) {
  const { state, selectSchool } = useApp();
  const { selectedSchool } = state;

  const { venues, loading, error, refetch } = useNearbyVenues(selectedSchool, 5000);

  const { mapRef, mapLoaded, mapError, addMarker, clearMarkers, panTo } = useKakaoMap({
    lat: selectedSchool?.lat ?? 37.5665,
    lng: selectedSchool?.lng ?? 126.9780,
    level: 5,
  });

  // 공연장 마커 표시
  useEffect(() => {
    if (!mapLoaded || venues.length === 0) return;
    clearMarkers();

    // 학교 마커
    if (selectedSchool) {
      addMarker({
        lat: selectedSchool.lat,
        lng: selectedSchool.lng,
        title: selectedSchool.name,
        infoContent: `<div style="padding:8px 12px;font-weight:600;">${selectedSchool.name}</div>`,
      });
    }

    // 공연장 마커
    venues.forEach(venue => {
      addMarker({
        lat: venue.lat,
        lng: venue.lng,
        title: venue.name,
        infoContent: `
          <div style="padding:8px 12px;">
            <strong>${venue.name}</strong><br/>
            <small>${venue.address}</small>
          </div>
        `,
        onClick: () => onVenueSelect(venue),
      });
    });
  }, [mapLoaded, venues, selectedSchool]);

  function handleVenueClick(venue: Venue) {
    panTo(venue.lat, venue.lng);
    onVenueSelect(venue);
  }

  if (!selectedSchool) {
    return (
      <div className="empty-state">
        <span style={{ fontSize: '48px' }}>🏫</span>
        <p>먼저 학교를 검색해 주세요.</p>
        <button className="btn btn-primary" onClick={() => { selectSchool(null); onGoToHome?.(); }}>
          학교 검색으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {/* 왼쪽: 지도 */}
      <section className={styles.mapSection}>
        <div className={styles.mapHeader}>
          <button
            className={`btn btn-ghost ${styles.backBtn}`}
            onClick={() => { selectSchool(null); onGoToHome?.(); }}
          >
            ← 학교 재검색
          </button>
          <span className={styles.schoolName}>{selectedSchool.name}</span>
        </div>
        <div className={styles.mapWrapper}>
          <div ref={mapRef} className={styles.map} />
          {!mapLoaded && !mapError && (
            <div className={styles.mapOverlay}>
              <LoadingSpinner message="지도를 불러오는 중..." />
            </div>
          )}
          {mapError && (
            <div className={styles.mapOverlay}>
              <div className={styles.mapErrorBox}>
                <span style={{ fontSize: '32px' }}>🗺️</span>
                <p className={styles.mapErrorMsg}>{mapError}</p>
                <small style={{ color: 'var(--color-text-muted)', fontSize: '12px', textAlign: 'center' }}>
                  Netlify 환경변수에 VITE_KAKAO_JS_API_KEY를 설정해 주세요.
                </small>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 오른쪽: 공연장 리스트 */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className="section-title">주변 공연장</h2>
          <span className={styles.count}>{venues.length}곳</span>
        </div>

        {loading && <LoadingSpinner message="주변 공연장 검색 중..." />}
        {error && <ErrorMessage message={error} onRetry={refetch} />}

        {!loading && !error && venues.length === 0 && (
          <div className="empty-state">
            <span style={{ fontSize: '36px' }}>🔍</span>
            <p>반경 5km 내 공연장이 없습니다.</p>
          </div>
        )}

        <ul className={styles.venueList}>
          {venues.map(venue => (
            <li key={venue.id}>
              <button
                className={`card ${styles.venueCard}`}
                onClick={() => handleVenueClick(venue)}
              >
                <div className={styles.venueInfo}>
                  <span className={styles.venueIcon}>🎪</span>
                  <div>
                    <strong className={styles.venueName}>{venue.name}</strong>
                    <p className={styles.venueAddress}>{venue.address}</p>
                    {(venue.walkingMinutes || venue.distanceMeters) && (
                      <div className={styles.venueMeta}>
                        {venue.walkingMinutes && (
                          <span className="tag">🚶 {venue.walkingMinutes}분</span>
                        )}
                        {venue.distanceMeters && (
                          <span className="tag">
                            {venue.distanceMeters >= 1000
                              ? `${(venue.distanceMeters / 1000).toFixed(1)}km`
                              : `${Math.round(venue.distanceMeters)}m`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
