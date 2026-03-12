
import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { usePerformances, usePerformanceDetail } from '../hooks/usePerformances';
import { useCurriculumMatch } from '../hooks/useCurriculumMatch';
import { useMediaRecommendations } from '../hooks/useMediaRecommendations';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import type { CurriculumType, Movie, Book } from '../types';
import styles from './DashboardPage.module.css';

const CURRICULUM_FILTERS: { label: string; value: CurriculumType }[] = [
  { label: '2022 개정', value: '2022 개정' },
  { label: '2022 개정 특수', value: '2022 개정 특수' },
  { label: '2019 누리과정', value: '2019 누리과정' },
];

interface DashboardPageProps {
  onGoToMap?: () => void;
}

// ---------- 공연소개 이미지 모달 ----------
function ImageModal({ images, title, onClose }: { images: string[]; title: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '16px',
          padding: '24px', maxWidth: '800px', width: '100%', maxHeight: '90vh',
          overflow: 'auto', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            공연소개 이미지 — {title}
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {images.map((src, i) => (
            <img key={i} src={src} alt={`공연소개 이미지 ${String(i + 1)}`}
              style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-sm)', display: 'block' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 미디어 상세 팝업 ----------
function MovieDetailModal({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '16px',
          padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '90vh',
          overflow: 'auto', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {movie.posterPath && (
            <img src={movie.posterPath} alt={movie.title}
              style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
                {movie.title}
              </h3>
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }}>×</button>
            </div>
            {movie.originalTitle && movie.originalTitle !== movie.title && (
              <small style={{ color: 'var(--color-text-muted)' }}>{movie.originalTitle}</small>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {movie.releaseDate && <span className="tag">{movie.releaseDate.slice(0, 4)}</span>}
              {movie.runtime && <span className="tag">⏱ {movie.runtime}분</span>}
              <span className="tag">★ {movie.voteAverage.toFixed(1)}</span>
            </div>
            {movie.genres && movie.genres.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {movie.genres.map(g => <span key={g} className="tag" style={{ fontSize: '11px' }}>{g}</span>)}
              </div>
            )}
          </div>
        </div>
        {movie.overview && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              줄거리
            </h4>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: '1.8' }}>
              {movie.overview}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BookDetailModal({ book, onClose }: { book: Book; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '16px',
          padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '90vh',
          overflow: 'auto', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {book.image && (
            <img src={book.image} alt={book.title}
              style={{ width: '90px', height: '130px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
                {book.title}
              </h3>
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }}>×</button>
            </div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{book.author}</p>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{book.publisher}</p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {book.pubdate && <span className="tag">{book.pubdate.slice(0, 4)}</span>}
              {book.price && <span className="tag">{book.price.toLocaleString()}원</span>}
            </div>
            {book.link && (
              <a href={book.link} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-accent-primary)', textDecoration: 'none' }}>
                네이버 도서 페이지 →
              </a>
            )}
          </div>
        </div>
        {book.description && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              책 소개
            </h4>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
              {book.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardPage({ onGoToMap }: DashboardPageProps) {
  const { state, selectVenue, selectPerformance, addInsightItem } = useApp();
  const { selectedVenue, selectedPerformance } = state;

  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

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

                  {/* 제작진 */}
                  {!detailLoading && displayPerformance!.crew && displayPerformance!.crew.length > 0 && (
                    <div className={styles.castBox}>
                      <h4 className={styles.synopsisLabel}>제작진</h4>
                      <p className={styles.castList}>{displayPerformance!.crew.join(' · ')}</p>
                    </div>
                  )}

                  {displayPerformance!.price && (
                    <p className={styles.detailPrice}>💰 {displayPerformance!.price}</p>
                  )}

                  {/* 공연소개 보기 링크 (이미지 모달) */}
                  {!detailLoading && displayPerformance!.images && displayPerformance!.images.length > 0 && (
                    <div className={styles.castBox}>
                      <button
                        className={styles.introLink}
                        onClick={() => setShowImageModal(true)}
                      >
                        📷 공연소개 보기
                      </button>
                    </div>
                  )}

                  {/* 예매 링크 */}
                  {!detailLoading && displayPerformance!.relates && displayPerformance!.relates.length > 0 && (
                    <div className={styles.castBox}>
                      <h4 className={styles.synopsisLabel}>예매 링크</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {displayPerformance!.relates.map((r, i) => (
                          <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-accent-primary)', textDecoration: 'none' }}>
                            🎟️ {r.name || r.url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    className={styles.bookmarkBtn}
                    title="인사이트 바구니에 담기"
                    onClick={() => addInsightItem({
                      type: 'performance',
                      id: displayPerformance!.id,
                      title: displayPerformance!.title,
                      subtitle: displayPerformance!.venue,
                      thumbnail: displayPerformance!.poster,
                      detail: displayPerformance!.synopsis,
                      performanceId: displayPerformance!.id,
                      performanceTitle: displayPerformance!.title,
                      savedAt: new Date().toISOString(),
                    })}
                  >
                    <span className="material-symbols-outlined">bookmark_add</span>
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
                  {matches.map(({ standard, matchedKeywords }) => (
                    <div key={standard.id} className={`card ${styles.standardCard}`}>
                      <div className={styles.standardMeta}>
                        <div className={styles.standardTags}>
                          <span className="tag">{standard.curriculumType}</span>
                          <span className="tag">{standard.subject}</span>
                          {standard.grade && <span className="tag">{standard.grade}</span>}
                        </div>
                      </div>
                      <code className={styles.standardId}>{standard.id}</code>
                      <p className={styles.standardContent}>{standard.content}</p>
                      <div className={styles.matchedKws}>
                        {matchedKeywords.map(kw => (
                          <span key={kw} className={`tag ${styles.kwTag}`}>{kw}</span>
                        ))}
                      </div>
                      <button
                        className={styles.bookmarkBtnSm}
                        title="인사이트 바구니에 담기"
                        onClick={() => addInsightItem({
                          type: 'standard',
                          id: standard.id,
                          title: standard.id,
                          subtitle: `${standard.subject} · ${standard.grade ?? ''}`,
                          detail: standard.content,
                          performanceId: displayPerformance!.id,
                          performanceTitle: displayPerformance!.title,
                          savedAt: new Date().toISOString(),
                        })}
                      >
                        <span className="material-symbols-outlined">bookmark_add</span>
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
                  <div className={styles.mediaGrid}>
                    {movies.map(movie => (
                      <div
                        key={movie.id}
                        className={`card ${styles.mediaCard}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedMovie(movie)}
                      >
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
                          className={styles.bookmarkBtnSm}
                          title="인사이트 바구니에 담기"
                          onClick={e => {
                            e.stopPropagation();
                            addInsightItem({
                              type: 'movie',
                              id: String(movie.id),
                              title: movie.title,
                              thumbnail: movie.posterPath,
                              detail: movie.overview,
                              performanceId: displayPerformance!.id,
                              performanceTitle: displayPerformance!.title,
                              savedAt: new Date().toISOString(),
                            });
                          }}
                        >
                          <span className="material-symbols-outlined">bookmark_add</span>
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
                  <div className={styles.mediaGrid}>
                    {books.map(book => (
                      <div
                        key={book.isbn}
                        className={`card ${styles.mediaCard}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedBook(book)}
                      >
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
                          className={styles.bookmarkBtnSm}
                          title="인사이트 바구니에 담기"
                          onClick={e => {
                            e.stopPropagation();
                            addInsightItem({
                              type: 'book',
                              id: book.isbn,
                              title: book.title,
                              subtitle: book.author,
                              thumbnail: book.image,
                              detail: book.description,
                              performanceId: displayPerformance!.id,
                              performanceTitle: displayPerformance!.title,
                              savedAt: new Date().toISOString(),
                            });
                          }}
                        >
                          <span className="material-symbols-outlined">bookmark_add</span>
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

      {/* 공연소개 이미지 모달 */}
      {showImageModal && displayPerformance?.images && (
        <ImageModal
          images={displayPerformance.images}
          title={displayPerformance.title}
          onClose={() => setShowImageModal(false)}
        />
      )}

      {/* 영화 상세 팝업 */}
      {selectedMovie && (
        <MovieDetailModal movie={selectedMovie} onClose={() => setSelectedMovie(null)} />
      )}

      {/* 도서 상세 팝업 */}
      {selectedBook && (
        <BookDetailModal book={selectedBook} onClose={() => setSelectedBook(null)} />
      )}
    </div>
  );
}

function formatDate(d: string): string {
  if (!d) return '';
  if (d.includes('.')) return d; // 이미 포맷된 날짜 (YYYY.MM.DD)
  if (d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}
