/**
 * 교육과정 성취기준 매칭 서비스
 * - 내부 JSON DB 로드
 * - 공연 키워드/줄거리와 성취기준 키워드 비교 → 점수 산출
 */

import type { AchievementStandard, CurriculumMatch, CurriculumType } from '../types';

// 동적 import: data/ 폴더의 JSON 파일들
async function loadCurriculumDB(): Promise<AchievementStandard[]> {
  const [revised2022, nuri2019, special2022] = await Promise.all([
    import('../data/curriculum_2022revised.json').then(m => m.default as AchievementStandard[]),
    import('../data/curriculum_2019nuri.json').then(m => m.default as AchievementStandard[]),
    import('../data/curriculum_2022special.json').then(m => m.default as AchievementStandard[]),
  ]);
  return [...revised2022, ...nuri2019, ...special2022];
}

// 캐시
let _db: AchievementStandard[] | null = null;

async function getDB(): Promise<AchievementStandard[]> {
  if (_db) return _db;
  _db = await loadCurriculumDB();
  return _db;
}

// ---------- 매칭 알고리즘 ----------
function computeMatchScore(
  standard: AchievementStandard,
  searchKeywords: string[],
  synopsis: string,
): { score: number; matchedKeywords: string[] } {
  if (searchKeywords.length === 0 && !synopsis) return { score: 0, matchedKeywords: [] };

  const normalizedSynopsis = synopsis.toLowerCase();
  const matched: string[] = [];

  for (const kw of standard.keywords) {
    const kwLower = kw.toLowerCase();
    if (searchKeywords.some(sk => sk.toLowerCase().includes(kwLower) || kwLower.includes(sk.toLowerCase()))) {
      matched.push(kw);
    } else if (synopsis && normalizedSynopsis.includes(kwLower)) {
      matched.push(kw);
    }
  }

  const score = standard.keywords.length > 0
    ? matched.length / standard.keywords.length
    : 0;

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

  return scored.slice(0, topN);
}
