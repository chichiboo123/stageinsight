
import { useApp } from '../contexts/AppContext';
import { usePerformances, usePerformanceDetail } from '../hooks/usePerformances';
import { useCurriculumMatch } from '../hooks/useCurriculumMatch';
import { useMediaRecommendations } from '../hooks/useMediaRecommendations';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import type { CurriculumType } from '../types';
import styles from './DashboardPage.module.css';

const CURRICULUM_FILTERS: { label: string; value: CurriculumType }[] = [
  { label: '2022 개정', value: '2022 개정' },
  { label: '2022 개정 특수', value: '2022 개정 특수' },
  { label: '2019 누리과정', value: '2019 누리과정' },
];

interface DashboardPageProps {
  onGoToMap?: () => void;
}

export function DashboardPage({ onGoToMap }: DashboardPageProps) {
  const { state, selectVenue, selectPerformance, addInsightItem } = useApp();
  const { selectedVenue, selectedPerformance } = state;

  // 공연 목록
  const { performances, loading: perfLoading, error: perfError } = usePerformances(selectedVenue);

  // 공연 상세 (시놉시스·출연진·가격 포함) — 목록 선택 시 자동 호출
  const { performance: detailedPerformance, loading: detailLoading } = usePerformanceDetail(
    selectedPerformance?.id ?? null,
  );
  // 상세 로드 전까지는 목록 데이터로 fallback
  const displayPerformance = detailedPerformance ?? selectedPerformance;

  // 교육과정 매칭 (상세 데이터 기준 — synopsis·keywords 활용)
  const { matches, loading: currLoading, activeFilters, setFilters } = useCurriculumMatch(displayPerformance);

  // 연계 미디어 (영화 + 도서) — 상세 데이터(keywords 포함) 기반으로 실행
  const {
    movies, books,
    moviesLoading, booksLoading,
    moviesError, booksError,
  } = useMediaRecommendations(displayPerformance);

  if (!selectedVenue) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-20)' }}>
        <span style={{ fontSize: '48px' }}>🎪</span>
        <p>공연장을 먼저 선택해 주세요.</p>
        <button className="btn btn-primary" onClick={() => { selectVenue(null); onGoToMap?.(); }}>
          지도로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className={`container ${styles.page}`}>
      {/* 브레드크럼 */}
      <nav className={styles.breadcrumb}>
        <button className="btn btn-ghost" onClick={() => { selectVenue(null); onGoToMap?.(); }}>
          ← {selectedVenue.name}
        </button>
      </nav>

      <div className={styles.layout}>
        {/* 왼쪽: 공연 목록 */}
        <aside className={styles.performanceList}>
          <h2 className="section-title">현재 공연</h2>

          {perfLoading && <LoadingSpinner message="공연 정보 불러오는 중..." />}
          {perfError && <ErrorMessage message={perfError} />}

          {!perfLoading && performances.length === 0 && !perfError && (
            <div className="empty-state">
              <span style={{ fontSize: '32px' }}>🎭</span>
              <p>현재 공연 예정 작품이 없습니다.</p>
            </div>
          )}

          <ul className={styles.perfCards}>
            {performances.map(perf => (
              <li key={perf.id}>
                <button
                  className={`card ${styles.perfCard} ${selectedPerformance?.id === perf.id ? styles.perfCardActive : ''}`}
                  onClick={() => selectPerformance(perf)}
                >
                  {perf.poster && (
                    <img src={perf.poster} alt={perf.title} className={styles.perfPoster} />
                  )}
                  <div className={styles.perfInfo}>
                    <span className="tag">{perf.genre}</span>
                    <strong className={styles.perfTitle}>{perf.title}</strong>
                    <small className={styles.perfDate}>
                      {formatDate(perf.startDate)} ~ {formatDate(perf.endDate)}
                    </small>
                    <span className={`tag ${styles.stateTag}`} data-state={perf.state}>
                      {perf.state}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 오른쪽: 융합 대시보드 */}
        <main className={styles.dashboard}>
          {!selectedPerformance ? (
            <div className="empty-state" style={{ minHeight: '400px' }}>
              <span style={{ fontSize: '48px' }}>👈</span>
              <p>왼쪽에서 공연을 선택하면<br />교육과정 연계 정보가 나타납니다.</p>
            </div>
          ) : (
            <>
              {/* 공연 상세 */}
              <section className={`card ${styles.perfDetail} fade-in`}>
                {displayPerformance!.poster && (
                  <img
                    src={displayPerformance!.poster}
                    alt={displayPerformance!.title}
                    className={styles.detailPoster}
                  />
                )}
                <div className={styles.detailInfo}>
                  <div className={styles.detailTags}>
                    <span className="tag">{displayPerformance!.genre}</span>
                    {displayPerformance!.rating && (
                      <span className="tag">{displayPerformance!.rating}</span>
                    )}
                    {displayPerformance!.runtime && (
                      <span className="tag">⏱ {displayPerformance!.runtime}</span>
                    )}
                  </div>
                  <h2 className={styles.detailTitle}>{displayPerformance!.title}</h2>
                  <p className={styles.detailVenue}>{displayPerformance!.venue}</p>
                  <p className={styles.perfDate}>
                    {formatDate(displayPerformance!.startDate)} ~ {formatDate(displayPerformance!.endDate)}
                  </p>

                  {/* 시놉시스 */}
                  {detailLoading && <p className={styles.emptyText}>공연 소개 불러오는 중...</p>}
                  {!detailLoading && displayPerformance!.synopsis && (
                    <div className={styles.synopsisBox}>
                      <h4 className={styles.synopsisLabel}>공연 소개</h4>
                      <p className={styles.detailSynopsis}>{displayPerformance!.synopsis}</p>
                    </div>
                  )}

                  {/* 출연진 */}
                  {!detailLoading && displayPerformance!.cast && displayPerformance!.cast.length > 0 && (
                    <div className={styles.castBox}>
                      <h4 className={styles.synopsisLabel}>출연진</h4>
                      <p className={styles.castList}>{displayPerformance!.cast.join(' · ')}</p>
                    </div>
                  )}

                  {displayPerformance!.price && (
                    <p className={styles.detailPrice}>💰 {displayPerformance!.price}</p>
                  )}
                  <button
                    className="btn btn-outline"
                    onClick={() => addInsightItem({
                      type: 'performance',
                      id: displayPerformance!.id,
                      title: displayPerformance!.title,
                      subtitle: displayPerformance!.venue,
                      thumbnail: displayPerformance!.poster,
                      savedAt: new Date().toISOString(),
                    })}
                  >
                    📌 인사이트에 저장
                  </button>
                </div>
              </section>

              {/* 교육과정 성취기준 */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className="section-title">교육과정 성취기준</h3>
                  <div className={styles.filterBtns}>
                    {CURRICULUM_FILTERS.map(f => (
                      <button
                        key={f.value}
                        className={`btn ${activeFilters.includes(f.value) ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setFilters(
                          activeFilters.includes(f.value)
                            ? activeFilters.filter(x => x !== f.value)
                            : [...activeFilters, f.value]
                        )}
                        style={{ padding: '6px 14px', fontSize: 'var(--font-size-xs)' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {currLoading && <LoadingSpinner size="sm" />}

                {!currLoading && matches.length === 0 && (
                  <p className={styles.emptyText}>매칭된 성취기준이 없습니다. 키워드를 확인해 주세요.</p>
                )}

                <div className={styles.standardGrid}>
                  {matches.map(({ standard, matchedKeywords, score }) => (
                    <div key={standard.id} className={`card ${styles.standardCard}`}>
                      <div className={styles.standardMeta}>
                        <span className="tag">{standard.curriculumType}</span>
                        <span className="tag">{standard.subject}</span>
                        {standard.grade && <span className="tag">{standard.grade}</span>}
                        <span className={styles.score}>{Math.round(score * 100)}% 일치</span>
                      </div>
                      <code className={styles.standardId}>{standard.id}</code>
                      <p className={styles.standardContent}>{standard.content}</p>
                      <div className={styles.matchedKws}>
                        {matchedKeywords.map(kw => (
                          <span key={kw} className={`tag ${styles.kwTag}`}>{kw}</span>
                        ))}
                      </div>
                      <button
                        className="btn btn-ghost"
                        style={{ alignSelf: 'flex-start', fontSize: 'var(--font-size-xs)' }}
                        onClick={() => addInsightItem({
                          type: 'standard',
                          id: standard.id,
                          title: standard.id,
                          subtitle: standard.content.slice(0, 60) + '...',
                          savedAt: new Date().toISOString(),
                        })}
                      >
                        📌 저장
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* 연계 영화 */}
              <section className={styles.section}>
                <h3 className="section-title">연계 추천 영화</h3>
                {moviesLoading && <LoadingSpinner size="sm" />}
                {moviesError && <ErrorMessage message={moviesError} />}
                {!moviesLoading && movies.length > 0 && (
                  <div className="scroll-x">
                    {movies.map(movie => (
                      <div key={movie.id} className={`card ${styles.mediaCard}`}>
                        {movie.posterPath ? (
                          <img src={movie.posterPath} alt={movie.title} className={styles.mediaPoster} />
                        ) : (
                          <div className={`skeleton ${styles.mediaPosterSkeleton}`} />
                        )}
                        <div className={styles.mediaInfo}>
                          <strong className={styles.mediaTitle}>{movie.title}</strong>
                          <small className={styles.mediaYear}>{movie.releaseDate?.slice(0, 4)}</small>
                          <div className={styles.mediaRating}>★ {movie.voteAverage}</div>
                          {movie.genres && (
                            <div className={styles.mediaTags}>
                              {movie.genres.slice(0, 2).map(g => (
                                <span key={g} className="tag" style={{ fontSize: '10px' }}>{g}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => addInsightItem({
                            type: 'movie',
                            id: String(movie.id),
                            title: movie.title,
                            thumbnail: movie.posterPath,
                            savedAt: new Date().toISOString(),
                          })}
                        >
                          📌
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 연계 도서 */}
              <section className={styles.section}>
                <h3 className="section-title">연계 추천 도서</h3>
                {booksLoading && <LoadingSpinner size="sm" />}
                {booksError && <ErrorMessage message={booksError} />}
                {!booksLoading && books.length > 0 && (
                  <div className="scroll-x">
                    {books.map(book => (
                      <div key={book.isbn} className={`card ${styles.mediaCard}`}>
                        {book.image ? (
                          <img src={book.image} alt={book.title} className={styles.mediaPoster} />
                        ) : (
                          <div className={`skeleton ${styles.mediaPosterSkeleton}`} />
                        )}
                        <div className={styles.mediaInfo}>
                          <strong className={styles.mediaTitle}>{book.title}</strong>
                          <small className={styles.mediaYear}>{book.author}</small>
                          <small className={styles.mediaYear}>{book.publisher}</small>
                          {book.price && (
                            <div className={styles.mediaRating}>
                              {book.price.toLocaleString()}원
                            </div>
                          )}
                        </div>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={() => addInsightItem({
                            type: 'book',
                            id: book.isbn,
                            title: book.title,
                            subtitle: book.author,
                            thumbnail: book.image,
                            savedAt: new Date().toISOString(),
                          })}
                        >
                          📌
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  if (!d || d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}
