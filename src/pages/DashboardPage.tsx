
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { usePerformances, usePerformanceDetail } from '../hooks/usePerformances';
import { useDashboardCuration } from '../hooks/useDashboardCuration';
import { useModalDismiss } from '../hooks/useModalDismiss';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { PosterModal } from '../components/common/PosterModal';
import { aiIntroducePerformance } from '../services/ai';
import { fetchWikiSummary, namuwikiUrl, wikipediaSearchUrl, type WikiSummary } from '../services/wiki';
import { searchStandards, getStandardFacets, type StandardFilter } from '../services/curriculumMatcher';
import type { CurriculumType, Movie, Book, PerformanceIntro, InsightItem, AchievementStandard } from '../types';
import styles from './DashboardPage.module.css';

const CURRICULUM_FILTERS: { label: string; value: CurriculumType }[] = [
  { label: '2022 개정', value: '2022 개정' },
  { label: '2022 개정 특수', value: '2022 개정 특수' },
  { label: '2019 누리과정', value: '2019 누리과정' },
];

const GRADE_ORDER = [
  '초등학교 1~2학년',
  '초등학교 3~4학년',
  '초등학교 5~6학년',
  '중학교 1~3학년',
  '고등학교 1~3학년',
  '유아',
];

interface DashboardPageProps {
  onGoToMap?: () => void;
}

// ---------- 포스터 폴백 컴포넌트 ----------
function PosterFallback({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? { width: 140, height: 190 } : { width: 60, height: 80 };
  return (
    <div style={{
      ...dim,
      borderRadius: size === 'lg' ? 'var(--radius-md)' : 'var(--radius-sm)',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      flexShrink: 0,
      color: 'var(--color-text-muted)',
    }}>
      <span style={{ fontSize: size === 'lg' ? '28px' : '18px' }}>🎭</span>
      {size === 'lg' && <span style={{ fontSize: '10px' }}>포스터 없음</span>}
    </div>
  );
}

// ---------- 아동 배지 ----------
function ChildBadge({ child }: { child: boolean | undefined }) {
  // KOPIS의 child 필드는 '아동 관람 가능 여부' 신호로 신뢰도가 낮다.
  // (예: '만 7세 이상' 작품이 false로 와서 '아동관람불가'로 오표기됨)
  // → 긍정 정보(아동관람가)일 때만 표시하고, 부정 표기는 하지 않는다. 연령 등급은 별도 태그가 안내.
  if (child !== true) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: '2px 8px',
      borderRadius: '999px',
      fontSize: '11px',
      fontWeight: 600,
      background: '#fef9c3',
      color: '#a16207',
      border: '1px solid #fde68a',
    }}>
      👶 아동관람가
    </span>
  );
}

// ---------- 줄거리 펼치기/접기 ----------
function SynopsisBox({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const SHORT_LIMIT = 120;
  const isLong = text.length > SHORT_LIMIT;
  const display = expanded || !isLong ? text : text.slice(0, SHORT_LIMIT) + '…';

  return (
    <div className={styles.synopsisBox}>
      <h4 className={styles.synopsisLabel}>줄거리 / 공연 소개</h4>
      <p className={styles.detailSynopsis}>{display}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 600,
            color: 'var(--color-accent-primary)',
            padding: '2px 0', alignSelf: 'flex-start',
          }}
        >
          {expanded ? '▲ 접기' : '▼ 더 보기'}
        </button>
      )}
    </div>
  );
}

// ---------- 공연소개 이미지 모달 ----------
function ImageModal({ images, title, onClose }: { images: string[]; title: string; onClose: () => void }) {
  useModalDismiss(onClose);

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
          overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 공연소개 이미지`}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            공연소개 이미지 — {title}
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px' }} aria-label="닫기">×</button>
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

// ---------- 작품 정보(위키백과) 모달 — AI 미사용 ----------
function WikiModal({
  title, data, loading, error, onClose,
}: {
  title: string;
  data: WikiSummary | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useModalDismiss(onClose);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label={`${title} 작품 정보`}
        style={{
          background: 'var(--color-bg-primary)', borderRadius: '16px',
          padding: '24px', maxWidth: '560px', width: '100%', maxHeight: '85vh',
          overflow: 'auto', boxShadow: 'var(--shadow-xl)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
            📖 작품 정보
          </h3>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 20, padding: '4px 10px' }} aria-label="닫기">×</button>
        </div>

        {loading && (
          <p style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            위키백과에서 정보를 찾는 중이에요… ⏳
          </p>
        )}

        {!loading && data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {data.thumbnail && (
                <img src={data.thumbnail} alt="" style={{ width: 96, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
              )}
              <div>
                <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)' }}>{data.title}</strong>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.75, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                  {data.extract}
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && !data && (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
            {error ?? '위키백과에서 이 작품의 문서를 찾지 못했습니다.'} 아래 링크에서 직접 검색해 보세요.
          </p>
        )}

        {/* 외부 출처 바로가기 (나무위키는 스크래핑 불가 → 링크로 안내) */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {data?.url && (
            <a className="btn btn-secondary btn-sm" href={data.url} target="_blank" rel="noopener noreferrer">위키백과에서 보기 →</a>
          )}
          {!data?.url && (
            <a className="btn btn-secondary btn-sm" href={wikipediaSearchUrl(title)} target="_blank" rel="noopener noreferrer">위키백과 검색 →</a>
          )}
          <a className="btn btn-secondary btn-sm" href={namuwikiUrl(title)} target="_blank" rel="noopener noreferrer">나무위키에서 보기 →</a>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>
          출처: 위키백과 · 나무위키. 동명의 다른 작품일 수 있으니 공연 정보와 함께 확인해 주세요.
        </p>
      </div>
    </div>
  );
}

// ---------- 영화 상세 모달 ----------
function MovieDetailModal({ movie, onClose }: { movie: Movie; onClose: () => void }) {
  useModalDismiss(onClose);

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
          overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${movie.title} 영화 정보`}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {movie.posterPath ? (
            <img src={movie.posterPath} alt={movie.title}
              style={{ width: '100px', height: '150px', objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 100, height: 150, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '28px' }}>🎬</span>
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
                {movie.title}
              </h3>
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px', flexShrink: 0 }} aria-label="닫기">×</button>
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

// ---------- 도서 상세 모달 ----------
function BookDetailModal({ book, onClose }: { book: Book; onClose: () => void }) {
  useModalDismiss(onClose);

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
          overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${book.title} 도서 정보`}
      >
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {book.image ? (
            <img src={book.image} alt={book.title}
              style={{ width: '90px', height: '130px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 90, height: 130, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '28px' }}>📚</span>
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-primary)' }}>
                {book.title}
              </h3>
              <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '20px', padding: '4px 10px', flexShrink: 0 }} aria-label="닫기">×</button>
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

// ---------- AI 교육 해설 내보내기 (텍스트/이미지) ----------
const EXPORT_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/** AI 작품 소개(PerformanceIntro)를 평문 텍스트로 변환한다. */
function introToText(intro: PerformanceIntro, title: string): string {
  const lines: string[] = [`✨ AI 교육 해설 — ${title}`, ''];
  if (intro.summary) { lines.push('[작품 소개]', intro.summary, ''); }
  if (intro.themes?.length) { lines.push('[핵심 주제]', intro.themes.map(t => `#${t}`).join(' '), ''); }
  if (intro.watchPoints?.length) { lines.push('[관람 포인트]', ...intro.watchPoints.map(w => `· ${w}`), ''); }
  if (intro.educationalValue) { lines.push('[교육적 의의]', intro.educationalValue, ''); }
  if (intro.discussionStarters?.length) { lines.push('[관람 후 이야깃거리]', ...intro.discussionStarters.map(q => `· ${q}`), ''); }
  if (intro.sourceNote) lines.push(`🔎 참고: ${intro.sourceNote}`);
  lines.push('', 'created by. 교육뮤지컬 꿈꾸는 치수쌤');
  return lines.join('\n').trim();
}

/** maxWidth(px)에 맞춰 텍스트를 줄바꿈한다(한글 친화). */
function wrapExportText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (line && ctx.measureText(test).width > maxWidth) { out.push(line); line = ch; }
      else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

/** AI 교육 해설을 고해상도 카드 이미지(canvas)로 렌더한다. */
async function renderIntroCanvas(intro: PerformanceIntro, title: string): Promise<HTMLCanvasElement> {
  const SCALE = 3, W = 820, PAD = 44, innerW = W - PAD * 2;
  try { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* ignore */ }

  const measure = document.createElement('canvas').getContext('2d')!;
  type Op = { y: number; text: string; font: string; color: string; x: number };
  const ops: Op[] = [];
  const F_TITLE = `bold 26px ${EXPORT_FONT}`;
  const F_H = `bold 16px ${EXPORT_FONT}`;
  const F_BODY = `15px ${EXPORT_FONT}`;
  const F_FOOT = `12px ${EXPORT_FONT}`;
  let y = 54;

  ops.push({ x: PAD, y, text: '✨ AI 교육 해설', font: F_TITLE, color: '#1f2937' });
  y += 26;
  measure.font = F_H;
  for (const l of wrapExportText(measure, title, innerW)) { ops.push({ x: PAD, y, text: l, font: F_H, color: '#4F46E5' }); y += 22; }
  y += 12;

  const block = (heading: string, body: string[]) => {
    if (body.length === 0 || body.every(b => !b.trim())) return;
    ops.push({ x: PAD, y, text: heading, font: F_H, color: '#374151' }); y += 24;
    for (const para of body) {
      measure.font = F_BODY;
      for (const l of wrapExportText(measure, para, innerW)) { ops.push({ x: PAD, y, text: l, font: F_BODY, color: '#1f2937' }); y += 22; }
    }
    y += 12;
  };

  if (intro.summary) block('📖 작품 소개', [intro.summary]);
  if (intro.themes?.length) block('🎯 핵심 주제', [intro.themes.map(t => `#${t}`).join('  ')]);
  if (intro.watchPoints?.length) block('👀 관람 포인트', intro.watchPoints.map(w => `· ${w}`));
  if (intro.educationalValue) block('🎓 교육적 의의', [intro.educationalValue]);
  if (intro.discussionStarters?.length) block('💬 관람 후 이야깃거리', intro.discussionStarters.map(q => `· ${q}`));

  const footY = y + 16;
  const H = footY + 24;
  ops.push({ x: PAD, y: footY, text: 'created by. 교육뮤지컬 꿈꾸는 치수쌤', font: F_FOOT, color: '#9ca3af' });

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#4F46E5'; ctx.fillRect(0, 0, W, 6);
  for (const op of ops) { ctx.font = op.font; ctx.fillStyle = op.color; ctx.fillText(op.text, op.x, op.y); }
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- 성취기준 직접 찾기 패널 (ssdguide 스타일 4단계 필터 + 키워드 검색) ----------
function StandardFinder({
  isSaved, onAdd, onRemove,
}: {
  isSaved: (type: string, id: string) => boolean;
  onAdd: (s: AchievementStandard) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<StandardFilter>({});
  const [facets, setFacets] = useState<{ curriculumTypes: string[]; grades: string[]; subjects: string[]; domains: string[] }>({
    curriculumTypes: [], grades: [], subjects: [], domains: [],
  });
  const [results, setResults] = useState<AchievementStandard[]>([]);
  const [loading, setLoading] = useState(false);

  // 상위 필터가 바뀌면 하위 선택을 초기화한다(연쇄 필터).
  const setField = useCallback((key: keyof StandardFilter, value: string) => {
    setFilter(prev => {
      const next: StandardFilter = { ...prev, [key]: value };
      if (key === 'curriculumType') { next.grade = ''; next.subject = ''; next.domain = ''; }
      else if (key === 'grade') { next.subject = ''; next.domain = ''; }
      else if (key === 'subject') { next.domain = ''; }
      return next;
    });
  }, []);

  // 선택 가능한 하위 옵션 갱신 (키워드 제외 4단계 필터에만 반응)
  useEffect(() => {
    if (!open) return;
    getStandardFacets(filter).then(setFacets).catch(() => { /* ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filter.curriculumType, filter.grade, filter.subject, filter.domain]);

  // 결과 검색 (필터·키워드 변경 시)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchStandards(filter, 80)
        .then(r => { if (!cancelled) { setResults(r); setLoading(false); } })
        .catch(() => { if (!cancelled) { setResults([]); setLoading(false); } });
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, filter]);

  const sortedGrades = useMemo(() => {
    return [...facets.grades].sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a); const bi = GRADE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [facets.grades]);

  const hasFilter = !!(filter.curriculumType || filter.grade || filter.subject || filter.domain || (filter.keyword ?? '').trim());

  const selStyle: React.CSSProperties = {
    fontSize: 13, padding: '6px 10px', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)', maxWidth: 200,
  };

  return (
    <div style={{ marginTop: 12, border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, padding: '10px 14px', background: 'var(--color-bg-secondary)',
          border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
        aria-expanded={open}
      >
        <span>🔎 성취기준 직접 찾기 <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>— 추천에 없는 성취기준도 직접 검색해 담기</span></span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: 14 }}>
          {/* 4단계 필터 + 키워드 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <select style={selStyle} value={filter.curriculumType ?? ''} onChange={e => setField('curriculumType', e.target.value)}>
              <option value="">교육과정 전체</option>
              {facets.curriculumTypes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={selStyle} value={filter.grade ?? ''} onChange={e => setField('grade', e.target.value)}>
              <option value="">학년군 전체</option>
              {sortedGrades.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <select style={selStyle} value={filter.subject ?? ''} onChange={e => setField('subject', e.target.value)}>
              <option value="">교과 전체</option>
              {facets.subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={selStyle} value={filter.domain ?? ''} onChange={e => setField('domain', e.target.value)}>
              <option value="">영역 전체</option>
              {facets.domains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <input
              type="search"
              value={filter.keyword ?? ''}
              onChange={e => setFilter(prev => ({ ...prev, keyword: e.target.value }))}
              placeholder="코드·내용·교과 키워드 검색"
              style={{ ...selStyle, maxWidth: 220, flex: '1 1 180px' }}
            />
            {hasFilter && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFilter({})}>초기화</button>
            )}
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
            {loading ? '검색 중…' : `${results.length}개${results.length >= 80 ? '+ (상위 80개)' : ''} 표시${!hasFilter ? ' · 필터나 키워드로 좁혀보세요' : ''}`}
          </p>

          <div className={styles.standardGrid}>
            {results.map(standard => (
              <div key={standard.id} className={`card ${styles.standardCard}`}>
                <div className={styles.standardMeta}>
                  <div className={styles.standardTags}>
                    <span className="tag">{standard.curriculumType}</span>
                    <span className="tag">{standard.subject}</span>
                    {standard.grade && <span className="tag">{standard.grade}</span>}
                    {standard.domain && <span className="tag">{standard.domain}</span>}
                  </div>
                </div>
                <code className={styles.standardId}>{standard.id}</code>
                <p className={styles.standardContent}>{standard.content}</p>
                <button
                  className={`${styles.bookmarkBtnSm} ${isSaved('standard', standard.id) ? styles.bookmarkSaved : ''}`}
                  title={isSaved('standard', standard.id) ? '바구니에서 빼기' : '인사이트 바구니에 담기'}
                  aria-label={isSaved('standard', standard.id) ? '인사이트 바구니에서 빼기' : '인사이트 바구니에 담기'}
                  aria-pressed={isSaved('standard', standard.id)}
                  onClick={() => isSaved('standard', standard.id) ? onRemove(standard.id) : onAdd(standard)}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    {isSaved('standard', standard.id) ? 'bookmark_added' : 'bookmark_add'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
export function DashboardPage({ onGoToMap }: DashboardPageProps) {
  const { state, selectVenue, selectPerformance, addInsightItem, removeInsightItem, addInsightMemo } = useApp();
  const { selectedVenue, selectedPerformance } = state;

  // 바구니에 담긴 항목 집합 (담기 버튼의 '담김' 상태 표시 + 토글용)
  // 작품별로 독립적으로 담기므로 '담김' 상태도 현재 선택된 작품(performanceId) 기준으로 판정한다.
  const currentPerfId = selectedPerformance?.id;
  const savedKeys = useMemo(
    () => new Set(state.insightBoard.items.map(i => `${i.type}:${i.id}:${i.performanceId ?? ''}`)),
    [state.insightBoard.items],
  );
  const isSaved = useCallback(
    (type: string, id: string) => savedKeys.has(`${type}:${id}:${currentPerfId ?? ''}`),
    [savedKeys, currentPerfId],
  );

  const [showImageModal, setShowImageModal] = useState(false);
  const [posterModalSrc, setPosterModalSrc] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [subjectFilter, setSubjectFilter] = useState<string[]>([]);

  // AI 작품 소개 (버튼 트리거)
  const [intro, setIntro] = useState<PerformanceIntro | null>(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const [introMsg, setIntroMsg] = useState('');
  const introMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 작품 정보(위키백과) 팝업 — AI 미사용
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiData, setWikiData] = useState<WikiSummary | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);

  useEffect(() => {
    setGradeFilter([]); setSubjectFilter([]);
    setIntro(null); setIntroError(null); setIntroLoading(false);
    setWikiOpen(false); setWikiData(null); setWikiError(null); setWikiLoading(false);
  }, [selectedPerformance?.id]);

  // 모바일(1열 레이아웃)에서는 공연 목록이 위, 상세가 아래에 쌓이므로
  // 공연을 선택하면 상세 영역으로 자동 스크롤해 "선택했는데 변화가 없다"는 혼란을 막는다.
  const dashboardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selectedPerformance?.id) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      dashboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedPerformance?.id]);

  const { performances, loading: perfLoading, error: perfError } = usePerformances(selectedVenue);
  const { performance: detailedPerformance, loading: detailLoading } = usePerformanceDetail(
    selectedPerformance?.id ?? null,
  );
  const displayPerformance = detailedPerformance ?? selectedPerformance;

  // 현재 공연을 인사이트 항목으로 변환 (담기/자동 담기에 공용 사용)
  const buildPerformanceItem = useCallback((): InsightItem | null => {
    if (!displayPerformance) return null;
    return {
      type: 'performance',
      id: displayPerformance.id,
      title: displayPerformance.title,
      subtitle: displayPerformance.venue,
      thumbnail: displayPerformance.poster,
      detail: displayPerformance.synopsis,
      // AI 융합수업 설계 시 '작품 기본 정보'로 활용
      meta: {
        genre: displayPerformance.genre,
        venue: displayPerformance.venue,
        venueId: displayPerformance.venueId,
        price: displayPerformance.price,
        runtime: displayPerformance.runtime,
        rating: displayPerformance.rating,
        period: `${formatDate(displayPerformance.startDate)} ~ ${formatDate(displayPerformance.endDate)}`,
        child: displayPerformance.child,
        keywords: displayPerformance.keywords,
      },
      performanceId: displayPerformance.id,
      performanceTitle: displayPerformance.title,
      savedAt: new Date().toISOString(),
    };
  }, [displayPerformance]);

  // 성취기준·영화·도서를 담을 때, 그 공연 작품도 자동으로 함께 담는다.
  // (작품 담기 버튼을 놓치기 쉬운 UI 보완 — addInsightItem은 중복을 자동 제거)
  const addWithPerformance = useCallback((child: InsightItem) => {
    const perf = buildPerformanceItem();
    if (perf) addInsightItem(perf);
    addInsightItem(child);
  }, [buildPerformanceItem, addInsightItem]);

  const {
    matches, currLoading, activeFilters, setFilters,
    movies, books, moviesLoading, booksLoading, moviesError, booksError,
    runCuration, aiLoading, curated, aiError, themes, sourceWork, canCurate,
  } = useDashboardCuration(displayPerformance);

  const handleShowWiki = useCallback(async () => {
    if (!displayPerformance) return;
    setWikiOpen(true);
    setWikiError(null);
    setWikiData(null);
    setWikiLoading(true);
    try {
      const data = await fetchWikiSummary(displayPerformance.title, displayPerformance.genre);
      setWikiData(data);
      if (!data) setWikiError('위키백과에서 이 작품의 문서를 찾지 못했습니다.');
    } catch {
      setWikiError('작품 정보를 불러오지 못했습니다.');
    } finally {
      setWikiLoading(false);
    }
  }, [displayPerformance]);

  const handleIntroduce = useCallback(async () => {
    if (!displayPerformance) return;
    setIntroLoading(true);
    setIntroError(null);
    try {
      setIntro(await aiIntroducePerformance(displayPerformance));
    } catch (err) {
      setIntroError(err instanceof Error ? `작품 소개 생성 실패: ${err.message}` : '작품 소개 생성에 실패했습니다.');
    } finally {
      setIntroLoading(false);
    }
  }, [displayPerformance]);

  // ── AI 교육 해설 내보내기 (텍스트 복사 / TXT / JPG 다운로드 / JPG 복사) ──
  const flashIntro = useCallback((msg: string) => {
    if (introMsgTimer.current) clearTimeout(introMsgTimer.current);
    setIntroMsg(msg);
    introMsgTimer.current = setTimeout(() => setIntroMsg(''), 2200);
  }, []);

  const handleCopyIntroText = useCallback(async () => {
    if (!intro || !displayPerformance) return;
    try {
      await navigator.clipboard.writeText(introToText(intro, displayPerformance.title));
      flashIntro('✅ 텍스트 복사됨');
    } catch { flashIntro('❌ 복사 실패'); }
  }, [intro, displayPerformance, flashIntro]);

  const handleDownloadIntroTxt = useCallback(() => {
    if (!intro || !displayPerformance) return;
    const blob = new Blob([introToText(intro, displayPerformance.title)], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `AI교육해설_${displayPerformance.title}.txt`);
    flashIntro('✅ TXT 저장됨');
  }, [intro, displayPerformance, flashIntro]);

  const handleDownloadIntroJpg = useCallback(async () => {
    if (!intro || !displayPerformance) return;
    try {
      const canvas = await renderIntroCanvas(intro, displayPerformance.title);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      if (blob) { downloadBlob(blob, `AI교육해설_${displayPerformance.title}.jpg`); flashIntro('✅ JPG 저장됨'); }
    } catch { flashIntro('❌ 이미지 생성 실패'); }
  }, [intro, displayPerformance, flashIntro]);

  const handleCopyIntroJpg = useCallback(async () => {
    if (!intro || !displayPerformance) return;
    try {
      const canvas = await renderIntroCanvas(intro, displayPerformance.title);
      // 클립보드 이미지 쓰기는 브라우저 호환상 PNG만 안정적으로 지원된다.
      const blob = await canvasToBlob(canvas, 'image/png');
      if (!blob) throw new Error('no blob');
      const ClipItem = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (!ClipItem || !navigator.clipboard?.write) throw new Error('unsupported');
      await navigator.clipboard.write([new ClipItem({ 'image/png': blob })]);
      flashIntro('✅ 이미지 복사됨');
    } catch {
      flashIntro('⚠️ 이미지 복사 미지원 — JPG 저장을 이용하세요');
    }
  }, [intro, displayPerformance, flashIntro]);

  // AI 작품 소개를 인사이트 바구니에 메모로 담는다(작품도 함께 담아 그룹을 만든다).
  // (AI 융합수업 설계의 '메모로 저장'과 동일한 방식)
  const handleSaveIntroToBasket = useCallback(() => {
    if (!intro || !displayPerformance) return;
    const perf = buildPerformanceItem();
    if (perf) addInsightItem(perf);
    addInsightMemo(
      introToText(intro, displayPerformance.title),
      displayPerformance.id,
      displayPerformance.title,
    );
    flashIntro('✅ 인사이트 바구니에 담음');
  }, [intro, displayPerformance, buildPerformanceItem, addInsightItem, addInsightMemo, flashIntro]);

  const availableGrades = useMemo(() => {
    const grades = [...new Set(matches.map(m => m.standard.grade))];
    return grades.sort((a, b) => {
      const ai = GRADE_ORDER.indexOf(a ?? '');
      const bi = GRADE_ORDER.indexOf(b ?? '');
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [matches]);
  const availableSubjects = useMemo(() => [...new Set(matches.map(m => m.standard.subject))].sort(), [matches]);

  const displayedMatches = useMemo(() => matches.filter(m => {
    const gradeOk = gradeFilter.length === 0 || gradeFilter.includes(m.standard.grade);
    const subjectOk = subjectFilter.length === 0 || subjectFilter.includes(m.standard.subject);
    return gradeOk && subjectOk;
  }), [matches, gradeFilter, subjectFilter]);

  const handlePosterClick = useCallback((src: string) => {
    setPosterModalSrc(src);
  }, []);

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
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <span style={{ fontSize: '32px' }}>🎭</span>
              <p style={{ fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                현재 공연 예정 작품이 없습니다.<br />
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>KOPIS에 등록된 공연이 없거나<br />일시적인 API 오류일 수 있습니다.</span>
              </p>
            </div>
          )}

          <ul className={styles.perfCards}>
            {performances.map(perf => (
              <li key={perf.id}>
                <button
                  className={`card ${styles.perfCard} ${selectedPerformance?.id === perf.id ? styles.perfCardActive : ''}`}
                  onClick={() => selectPerformance(perf)}
                  aria-pressed={selectedPerformance?.id === perf.id}
                >
                  {/* 포스터 (작은 썸네일 — 클릭 불가, 큰 포스터는 상세에서) */}
                  {perf.poster ? (
                    <img
                      src={perf.poster}
                      alt={perf.title}
                      className={styles.perfPoster}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <PosterFallback size="sm" />
                  )}
                  <div className={styles.perfInfo}>
                    <span className="tag" style={{ alignSelf: 'flex-start', fontSize: '10px' }}>{perf.genre}</span>
                    <strong className={styles.perfTitle}>{perf.title}</strong>
                    <small className={styles.perfDate}>
                      {formatDate(perf.startDate)} ~ {formatDate(perf.endDate)}
                    </small>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                      <span className={`tag ${styles.stateTag}`} data-state={perf.state}>
                        {perf.state}
                      </span>
                      {perf.child === true && (
                        <span style={{
                          fontSize: '10px', padding: '2px 6px', borderRadius: '999px',
                          background: '#fef9c3', color: '#a16207',
                        }}>
                          👶 아동
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* 오른쪽: 융합 대시보드 */}
        <main className={styles.dashboard} ref={dashboardRef}>
          {!selectedPerformance ? (
            <div className="empty-state" style={{ minHeight: '400px' }}>
              <span style={{ fontSize: '48px' }}>🖱️</span>
              <p>
                <span className={styles.directionDesktop}>왼쪽에서</span>
                <span className={styles.directionMobile}>위쪽에서</span>
                {' '}공연을 선택하면<br />교육과정 연계 정보가 나타납니다.
              </p>
            </div>
          ) : (
            <>
              {/* 공연 상세 */}
              <section className={`card ${styles.perfDetail} fade-in`}>
                {/* 클릭 가능한 포스터 */}
                <div
                  className={styles.posterWrapper}
                  onClick={() => displayPerformance!.poster && handlePosterClick(displayPerformance!.poster)}
                  title={displayPerformance!.poster ? '클릭하면 큰 이미지로 볼 수 있습니다' : undefined}
                  style={{ cursor: displayPerformance!.poster ? 'zoom-in' : 'default' }}
                >
                  {displayPerformance!.poster ? (
                    <>
                      <img
                        src={displayPerformance!.poster}
                        alt={displayPerformance!.title}
                        className={styles.detailPoster}
                        onError={(e) => {
                          const wrap = (e.currentTarget as HTMLElement).parentElement!;
                          wrap.innerHTML = '<div style="width:140px;height:190px;background:var(--color-bg-secondary);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">🎭</div>';
                        }}
                      />
                      <div className={styles.posterOverlay}>
                        <span style={{ fontSize: '22px' }}>🔍</span>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>크게 보기</span>
                      </div>
                    </>
                  ) : (
                    <PosterFallback size="lg" />
                  )}
                </div>

                <div className={styles.detailInfo}>
                  <div className={styles.detailTags}>
                    <span className="tag">{displayPerformance!.genre}</span>
                    {displayPerformance!.rating && (
                      <span className="tag">{displayPerformance!.rating}</span>
                    )}
                    {displayPerformance!.runtime && (
                      <span className="tag">⏱ {displayPerformance!.runtime}</span>
                    )}
                    {/* 아동 배지 */}
                    <ChildBadge child={displayPerformance!.child} />
                  </div>
                  <h2 className={styles.detailTitle}>{displayPerformance!.title}</h2>
                  <p className={styles.detailVenue}>📍 {displayPerformance!.venue}</p>
                  <p className={styles.perfDate}>
                    {formatDate(displayPerformance!.startDate)} ~ {formatDate(displayPerformance!.endDate)}
                  </p>

                  {/* 줄거리 (sty) */}
                  {detailLoading && <p className={styles.emptyText}>공연 소개 불러오는 중...</p>}
                  {!detailLoading && displayPerformance!.synopsis && (
                    <SynopsisBox text={displayPerformance!.synopsis} />
                  )}

                  {/* 작품 소개: 위키백과(무료) + AI 심화(선택) */}
                  {!detailLoading && displayPerformance!.title && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        className={`btn btn-sm ${isSaved('performance', displayPerformance!.id) ? 'btn-primary' : 'btn-outline'}`}
                        aria-pressed={isSaved('performance', displayPerformance!.id)}
                        onClick={() => {
                          if (isSaved('performance', displayPerformance!.id)) {
                            removeInsightItem(displayPerformance!.id, displayPerformance!.id);
                            return;
                          }
                          const perf = buildPerformanceItem();
                          if (perf) addInsightItem(perf);
                        }}
                        title={isSaved('performance', displayPerformance!.id) ? '인사이트 바구니에서 빼기' : '인사이트 바구니에 담기'}
                      >
                        {isSaved('performance', displayPerformance!.id) ? '✓ 바구니에 담김' : '🔖 바구니에 담기'}
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleShowWiki}
                        title="위키백과·나무위키 정보를 팝업으로 보여줍니다. (AI 미사용)"
                      >
                        📖 작품 정보
                      </button>
                      {!intro && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={handleIntroduce}
                          disabled={introLoading}
                          title="AI가 작품을 학생 눈높이로 교육적으로 해설합니다. (AI 호출)"
                        >
                          {introLoading ? '✨ AI 해설 생성 중…' : '✨ AI 교육 해설'}
                        </button>
                      )}
                      {introError && (
                        <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 6 }}>{introError}</p>
                      )}
                      {intro && (
                        <div className="card" style={{ padding: 16, marginTop: 4, background: 'rgba(107,138,253,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 14 }}>✨ AI 작품 소개</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {introMsg && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginRight: 2 }}>{introMsg}</span>}
                              <button className={styles.introToolBtn} title="인사이트 바구니에 담기" aria-label="인사이트 바구니에 담기" onClick={handleSaveIntroToBasket}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>shopping_basket</span></button>
                              <button className={styles.introToolBtn} title="텍스트 클립보드 복사" aria-label="텍스트 복사" onClick={handleCopyIntroText}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>content_paste</span></button>
                              <button className={styles.introToolBtn} title="TXT 파일 다운로드" aria-label="TXT 다운로드" onClick={handleDownloadIntroTxt}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>description</span></button>
                              <button className={styles.introToolBtn} title="JPG 이미지 다운로드" aria-label="JPG 다운로드" onClick={handleDownloadIntroJpg}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>image</span></button>
                              <button className={styles.introToolBtn} title="이미지 클립보드 복사" aria-label="이미지 복사" onClick={handleCopyIntroJpg}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_camera</span></button>
                              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setIntro(null)}>접기</button>
                            </div>
                          </div>
                          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0' }}>{intro.summary}</p>
                          {intro.themes.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '6px 0' }}>
                              {intro.themes.map(t => <span key={t} className="tag" style={{ fontSize: 11 }}>{t}</span>)}
                            </div>
                          )}
                          {intro.watchPoints.length > 0 && (
                            <>
                              <h5 style={{ margin: '10px 0 4px', fontSize: 13 }}>👀 관람 포인트</h5>
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                                {intro.watchPoints.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </>
                          )}
                          {intro.educationalValue && (
                            <p style={{ fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>
                              <strong>🎓 교육적 의의 </strong>{intro.educationalValue}
                            </p>
                          )}
                          {intro.discussionStarters.length > 0 && (
                            <>
                              <h5 style={{ margin: '10px 0 4px', fontSize: 13 }}>💬 관람 후 이야깃거리</h5>
                              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                                {intro.discussionStarters.map((q, i) => <li key={i}>{q}</li>)}
                              </ul>
                            </>
                          )}
                          {intro.sourceNote && (
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>
                              🔎 참고: {intro.sourceNote}
                            </p>
                          )}
                          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                            {intro.verified === false
                              ? '⚠️ 웹 검색으로 작품을 정확히 특정하지 못했습니다. 동명의 다른 작품일 수 있으니 반드시 확인해 주세요.'
                              : 'Google 검색을 참고해 생성한 결과이며, 참고용으로 활용해 주세요.'}
                          </p>
                        </div>
                      )}
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

                  {/* 공연소개 이미지 */}
                  {!detailLoading && displayPerformance!.images && displayPerformance!.images.length > 0 && (
                    <div className={styles.castBox}>
                      <button
                        className={styles.introLink}
                        onClick={() => setShowImageModal(true)}
                      >
                        📷 공연소개 이미지 보기 ({displayPerformance!.images!.length}장)
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
                </div>
              </section>

              {/* 통합 AI 큐레이션 — 성취기준·영화·도서를 한 번에 */}
              <section className={`card ${styles.curationPanel}`}>
                <div className={styles.curationHead}>
                  <div>
                    <strong className={styles.curationTitle}>✨ AI 큐레이션</strong>
                    <p className={styles.curationDesc}>
                      작품의 원작·주제를 웹에서 찾아 <b>성취기준 · 영화 · 도서</b>를 한 번에 큐레이션합니다.
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={runCuration}
                    disabled={!canCurate || aiLoading || curated}
                    title="작품 원작/배경을 웹 검색으로 특정한 뒤, 성취기준·영화·도서를 한 번의 호출로 선별·랭킹합니다."
                  >
                    {aiLoading ? '✨ 큐레이션 중…' : curated ? '✓ 큐레이션 완료' : '✨ AI 큐레이션 실행'}
                  </button>
                </div>
                {/* 웹 검색으로 특정한 원작/배경 */}
                {curated && sourceWork && (
                  <p className={styles.curationSource}>🔎 원작·배경: <b>{sourceWork}</b></p>
                )}
                {/* AI가 파악한 작품 핵심 주제 */}
                {curated && themes.length > 0 && (
                  <div className={styles.curationThemes}>
                    <span className={styles.curationThemesLabel}>🎯 작품 주제</span>
                    {themes.map(t => <span key={t} className="tag" style={{ fontSize: 11 }}>{t}</span>)}
                  </div>
                )}
                {aiError && (
                  <p style={{ fontSize: 12, color: 'var(--color-danger)', marginTop: 8 }}>{aiError}</p>
                )}
              </section>

              {/* 교육과정 성취기준 */}
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3 className="section-title">
                    교육과정 성취기준
                    {curated && (
                      <span
                        title="AI가 의미 기반으로 큐레이션한 결과입니다."
                        style={{
                          marginLeft: 8, fontSize: '11px', fontWeight: 600,
                          color: 'var(--color-primary, #6b8afd)',
                          background: 'rgba(107,138,253,0.12)',
                          padding: '2px 7px', borderRadius: '10px', verticalAlign: 'middle',
                        }}
                      >✨ AI 큐레이션</span>
                    )}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {matches.length > 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        {aiLoading ? 'AI 분석 중…' : `총 ${matches.length}개 · ${availableGrades.length}개 학년군`}
                      </span>
                    )}
                  </div>
                </div>

                {/* 과정 필터 */}
                <div className={styles.filterGroup}>
                  <span className={styles.filterLabel}>과정</span>
                  <div className={styles.filterChips}>
                    {CURRICULUM_FILTERS.map(f => (
                      <button
                        key={f.value}
                        className={`${styles.filterChip} ${activeFilters.includes(f.value) ? styles.filterChipActive : ''}`}
                        onClick={() => setFilters(
                          activeFilters.includes(f.value)
                            ? activeFilters.filter(x => x !== f.value)
                            : [...activeFilters, f.value]
                        )}
                      >
                        {activeFilters.includes(f.value) && <span className={styles.chipCheck}>✓</span>}
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 학년군 필터 */}
                {availableGrades.length > 0 && (
                  <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>학년군</span>
                    <div className={styles.filterChips}>
                      {availableGrades.map(grade => (
                        <button
                          key={grade}
                          className={`${styles.filterChip} ${gradeFilter.includes(grade ?? '') ? styles.filterChipActive : ''}`}
                          onClick={() => setGradeFilter(
                            gradeFilter.includes(grade ?? '')
                              ? gradeFilter.filter(g => g !== grade)
                              : [...gradeFilter, grade ?? '']
                          )}
                        >
                          {gradeFilter.includes(grade ?? '') && <span className={styles.chipCheck}>✓</span>}
                          {grade}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 교과 필터 */}
                {availableSubjects.length > 0 && (
                  <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>교과</span>
                    <div className={styles.filterChips}>
                      {availableSubjects.map(subject => (
                        <button
                          key={subject}
                          className={`${styles.filterChip} ${subjectFilter.includes(subject) ? styles.filterChipActive : ''}`}
                          onClick={() => setSubjectFilter(
                            subjectFilter.includes(subject)
                              ? subjectFilter.filter(s => s !== subject)
                              : [...subjectFilter, subject]
                          )}
                        >
                          {subjectFilter.includes(subject) && <span className={styles.chipCheck}>✓</span>}
                          {subject}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currLoading && <LoadingSpinner size="sm" />}

                {!currLoading && displayedMatches.length === 0 && (
                  <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                    <span style={{ fontSize: '28px' }}>📋</span>
                    <p style={{ fontSize: 'var(--font-size-sm)', textAlign: 'center' }}>
                      {matches.length === 0
                        ? '공연 상세 정보(줄거리)가 로드되면 성취기준이 매칭됩니다.'
                        : '선택한 필터 조건에 맞는 성취기준이 없습니다.'}
                    </p>
                  </div>
                )}

                <div className={styles.standardGrid}>
                  {displayedMatches.map(({ standard, matchedKeywords, score, aiReason, aiRelevance }) => (
                    <div key={standard.id} className={`card ${styles.standardCard}`}>
                      <div className={styles.standardMeta}>
                        <div className={styles.standardTags}>
                          <span className="tag">{standard.curriculumType}</span>
                          <span className="tag">{standard.subject}</span>
                          {standard.grade && <span className="tag">{standard.grade}</span>}
                        </div>
                        {score > 0 && (
                          <span className={styles.score} title={aiRelevance ? 'AI 적합도' : '매칭 점수'}>
                            {aiRelevance ? '✨' : '★'} {aiRelevance ?? score}
                          </span>
                        )}
                      </div>
                      <code className={styles.standardId}>{standard.id}</code>
                      <p className={styles.standardContent}>{standard.content}</p>
                      {aiReason && (
                        <p style={{
                          fontSize: '12px', color: 'var(--color-text-muted)', margin: '6px 0 0',
                          lineHeight: 1.45, fontStyle: 'italic',
                        }}>
                          💡 {aiReason}
                        </p>
                      )}
                      {matchedKeywords.length > 0 && (
                        <div className={styles.matchedKws}>
                          {matchedKeywords.slice(0, 6).map(kw => (
                            <span key={kw} className={`tag ${styles.kwTag}`}>{kw}</span>
                          ))}
                        </div>
                      )}
                      <button
                        className={`${styles.bookmarkBtnSm} ${isSaved('standard', standard.id) ? styles.bookmarkSaved : ''}`}
                        title={isSaved('standard', standard.id) ? '바구니에서 빼기' : '인사이트 바구니에 담기'}
                        aria-label={isSaved('standard', standard.id) ? '인사이트 바구니에서 빼기' : '인사이트 바구니에 담기'}
                        aria-pressed={isSaved('standard', standard.id)}
                        onClick={() => isSaved('standard', standard.id)
                          ? removeInsightItem(standard.id, displayPerformance!.id)
                          : addWithPerformance({
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
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {isSaved('standard', standard.id) ? 'bookmark_added' : 'bookmark_add'}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* 성취기준 직접 찾기 — 추천이 놓친 성취기준도 교사가 직접 검색해 담기 */}
                <StandardFinder
                  isSaved={isSaved}
                  onRemove={(id) => removeInsightItem(id, displayPerformance!.id)}
                  onAdd={(standard) => addWithPerformance({
                    type: 'standard',
                    id: standard.id,
                    title: standard.id,
                    subtitle: `${standard.subject} · ${standard.grade ?? ''}`,
                    detail: standard.content,
                    performanceId: displayPerformance!.id,
                    performanceTitle: displayPerformance!.title,
                    savedAt: new Date().toISOString(),
                  })}
                />
              </section>

              {/* 연계 영화 */}
              <section className={styles.section}>
                <h3 className="section-title">연계 추천 영화{curated && ' ✨'}</h3>
                {moviesLoading && <LoadingSpinner size="sm" />}
                {moviesError && <ErrorMessage message={moviesError} />}
                {!moviesLoading && !moviesError && movies.length === 0 && (
                  <p className={styles.emptyText}>
                    {curated
                      ? 'AI가 연계 영화를 찾지 못했습니다.'
                      : '기본 검색 결과가 없어요. 위 “✨ AI 큐레이션”을 눌러보세요.'}
                  </p>
                )}
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
                          <img
                            src={movie.posterPath}
                            alt={movie.title}
                            className={styles.mediaPoster}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className={`skeleton ${styles.mediaPosterSkeleton}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '28px' }}>🎬</span>
                          </div>
                        )}
                        <div className={styles.mediaInfo}>
                          <strong className={styles.mediaTitle}>{movie.title}</strong>
                          <small className={styles.mediaYear}>{movie.releaseDate?.slice(0, 4)}</small>
                          <div className={styles.mediaRating}>★ {movie.voteAverage.toFixed(1)}</div>
                          {movie.genres && (
                            <div className={styles.mediaTags}>
                              {movie.genres.slice(0, 2).map(g => (
                                <span key={g} className="tag" style={{ fontSize: '10px' }}>{g}</span>
                              ))}
                            </div>
                          )}
                          {movie.aiReason && (
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                              💡 {movie.aiReason}
                            </p>
                          )}
                        </div>
                        <button
                          className={`${styles.bookmarkBtnSm} ${isSaved('movie', String(movie.id)) ? styles.bookmarkSaved : ''}`}
                          title={isSaved('movie', String(movie.id)) ? '바구니에서 빼기' : '인사이트 바구니에 담기'}
                          aria-label={isSaved('movie', String(movie.id)) ? '인사이트 바구니에서 빼기' : '인사이트 바구니에 담기'}
                          aria-pressed={isSaved('movie', String(movie.id))}
                          onClick={e => {
                            e.stopPropagation();
                            if (isSaved('movie', String(movie.id))) { removeInsightItem(String(movie.id), displayPerformance!.id); return; }
                            addWithPerformance({
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
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {isSaved('movie', String(movie.id)) ? 'bookmark_added' : 'bookmark_add'}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* 연계 도서 */}
              <section className={styles.section}>
                <h3 className="section-title">연계 추천 도서{curated && ' ✨'}</h3>
                {booksLoading && <LoadingSpinner size="sm" />}
                {booksError && <ErrorMessage message={booksError} />}
                {!booksLoading && !booksError && books.length === 0 && (
                  <p className={styles.emptyText}>
                    {curated
                      ? 'AI가 연계 도서를 찾지 못했습니다.'
                      : '기본 검색 결과가 없어요. 위 “✨ AI 큐레이션”을 눌러보세요.'}
                  </p>
                )}
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
                          <img
                            src={book.image}
                            alt={book.title}
                            className={styles.mediaPoster}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className={`skeleton ${styles.mediaPosterSkeleton}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '28px' }}>📚</span>
                          </div>
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
                          {book.aiReason && (
                            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
                              💡 {book.aiReason}
                            </p>
                          )}
                        </div>
                        <button
                          className={`${styles.bookmarkBtnSm} ${isSaved('book', book.isbn) ? styles.bookmarkSaved : ''}`}
                          title={isSaved('book', book.isbn) ? '바구니에서 빼기' : '인사이트 바구니에 담기'}
                          aria-label={isSaved('book', book.isbn) ? '인사이트 바구니에서 빼기' : '인사이트 바구니에 담기'}
                          aria-pressed={isSaved('book', book.isbn)}
                          onClick={e => {
                            e.stopPropagation();
                            if (isSaved('book', book.isbn)) { removeInsightItem(book.isbn, displayPerformance!.id); return; }
                            addWithPerformance({
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
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {isSaved('book', book.isbn) ? 'bookmark_added' : 'bookmark_add'}
                          </span>
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

      {/* 작품 정보(위키백과) 모달 */}
      {wikiOpen && (
        <WikiModal
          title={displayPerformance?.title ?? ''}
          data={wikiData}
          loading={wikiLoading}
          error={wikiError}
          onClose={() => setWikiOpen(false)}
        />
      )}

      {/* 포스터 크게 보기 모달 */}
      {posterModalSrc && (
        <PosterModal
          src={posterModalSrc}
          title={displayPerformance?.title ?? ''}
          onClose={() => setPosterModalSrc(null)}
        />
      )}

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
  if (d.includes('.')) return d;
  if (d.length < 8) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}
