
import { useApp } from '../contexts/AppContext';
import { usePerformances } from '../hooks/usePerformances';
import { useCurriculumMatch } from '../hooks/useCurriculumMatch';
import { useMediaRecommendations } from '../hooks/useMediaRecommendations';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import type { CurriculumType } from '../types';
import styles from './DashboardPage.module.css';

const CURRICULUM_FILTERS: { label: string; value: CurriculumType }[] = [
  { label: '2022 개정', value: '2022개정' },
  { label: '2019 누리', value: '2019누리' },
  { label: '2022 특수', value: '2022특수' },
];

export function DashboardPage() {
  const { state, selectVenue, selectPerformance, addInsightItem } = useApp();
  const { selectedVenue, selectedPerformance } = state;

  // 공연 목록
  const { performances, loading: perfLoading, error: perfError } = usePerformances(selectedVenue);

  // 교육과정 매칭 (선택된 공연 기준)
  const { matches, loading: currLoading, activeFilters, setFilters } = useCurriculumMatch(selectedPerformance);

  // 연계 미디어 (영화 + 도서)
  const {
    movies, books,
    moviesLoading, booksLoading,
    moviesError, booksError,
  } = useMediaRecommendations(selectedPerformance);

  if (!selectedVenue) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-20)' }}>
        <span style={{ fontSize: '48px' }}>🎪</span>
        <p>공연장을 먼저 선택해 주세요.</p>
        <button className="btn btn-primary" onClick={() => selectVenue(null)}>
          지도로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className={`container ${styles.page}`}>
      {/* 브레드크럼 */}
      <nav className={styles.breadcrumb}>
        <button className="btn btn-ghost" onClick={() => selectVenue(null)}>
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
                {selectedPerformance.poster && (
                  <img
                    src={selectedPerformance.poster}
                    alt={selectedPerformance.title}
                    className={styles.detailPoster}
                  />
                )}
                <div className={styles.detailInfo}>
                  <div className={styles.detailTags}>
                    <span className="tag">{selectedPerformance.genre}</span>
                    {selectedPerformance.rating && (
                      <span className="tag">{selectedPerformance.rating}</span>
                    )}
                    {selectedPerformance.runtime && (
                      <span className="tag">⏱ {selectedPerformance.runtime}</span>
                    )}
                  </div>
                  <h2 className={styles.detailTitle}>{selectedPerformance.title}</h2>
                  <p className={styles.detailVenue}>{selectedPerformance.venue}</p>
                  {selectedPerformance.synopsis && (
                    <p className={styles.detailSynopsis}>{selectedPerformance.synopsis}</p>
                  )}
                  {selectedPerformance.price && (
                    <p className={styles.detailPrice}>💰 {selectedPerformance.price}</p>
                  )}
                  <button
                    className="btn btn-outline"
                    onClick={() => addInsightItem({
                      type: 'performance',
                      id: selectedPerformance.id,
                      title: selectedPerformance.title,
                      subtitle: selectedPerformance.venue,
                      thumbnail: selectedPerformance.poster,
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
