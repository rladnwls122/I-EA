# 문항 상세 페이지 설계 (`/questions/[id]`)

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
참고: `문제 상세 (standalone).html` (레퍼런스 목업 — 인디고 팔레트, 본 앱은 emerald로 매핑)

## 배경 / 위치

이 페이지는 "문제 상세 (standalone).html" 레퍼런스를 앱에 이식한 것이다. 단일 문항의 리치 뷰 — 문항 본문 + 해설 + 정답률 통계 + 별점 + 댓글.

진입 경로(모두 이 한 페이지로 수렴):
- 문제집 풀이 → 세션 결과 페이지 → 문항 클릭
- 오답노트 / 풀이 기록 → 문항 클릭
- 문제 탐색(`/questions`) → 카드 클릭 (현재는 `QuestionPreview` 슬라이드오버; 추후 이 페이지로 대체 가능)

**스코프 경계**: 이 스펙은 문항 상세 페이지 **하나**만 다룬다. 세션 풀이 화면(exam-session 풀기/OMR)과 세션 결과 페이지는 이 페이지의 진입점이지만 **별도 서브프로젝트**로 남긴다(후속 스펙).

## 목표

- 레퍼런스 레이아웃(헤더 + 좌 본문 772px + 우 댓글 사이드바 376px)을 앱 디자인 토큰으로 이식
- 풀이 여부에 따른 **공개 게이팅**: 미풀이(문제탐색)면 정답/해설/통계 가림, 풀이(채점결과)면 공개
- 기존 백엔드 API만으로 구성 (백엔드 변경 없음)

## 비목표 (YAGNI)

- 세션 풀이 화면 / 세션 결과 페이지 (별도 서브프로젝트)
- 그림(figure)·수식 렌더러 고도화 — MVP는 `extractPlainText` 평문 + 이미지 미디어(있으면)만
- per-문항 "내가 풀었나" 판정 신규 API — 진입 컨텍스트(쿼리 파라미터) + 수동 토글로 대체
- 북마크/공유 실제 기능 — 헤더 버튼은 배치하되 동작은 후속(있으면 표시만)

## 색/디자인 토큰 매핑

앱은 이미 near-black canvas(`#08090a`) + hairline 테두리 + JetBrains Mono 수치 = 레퍼런스와 **같은 디자인 언어(Solves 계열)**. 유일한 차이는 강조색:

- 레퍼런스 인디고 `#5e6ad2` / hover `#828fff` → 앱 emerald `--primary #34d399` / `--primary-hover #2bbe86`
- 정답 초록(레퍼런스 `#3ecf6a`) → 앱 `--primary` 계열 유지
- 오답 빨강(`#f1706f`) → 의미색 그대로(오답/매력오답 표시)
- 나머지 canvas/surface/hairline/ink 계층은 앱 CSS 변수(`globals.css`) 사용

## 레이아웃

```
헤더(56px, sticky): [뒤로] 로고 · 브레드크럼(과목·단원 · pid) · [채점결과 ↔ 문제탐색] · 북마크 · 공유
┌────────────────────────────┬──────────────────┐
│ main (좌, max 772px 중앙)   │ aside (우, 376px) │
│  스크롤                     │                  │
│ · 문항 카드                 │ · 댓글 헤더       │
│   메타(번호badge/과목/배점) │   [풀이토론/Q&A]  │
│   stem (+이미지 있으면)     │ · 댓글 리스트     │
│   선지 리스트 (채점색)      │ · 입력창(하단고정)│
│ · 해설·풀이 (접이식)        │                  │
│ · 정답률·통계 (분포바)      │                  │
│ · 별점 평가                 │                  │
└────────────────────────────┴──────────────────┘
```

- 데스크톱: `flex` 좌우 2열, aside 고정폭 376px + 좌측 hairline.
- 모바일(`lg` 미만): aside가 main 아래로 세로 스택.

## 공개 게이팅 (헤더 [채점결과 ↔ 문제탐색] 토글)

- **문제탐색**(기본, 미풀이 진입): 선지 채점색·정답·해설·통계 **미표시**. 순수 문제만 노출.
- **채점결과**(풀이 진입): 정답 선지 초록 테두리·오답 빨강·해설 패널 열림·통계 공개.
- 자동 초기 모드: 진입 시 쿼리 파라미터 `?reveal=1`(세션 결과/오답노트 링크가 붙임)이면 채점결과, 없으면 문제탐색. 사용자가 토글로 수동 전환 가능.
- **중요(보안 경계 아님)**: `GET /questions/:id`와 `/stats`는 `isCorrect`·해설을 그대로 내려준다(마스킹 변형 없음). 따라서 문제탐색 모드의 가림은 **표시상(presentational)** 처리다. 진짜 정답 은닉이 필요한 것은 exam-session 응시 흐름(`maskSnapshot`)이고 그건 이 페이지 범위 밖. 스펙 독자는 이 구분을 알고 있어야 한다.

## 데이터 소스 (전부 기존 API, 백엔드 변경 없음)

| 섹션 | 엔드포인트 | 반환 핵심 |
|---|---|---|
| 문항 본문/선지/메타/태그 | `GET /questions/:id` | choices(`isCorrect` 포함), stem, explanation, subject, tags, `_count.comments/reviews`, correctRatePercent |
| 정답률·통계·분포·매력오답 | `GET /questions/:id/stats` | `{ totalSolved, correctRate, avgTimeSpentSec, timedSampleCount, choiceDistribution:[{index,choiceId,count,isCorrect}] }` (표본<10이면 rate/avg는 null) |
| 댓글 [풀이토론/Q&A] | `GET/POST/PATCH/DELETE /questions/:id/comments`, `/comments/:id` | 자기참조 트리(대댓글) |
| 별점 평가 | `GET/POST/DELETE /questions/:id/reviews`, `/reviews/:id` | rating(1~5)+perceivedDifficulty, `(questionId,reviewerId)` 유니크 |
| 오답노트 하이라이트(선택) | `GET/POST/PATCH/DELETE /questions/:id/annotations` | 텍스트 앵커 하이라이트 — MVP 표시만/후순위 |

- 댓글의 [풀이토론/Q&A] 구분: 백엔드 스키마에 카테고리 필드 없음 → MVP는 단일 리스트, 세그먼트는 UI만(둘 다 같은 목록) 또는 Q&A 탭은 후속. **결정: MVP는 단일 댓글 리스트, 세그먼트 토글은 시각만 두고 동일 목록 표시.**

## 프론트 컴포넌트 구조

라우트: `web/app/questions/[id]/page.tsx` → `<QuestionDetail id={params.id} initialReveal={searchParams.reveal==='1'} />`

`web/components/question-detail/`:
- `QuestionDetail.tsx` — 셸: 헤더(토글/브레드크럼/버튼) + 좌우 2열 레이아웃. reveal 상태 소유(`useState`).
- `QuestionArticle.tsx` — 메타 행 + stem(+이미지) + 선지 리스트. reveal면 채점색.
- `ExplanationPanel.tsx` — 해설 접이식(`explanation` JSON). reveal일 때만 열기 가능.
- `StatsPanel.tsx` — 정답률/평균소요/매력오답 + 분포바(`/stats`). reveal일 때만 fetch(`enabled: reveal`).
- `RatingPanel.tsx` — 별점 조회/등록(`/reviews`).
- `CommentSidebar.tsx` — 댓글 목록 + 입력(`/comments`). [풀이토론/Q&A] 세그먼트(시각).

훅/API 현황(실측):
- **기존 재사용**: `useQuestion`(hooks.ts:94)/`fetchQuestion`(api.ts:126), `useQuestionStats`(hooks.ts:103)/`fetchQuestionStats`(api.ts:196) + `QuestionStats` 타입(types.ts:190), `useComments`(hooks.ts:258)/`fetchComments`(api.ts:356)/`createComment`(api.ts:363) + `QuestionComment` 타입
- **신규 필요**: 별점 — `fetchReviews`/`useReviews`, `createReview`/`useCreateReview`, `deleteReview` + `QuestionReview` 타입
- **stats 게이팅 단순화**: `useQuestionStats`는 `enabled:!!id`로 항상 fetch. reveal 게이팅은 훅 수정 없이 `StatsPanel`을 reveal일 때만 렌더(클라 표시 숨김). 정답이 어차피 detail로 내려오므로 fetch 차단은 실익 없음.
- 댓글 수정/삭제(`updateComment`/`deleteComment`)는 있으면 재사용, 없으면 추가(MVP는 작성+조회 우선, 수정/삭제는 후순위 가능)

## ProseMirror / 방어 (CLAUDE.md 관례)

- stem·choices[].content·explanation은 ProseMirror JSON → `lib/prosemirror.ts`의 `extractPlainText` 또는 전용 렌더러 경유. raw 렌더 금지(`[object Object]`/크래시 방지).
- `localStorage` 토큰 접근 전 `typeof window` 가드, `(data||[]).map`, `new Date()` 전 존재 체크.
- 통계 표본<10이면 rate/avg가 null → "표본 부족" 표기, 분포바는 그대로.

## 리스크 / 주의

- **정답 노출**: 위 게이팅은 표시상 처리(네트워크엔 정답 내려옴). 실제 시험 은닉이 필요하면 exam-session 흐름 사용 — 이 페이지 범위 아님.
- **댓글 카테고리 없음**: 풀이토론/Q&A 분리는 스키마에 없음 → MVP 단일 목록.
- **라우트 신규**: `/questions/[id]`는 지금 없음(잠재적으로 홈의 "최근 본 문제"가 이미 이 경로로 링크 중 → 그 404도 이 페이지로 해소됨).
- **QuestionPreview 공존**: `/questions` 카드 클릭은 당장 기존 슬라이드오버 유지. 이 상세 페이지로의 전환은 이 스펙 범위 밖(진입점 정리는 후속).

## 테스트 관점

- 타입체크(`tsc --noEmit`) + 실제 Railway API로 시드 문항 id 하나 열어 육안 확인.
- 문제탐색↔채점결과 토글 시 정답색/해설/통계 노출 전환 확인.
- 댓글 등록/별점 등록 왕복 확인(로그인 토큰 필요).

## 후속 (별도 서브프로젝트)

1. **세션 풀이 화면** (exam-session 풀기/OMR, `/exam-sessions/[id]` take 모드)
2. **세션 결과 페이지** (제출 후 채점 요약 + 문항별 → 이 상세 페이지 링크)
3. **홈 대시보드** (기존 스펙 `2026-07-11-home-dashboard-design.md`)
4. 진입점 정리: `/questions` 카드 클릭을 슬라이드오버 → 상세 페이지로 전환할지
