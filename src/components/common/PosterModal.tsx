import { useState, useEffect, useCallback } from 'react';

interface PosterModalProps {
  src: string;
  title: string;
  onClose: () => void;
}

type CopyState = 'idle' | 'copying' | 'success' | 'error';
type DownloadState = 'idle' | 'downloading' | 'error';

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error('fetch failed');
  return res.blob();
}

async function blobToPngBlob(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export function PosterModal({ src, title, onClose }: PosterModalProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [dlState, setDlState] = useState<DownloadState>('idle');

  // ESC 닫기
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  // 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleDownload = useCallback(async () => {
    setDlState('downloading');
    try {
      const blob = await fetchAsBlob(src);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${title}-포스터.jpg`;
      a.click();
      URL.revokeObjectURL(blobUrl);
      setDlState('idle');
    } catch {
      // CORS 차단 시 새 탭으로 열기 (폴백)
      window.open(src, '_blank', 'noopener');
      setDlState('idle');
    }
  }, [src, title]);

  const handleCopy = useCallback(async () => {
    setCopyState('copying');
    try {
      const blob = await fetchAsBlob(src);
      const pngBlob = await blobToPngBlob(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      setCopyState('success');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [src]);

  const copyLabel = {
    idle: '클립보드 복사',
    copying: '복사 중...',
    success: '✓ 복사 완료',
    error: '복사 실패 (CORS)',
  }[copyState];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      {/* 포스터 이미지 */}
      <img
        src={src}
        alt={`${title} 포스터`}
        style={{
          maxHeight: 'calc(100vh - 160px)',
          maxWidth: 'min(480px, 100%)',
          objectFit: 'contain',
          borderRadius: '12px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      />

      {/* 제목 */}
      <p style={{
        marginTop: '14px',
        color: 'rgba(255,255,255,0.85)',
        fontSize: '15px',
        fontWeight: 600,
        textAlign: 'center',
        maxWidth: '480px',
      }}>
        {title}
      </p>

      {/* 액션 버튼 */}
      <div
        style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap', justifyContent: 'center' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleDownload}
          disabled={dlState === 'downloading'}
          style={btnStyle('#3B82F6')}
        >
          {dlState === 'downloading' ? '다운로드 중...' : '⬇ 다운로드'}
        </button>
        <button
          onClick={handleCopy}
          disabled={copyState === 'copying'}
          style={btnStyle(copyState === 'success' ? '#22C55E' : copyState === 'error' ? '#EF4444' : '#6B7280')}
        >
          {copyLabel}
        </button>
        <button onClick={onClose} style={btnStyle('#374151', true)}>
          닫기
        </button>
      </div>
    </div>
  );
}

function btnStyle(bg: string, outline = false): React.CSSProperties {
  return {
    padding: '9px 20px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: outline ? '1.5px solid rgba(255,255,255,0.3)' : 'none',
    background: outline ? 'transparent' : bg,
    color: '#fff',
    transition: 'opacity 0.15s',
    fontFamily: 'inherit',
  };
}
