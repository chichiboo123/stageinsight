/**
 * 교육과정 성취기준 매칭 서비스
 * - achievements-simple.json 로드 및 변환
 * - 공연 키워드/줄거리 → 성취기준 내용 텍스트 매칭 → 점수 산출
 */

import type { AchievementStandard, CurriculumMatch, CurriculumType, SchoolLevel } from '../types';

// achievements-simple.json의 원본 행 타입
interface RawStandard {
  코드: string;
  내용: string;
  교육과정: string;
  학년군: string;
  교과: string;
  과목: string;
  영역: string;
}

// 학년군 → SchoolLevel 변환
function toSchoolLevel(학년군: string): SchoolLevel {
  if (학년군 === '유아') return '유아';
  if (학년군.startsWith('초등')) return '초등';
  if (학년군.startsWith('중학')) return '중등';
  return '고등';
}

// 원본 데이터 → AchievementStandard 변환
function transform(raw: RawStandard): AchievementStandard {
  return {
    id: raw.코드,
    curriculumType: raw.교육과정 as CurriculumType,
    schoolLevel: toSchoolLevel(raw.학년군),
    grade: raw.학년군,
    subject: raw.교과,
    domain: raw.영역 || undefined,
    content: raw.내용,
  };
}

// 동적 import 및 캐시
let _db: AchievementStandard[] | null = null;

async function getDB(): Promise<AchievementStandard[]> {
  if (_db) return _db;
  const raw = await import('../data/achievements-simple.json').then(m => m.default as RawStandard[]);
  _db = raw.map(transform);
  return _db;
}

// ---------- 매칭 알고리즘 ----------
// 성취기준 '내용' 텍스트에서 공연 키워드·줄거리가 얼마나 등장하는지 점수화
function computeMatchScore(
  standard: AchievementStandard,
  searchKeywords: string[],
  synopsis: string,
): { score: number; matchedKeywords: string[] } {
  if (searchKeywords.length === 0 && !synopsis) return { score: 0, matchedKeywords: [] };

  const contentLower = standard.content.toLowerCase();
  const matched: string[] = [];

  for (const kw of searchKeywords) {
    if (kw.length < 2) continue; // 1글자 키워드 제외
    if (contentLower.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }

  // synopsis에서 추가 매칭
  if (synopsis) {
    // synopsis 내 한글 단어 중 성취기준 내용에 포함되는 2~6글자 단어 추출
    const words = synopsis.match(/[가-힣]{2,6}/g) ?? [];
    for (const word of words) {
      if (!matched.includes(word) && contentLower.includes(word.toLowerCase())) {
        matched.push(word);
      }
    }
  }

  // 점수: 매칭된 키워드 수 / (검색 키워드 수 + 1), 최대 1
  const denominator = Math.max(searchKeywords.length, 1);
  const score = Math.min(matched.length / denominator, 1);

  return { score, matchedKeywords: matched };
}

// ---------- 공개 API ----------
export async function matchCurriculum(
  keywords: string[],
  synopsis: string,
  filterTypes?: CurriculumType[],
  topN = 12,
): Promise<CurriculumMatch[]> {
  const db = await getDB();

  const filtered = filterTypes && filterTypes.length > 0
    ? db.filter(s => filterTypes.includes(s.curriculumType))
    : db;

  const scored: CurriculumMatch[] = filtered
    .map(standard => {
      const { score, matchedKeywords } = computeMatchScore(standard, keywords, synopsis);
      return { standard, score, matchedKeywords };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  // 매칭 결과가 있으면 그대로 반환
  if (scored.length > 0) return scored.slice(0, topN);

  // 결과 0건: 키워드를 더 넓게 해석 — synopsis 내 2~4글자 한글 단어 직접 매칭
  if (synopsis) {
    const words = [...new Set(synopsis.match(/[가-힣]{2,4}/g) ?? [])];
    const fallback: CurriculumMatch[] = filtered
      .map(standard => {
        const contentLower = standard.content.toLowerCase();
        const matched = words.filter(w => contentLower.includes(w));
        const score = matched.length > 0 ? Math.min(matched.length / 10, 1) : 0;
        return { standard, score, matchedKeywords: matched };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score);
    if (fallback.length > 0) return fallback.slice(0, topN);
  }

  return [];
}
