/**
 * 인사이트 바구니 공유 인코더 (클라이언트)
 * ────────────────────────────────────────────────────────────
 * 공유 URL을 최대한 짧게 만들기 위한 코덱 모음.
 *
 * 우선순위(InsightPage.handleShare / App 로드):
 *   1) 단축링크  ?s=<id>  — 서버(Netlify Blobs)에 저장한 짧은 키 (가장 짧음)
 *   2) 압축링크  ?z=<gzip-base64url>  — 서버 실패 시 gzip 압축 폴백 (긴 링크를 크게 단축)
 *   3) 레거시    ?share=<base64url>   — CompressionStream 미지원 브라우저 최종 폴백
 *
 * gzip은 한국어 수업안 메모처럼 반복이 많은 텍스트를 60~75%가량 줄여
 * "압축 폴백"만으로도 기존 ?share= 링크 대비 훨씬 짧아진다.
 */

import type { InsightBoard } from '../types';

// ── base64url 유틸 (URL-safe: +→-, /→_, 패딩 제거) ──
function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const restored = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = restored + '='.repeat((4 - (restored.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** 현재 브라우저가 gzip 스트림 압축을 지원하는지 */
export function supportsCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

// TextEncoder/Uint8Array는 lib 제네릭상 BlobPart로 바로 받지 못해 캐스팅한다(런타임 안전).
function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart]);
}

/** 보드를 gzip 압축 후 base64url 문자열로 인코딩한다 (?z= 파라미터용). */
export async function encodeBoardGzip(board: InsightBoard): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(board));
  const stream = toBlob(input).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToBase64Url(new Uint8Array(buf));
}

/** ?z= 파라미터(gzip base64url)를 보드 객체로 복원한다. */
export async function decodeBoardGzip(param: string): Promise<InsightBoard> {
  const bytes = base64UrlToBytes(param);
  const stream = toBlob(bytes).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buf)) as InsightBoard;
}

/** 레거시 base64url(비압축) 링크 생성 (?share= 파라미터용 최종 폴백). */
export function encodeBoardBase64(board: InsightBoard): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(board))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** 보드가 유효한 형태인지(items·memos 배열) 검사한다. */
export function isValidBoard(value: unknown): value is InsightBoard {
  const b = value as InsightBoard | null;
  return !!b && Array.isArray(b.items) && Array.isArray(b.memos);
}
