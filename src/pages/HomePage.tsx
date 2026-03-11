
import { SearchBar } from '../components/common/SearchBar';
import { useSchoolSearch } from '../hooks/useSchoolSearch';
import type { School } from '../types';
import styles from './HomePage.module.css';

interface HomePageProps {
  onSchoolSelect: (school: School) => void;
}

export function HomePage({ onSchoolSelect }: HomePageProps) {
  const { query, setQuery, schools, loading, error, clearResults } = useSchoolSearch();

  function handleSelect(school: School) {
    clearResults();
    onSchoolSelect(school);
  }

  return (
    <main className={styles.main}>
      {/* 히어로 섹션 */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <h1 className={styles.heroTitle}>
            학교 주변의 공연장을<br />
            <span className={styles.heroAccent}>함께 발견</span>해요
          </h1>
          <p className={styles.heroSubtitle}>
            학교명을 검색하면 주변 공연장과 진행 중인 공연을 찾아드립니다.<br />
            교육과정 성취기준과 연계해 융합 수업 아이디어를 구상해 보세요.
          </p>

          {/* 검색창 */}
          <div className={styles.searchWrapper}>
            <SearchBar
              value={query}
              onChange={setQuery}
              onClear={clearResults}
              placeholder="학교 이름을 입력하세요 (예: 동두천송내초등학교)"
              loading={loading}
              autoFocus
            />

            {/* 자동완성 드롭다운 */}
            {(schools.length > 0 || error) && (
              <div className={styles.dropdown}>
                {error && (
                  <div className={styles.dropdownError}>
                    {error}
                  </div>
                )}
                {schools.map(school => (
                  <button
                    key={school.id}
                    className={styles.dropdownItem}
                    onClick={() => handleSelect(school)}
                  >
                    <span className={styles.schoolIcon}>🏫</span>
                    <span className={styles.schoolInfo}>
                      <strong>{school.name}</strong>
                      <small>{school.address}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 힌트 태그 */}
          <div className={styles.hints}>
            {['초등학교', '중학교', '고등학교', '유치원', '특수학교'].map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* 기능 소개 카드 */}
      <section className={`container ${styles.features}`}>
        {FEATURES.map((feat, i) => (
          <div key={i} className={`card ${styles.featureCard} fade-in`}
            style={{ animationDelay: `${i * 80}ms` }}>
            <span className={styles.featureIcon}>{feat.icon}</span>
            <h3 className={styles.featureTitle}>{feat.title}</h3>
            <p className={styles.featureDesc}>{feat.desc}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

const FEATURES = [
  {
    icon: '🗺️',
    title: '공연장 탐색',
    desc: '학교 반경 내 도보·대중교통으로 이동 가능한 공연장을 지도에서 확인하세요.',
  },
  {
    icon: '🎭',
    title: '공연 정보',
    desc: 'KOPIS 연계로 현재 공연 중이거나 예정된 작품의 포스터, 줄거리, 출연진을 제공합니다.',
  },
  {
    icon: '📚',
    title: '교육과정 연계',
    desc: '2022 개정·2019 누리·2022 특수 교육과정 성취기준을 자동으로 매칭해 드립니다.',
  },
  {
    icon: '🎬',
    title: '문화 확장',
    desc: '공연과 연계된 영화(TMDB)와 추천 도서(네이버북)로 심화 학습을 설계하세요.',
  },
];
