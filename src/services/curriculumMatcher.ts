/**
 * 교육과정 성취기준 매칭 서비스 (v2)
 * - 확장 키워드 풀 + 양방향 매칭 + 학년군 다양성 보장
 */

import type { AchievementStandard, CurriculumMatch, CurriculumType, SchoolLevel } from '../types';

interface RawStandard {
  코드: string;
  내용: string;
  교육과정: string;
  학년군: string;
  교과: string;
  과목: string;
  영역: string;
}

function toSchoolLevel(학년군: string): SchoolLevel {
  if (학년군 === '유아') return '유아';
  if (학년군.startsWith('초등')) return '초등';
  if (학년군.startsWith('중학')) return '중등';
  return '고등';
}

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

let _db: AchievementStandard[] | null = null;

async function getDB(): Promise<AchievementStandard[]> {
  if (_db) return _db;
  const raw = await import('../data/achievements-simple.json').then(m => m.default as RawStandard[]);
  _db = raw.map(transform);
  return _db;
}

// ---------- 확장 키워드 풀 ----------
const KEYWORD_PATTERNS = [
  // 감정·관계
  '사랑', '우정', '가족', '형제', '부모', '자녀', '갈등', '화해', '용서', '배려',
  '감정', '경험', '상상', '이야기', '느낌', '공감', '위로', '기쁨', '슬픔',
  '두려움', '분노', '행복', '불안', '외로움', '그리움', '희망',
  // 가치·덕목
  '성장', '용기', '꿈', '희망', '정의', '자유', '평화', '다양성', '포용', '책임',
  '성찰', '진로', '참여', '인권', '윤리', '도덕', '가치관', '자존감', '자아',
  '배움', '나눔', '협력', '소통', '신뢰', '존중',
  // 사회·역사·공동체
  '역사', '전쟁', '민주주의', '공동체', '환경', '자연', '과학', '미래', '과거',
  '시민', '사회', '지역사회', '세계시민', '경제', '자원', '불평등', '차별',
  '편견', '소수자', '장애', '다문화',
  // 생태·지속가능성
  '생태', '지속가능성', '건강', '안전', '생활', '지구', '기후', '생명',
  // 예술·문화·공연
  '음악', '춤', '노래', '공연', '판타지', '모험', '동화', '신화', '전래',
  '문화', '전통', '예술', '창작', '표현', '감상', '비평', '해석', '평가',
  '극', '연기', '무대', '관람', '미술', '그림', '조형', '디자인',
  '문학', '시', '소설', '서사', '등장인물',
  // 교육적 역량
  '창의', '도전', '극복', '탐구', '관찰', '실험', '문제해결',
  '발표', '토의', '토론', '정보', '매체', '디지털', '기술', '발명',
  '의사소통', '비판적', '논리적', '합리적',
  // 심리·성격
  '용감', '겁쟁이', '욕심', '질투', '부끄러움', '자신감', '포기', '인내',
  // 신체·스포츠
  '신체', '운동', '건강생활', '놀이',
];

// 예술·표현 관련 성취기준에 부여할 보너스 키워드
const ARTS_BONUS_TERMS = [
  '표현', '감상', '공연', '작품', '예술', '창의', '창작', '노래', '음악',
  '움직임', '신체표현', '극', '연기', '이야기꾸미기', '역할', '극놀이',
  '미적', '심미', '상상', '즉흥',
];

// 예술 교과 목록
const ARTS_SUBJECTS = new Set(['음악', '미술', '체육', '국어', '도덕', '통합', '바생', '즐생']);

const GENRE_KEYWORD_MAP: Record<string, string[]> = {
  '뮤지컬': ['음악', '노래', '춤', '공연', '성장', '표현', '감상'],
  '연극':   ['갈등', '소통', '공연', '이야기', '역할', '극'],
  '무용':   ['춤', '음악', '공연', '창의', '신체표현', '움직임'],
  '클래식': ['음악', '공연', '창의', '감상'],
  '국악':   ['음악', '우리나라', '전래', '공연', '전통'],
  '오페라': ['음악', '노래', '공연', '감상'],
  '서커스/마술': ['모험', '창의', '공연', '신체'],
  '복합':   ['공연', '창의', '표현'],
};

// ---------- 한국어 토큰 추출 (2~5자 명사성 단어) ----------
function extractKoreanTokens(text: string): string[] {
  return [...new Set((text.match(/[가-힣]{2,5}/g) ?? []))];
}

// ---------- 매칭 점수 계산 (v2) ----------
function computeScore(
  standard: AchievementStandard,
  keywords: string[],   // 추출된 작품 키워드
  synopsisTokens: string[], // 시놉시스에서 뽑은 토큰
  titleTokens: string[],    // 제목에서 뽑은 토큰
): { score: number; matchedKeywords: string[] } {
  const content = standard.content;
  const matched = new Set<string>();

  // 1. 작품 키워드 → 성취기준 내용 (가중치 3)
  let score = 0;
  for (const kw of keywords) {
    if (kw.length < 2) continue;
    if (content.includes(kw)) {
      matched.add(kw);
      score += 3;
    }
  }

  // 2. 제목 토큰 → 성취기준 내용 (가중치 2)
  for (const token of titleTokens) {
    if (content.includes(token) && !matched.has(token)) {
      matched.add(token);
      score += 2;
    }
  }

  // 3. 시놉시스 토큰 → 성취기준 내용 (가중치 1, 최대 6개)
  let synMatchCount = 0;
  for (const token of synopsisTokens) {
    if (synMatchCount >= 6) break;
    if (content.includes(token) && !matched.has(token)) {
      matched.add(token);
      score += 1;
      synMatchCount++;
    }
  }

  // 4. 예술 교과·표현 보너스 (공연 연계 교과는 항상 우대)
  const isArtsSubject = ARTS_SUBJECTS.has(standard.subject);
  const hasArtsTerm = ARTS_BONUS_TERMS.some(t => content.includes(t));
  if (isArtsSubject) score += 2;
  if (hasArtsTerm) score += 1;

  return { score, matchedKeywords: [...matched] };
}

// ---------- 공개 API ----------
export async function matchCurriculum(
  keywords: string[],
  synopsis: string,
  filterTypes?: CurriculumType[],
  topN = 24,
): Promise<CurriculumMatch[]> {
  const db = await getDB();

  const filtered = filterTypes && filterTypes.length > 0
    ? db.filter(s => filterTypes.includes(s.curriculumType))
    : db;

  // 시놉시스·제목에서 한국어 토큰 추출
  const synopsisTokens = synopsis ? extractKoreanTokens(synopsis) : [];
  const allSearchTerms = [...new Set([...keywords, ...synopsisTokens])];

  // 점수 계산
  const titleTokens = keywords.filter(k => k.length >= 2); // keywords에 title 단어가 포함되어 있음

  const scored = filtered
    .map(standard => {
      const { score, matchedKeywords } = computeScore(standard, keywords, synopsisTokens, titleTokens);
      return { standard, score, matchedKeywords };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 && allSearchTerms.length === 0) return [];

  // ---------- 학년군 다양성 보장 ----------
  const GRADE_LEVELS = [
    '유아',
    '초등학교 1~2학년',
    '초등학교 3~4학년',
    '초등학교 5~6학년',
    '중학교 1~3학년',
    '고등학교 1~3학년',
  ];
  const MAX_PER_GRADE = 4; // 학년군당 최대 4개
  const MIN_PER_GRADE = 1; // 보장할 최소 1개

  const gradeCount = new Map<string, number>();
  const result: CurriculumMatch[] = [];

  // 1차: 점수 순 + 학년군 쿼터
  for (const m of scored) {
    const grade = m.standard.grade ?? '기타';
    const cnt = gradeCount.get(grade) ?? 0;
    if (cnt < MAX_PER_GRADE) {
      result.push(m);
      gradeCount.set(grade, cnt + 1);
    }
    if (result.length >= topN) break;
  }

  // 2차: 결과가 부족한 학년군을 위한 폴백 추가 (score=0이어도 포함)
  if (scored.length < topN / 2) {
    const coveredGrades = new Set(result.map(r => r.standard.grade));
    for (const grade of GRADE_LEVELS) {
      if (!coveredGrades.has(grade) && (gradeCount.get(grade) ?? 0) < MIN_PER_GRADE) {
        // 해당 학년군의 예술 관련 성취기준을 우선 추가
        const best = filtered
          .filter(s => s.grade === grade && ARTS_SUBJECTS.has(s.subject))
          .find(s => !result.some(r => r.standard.id === s.id));
        if (best) {
          result.push({ standard: best, score: 0, matchedKeywords: [] });
        }
      }
    }
  }

  // 3차: 전체 결과가 topN/3 미만이면 넓은 시놉시스 토큰 폴백
  if (result.length < Math.ceil(topN / 3) && synopsis) {
    const words = [...new Set(synopsis.match(/[가-힣]{2,4}/g) ?? [])];
    const existingIds = new Set(result.map(r => r.standard.id));

    const fallback = filtered
      .filter(s => !existingIds.has(s.id))
      .map(standard => {
        const matched = words.filter(w => standard.content.includes(w));
        const artsBonus = ARTS_SUBJECTS.has(standard.subject) ? 1 : 0;
        const score = matched.length > 0 ? matched.length + artsBonus : 0;
        return { standard, score, matchedKeywords: matched };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN - result.length);

    result.push(...fallback);
  }

  // 최종 정렬: score desc, 같은 score면 학년군 순
  const gradeOrder = Object.fromEntries(GRADE_LEVELS.map((g, i) => [g, i]));
  result.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (gradeOrder[a.standard.grade] ?? 99) - (gradeOrder[b.standard.grade] ?? 99);
  });

  return result.slice(0, topN);
}

// ---------- extractKeywords (kopis.ts에서 호출) ----------
export { KEYWORD_PATTERNS, GENRE_KEYWORD_MAP };
