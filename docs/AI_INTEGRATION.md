# AI 연동 아키텍처 (Google Gemini)

> 목표: **무료 티어 내에서** 토큰을 아껴 쓰면서, 이미 연결된 API(KOPIS·TMDB·네이버)와
> 결합해 신뢰성 높은 큐레이션 결과를 제공한다.

## 1. 구성요소

```
브라우저(클라이언트)                서버(키 보관)                 외부
─────────────────────         ──────────────────────        ─────────────
src/services/ai.ts   ──POST──▶  /api/ai/<handler>
 · 결과 localStorage 캐시         ├─ 개발: server/vite-plugin-ai-dev.mjs
 · 실패 시 폴백 반환(null)         └─ 운영: netlify/functions/ai.mjs
                                       └─ server/handlers.mjs ──▶ Gemini API
                                          server/gemini.mjs        (2.5-flash-lite)
```

- **API 키(`GEMINI_API_KEY`)는 서버에만 존재**한다. `VITE_` 접두사가 없어 클라이언트 번들에 포함되지 않는다.
- 개발/운영이 **동일한 핸들러**(`server/handlers.mjs`)를 공유해 동작 일관성을 보장한다.

## 2. 세 가지 핸들러

| 핸들러 | 입력(클라가 1차 정제) | 출력 | 사용처 |
|--------|----------------------|------|--------|
| `curriculum-rerank` | 키워드로 추린 후보 최대 40개 | 상위 12개 id + 근거 + 적합도 | 성취기준 큐레이션 |
| `lesson-ideas` | 공연 + 담은 성취기준/자료 | 개요·목표·활동·발문·평가 | 인사이트 바구니 |
| `enrich-performance` | 제목·장르·줄거리 | 주제어 + 영화/도서 검색어 | TMDB·네이버 검색 보강 |

## 3. 토큰 효율 전략

1. **후보 압축**: 3,373개 성취기준 전체를 LLM에 넣지 않는다. 로컬 키워드 매칭으로
   상위 ~40개만 추려(`getCandidatePool`) 전달 → 입력 토큰 대폭 절감.
2. **구조화 출력(responseSchema)** + `maxOutputTokens` 상한 → 출력 토큰 통제.
3. **결과 캐싱**: `localStorage`(30일)에 공연 ID·후보 해시 기준 캐싱 → 동일 입력 재호출 0 토큰.
4. **명시적 트리거**: 수업 아이디어는 버튼 클릭 시에만 1회 호출.
5. **경량 모델**: `gemini-2.5-flash-lite`(무료 티어, 저비용).

## 4. 신뢰성(폴백)

- AI 호출 실패(키 미설정 503 / 쿼터 429 / 오프라인 / 파싱 오류)는 모두 정상 흐름으로 흡수한다.
  - 성취기준: 키워드 기반 로컬 결과 유지
  - 영화·도서: 기존 제목·키워드 검색으로 동작
  - 수업 아이디어: 모달에 에러 안내(파괴적 영향 없음)
- 재정렬 결과는 **후보 id 화이트리스트**로 검증해 환각(존재하지 않는 코드) 유입을 차단한다.

## 5. 배포 체크리스트

1. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 `GEMINI_API_KEY` 발급(무료).
2. Netlify → Site settings → Environment variables 에 `GEMINI_API_KEY` 등록(서버 전용).
3. 로컬은 `.env`에 동일 키 추가 후 `npm run dev`.
