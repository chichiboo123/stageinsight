# StageInsight 폴더별 책임도 & 브랜치 관계

## 1) 폴더별 책임도

### 루트
- `src/`: 실제 애플리케이션 코드(페이지, 컴포넌트, 훅, 서비스, 상태관리, 타입).
- `public/`: 정적 파일(`vite.svg`, `location.svg` 등) 제공.
- `index.html`: Vite 진입 HTML.
- `package.json`: 실행/빌드/린트 스크립트와 의존성 정의.
- `vite.config.ts`: Vite 빌드/개발 서버 설정.
- `tsconfig*.json`: TypeScript 컴파일 범위/옵션.
- `eslint.config.js`: 코드 품질 규칙.
- `netlify.toml`: Netlify 배포 관련 설정.

### `src/`
- `main.tsx`: 앱 부트스트랩(초기 테마 반영 + React 루트 렌더링).
- `App.tsx`: 앱 최상위 조립(Provider 계층 + 페이지 전환/히스토리 + 공용 헤더/푸터/도움말).
- `index.css`, `App.css`: 전역 스타일 및 공통 스타일.

### `src/pages/` (화면 단위)
- `HomePage.tsx`: 학교 검색, 자동완성, 서비스 소개.
- `MapPage.tsx`: 선택 학교 기준 주변 공연장 지도/리스트.
- `DashboardPage.tsx`: 공연 목록/상세 + 교육과정 매칭 + 연계 미디어.
- `InsightPage.tsx`: 인사이트 바구니 관리(항목/메모/내보내기/공유).
- `*.module.css`: 각 페이지 전용 스타일.

### `src/components/` (재사용 UI)
- `layout/`: 상단 내비게이션(`Header`).
- `common/`: 검색바, 로딩, 에러 등 범용 UI 블록.

### `src/contexts/` (전역 상태/테마)
- `AppContext.tsx`: 선택 학교/공연장/공연 및 인사이트 바구니 상태, reducer 액션, localStorage 동기화.
- `ThemeContext.tsx`: 테마 상태 관리.

### `src/hooks/` (도메인 로직)
- `useSchoolSearch.ts`: 학교 검색 상태/요청.
- `useNearbyVenues.ts`: 주변 공연장 조회.
- `useKakaoMap.ts`: 카카오맵 로딩/마커/이동 제어.
- `usePerformances.ts`: 공연 목록/상세 조회.
- `useCurriculumMatch.ts`: 성취기준 매칭.
- `useMediaRecommendations.ts`: 영화/도서 추천 병렬 조회.

### `src/services/` (외부 API 연동)
- `kakao.ts`, `kopis.ts`, `tmdb.ts`, `naverBook.ts`: 각 외부 API 래퍼.
- `curriculumMatcher.ts`: 성취기준 매칭 유틸/정규화 로직.

### `src/types/` / `src/data/` / `src/assets/`
- `types/`: 도메인 타입 정의.
- `data/`: 앱 내장 데이터(예: `achievements-simple.json`).
- `assets/`: 번들되는 정적 리소스.

---

## 2) 브랜치 3개 관계(히스토리 기준)

> 현재 로컬에는 `work`만 체크아웃/보유 중이지만, merge 커밋 메타데이터로 최소 3개 흐름을 확인할 수 있습니다.

분석 대상 브랜치(이력상):
1. `work` (현재 HEAD)
2. `main`
3. `claude/fix-stage-insight-app-URy7s`

관계 요약:
- `work`는 PR #11로 `claude/fix-stage-insight-app-URy7s`를 먼저 병합함.
- 이후 PR #7로 `main`을 다시 `work`에 병합함.
- 즉, 현재 `work`는 두 라인의 변경을 모두 포함하는 통합 브랜치.

간단 DAG(개념도):

```text
claude/fix-stage-insight-app-URy7s ----┐
                                       ├─(PR #11)─> work ----┐
main -----------------------------------┘                    ├─(PR #7)─> work(HEAD)
```

근거 커밋:
- `7d7d718`: "Merge pull request #11 from .../claude/fix-stage-insight-app-URy7s"
- `365915a`: "Merge pull request #7 from .../main"

