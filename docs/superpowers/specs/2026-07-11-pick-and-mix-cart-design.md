# Pick & Mix 장바구니 조립 설계 (SP-E3)

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
상위: SP-E(세션 생성 진입)의 세 조각 중 첫 번째. 형제: E1(오답노트 복습 세션), E2(문제집 미리보기 사이드바+풀기).
관련: 세션 페이지(`2026-07-11-exam-session-page-design.md`) — 조립 결과의 풀이 목적지.

## 배경 / 컨셉

유튜브 플레이리스트처럼 **문제 미리보기를 서핑하며 장바구니에 담고**, 담은 문항들을 **조립**해서 두 갈래로 소비한다:
- **세션으로 풀기** — 지금 바로 응시(`POST /exam-sessions` 플레이리스트 모드)
- **문제집으로 저장** — 문제집 생성(`POST /workbooks` 벌크 `questionIds`)

기존 자산:
- `components/questions/QuestionPreview.tsx` — 이미 우측 슬라이드오버(`fixed inset-0 justify-end`, max-w-480px, slide-in-from-right). 단 "담기"가 가짜(`setSaved(true)`, API 없음).
- `/questions`(`app/questions/page.tsx`) — 카드 클릭 시 `QuestionPreview` 열림.
- zustand `^4.5.7` — 장바구니 스토어.
- 백엔드 `CreateWorkbookDto.questionIds?: string[]`(벌크, dto:48) — 문제집 한 번에 생성 가능.

## 목표

- 문제 탐색에서 미리보기 사이드바로 **[담기]/[바로 풀기]** 제공(가짜 담기 → 실제 장바구니)
- 장바구니(담은 문항) 상태를 유지하며 서핑 지속
- 장바구니 **[조립]** → 세션 풀기 / 문제집 저장 두 갈래

## 비목표 (YAGNI)

- E1(오답노트 복습), E2(문제집 미리보기+풀기) — 형제 스펙(후속)
- 필터 조립 폼(과목+난이도로 랜덤 추출) — 이번 컨셉은 **수동 Pick&Mix(플레이리스트)** 이므로 필터모드는 제외
- 장바구니 서버 영속화 — 클라이언트(zustand + localStorage)만

## 데이터 / API

| 동작 | 엔드포인트 | 프론트 현황 |
|---|---|---|
| 세션 조립(플레이리스트) | `POST /exam-sessions` `{ questionIds }` | **신규**: `createSession`/`useCreateSession` |
| 문제집 저장(벌크) | `POST /workbooks` `{ title, visibility, questionIds }` | 기존 `createWorkbook` 래퍼가 questionIds 누락 → **확장** |
| 문항 미리보기 | `GET /questions/:id` (또는 목록의 카드 데이터) | 기존 `fetchQuestion`/`useQuestion` |

- **플레이리스트 모드 제약**: 세션은 지정 문항 ID들로 세트 구성. 백엔드는 "발행된 문항"을 전제(`/questions` 목록은 기본 발행분) → 장바구니에는 발행 문항만 담긴다고 가정. 미발행이 섞이면 세션 조립 시 제외될 수 있음 — 담기 시점에 상태 확인/경고.
- 백엔드 변경 없음.

## 장바구니 스토어 (zustand)

`web/lib/cart-store.ts`:
- 상태: `items: { id: string; stemText: string; subjectName?: string; questionType: string }[]` (표시에 필요한 최소만; 전체는 필요 시 재조회)
- 액션: `add(item)`, `remove(id)`, `clear()`, `has(id)`
- **영속**: zustand `persist` 미들웨어 → `localStorage`(키 `qidea-cart`). SSR 가드(`typeof window`) 준수.
- 중복 방지: 같은 id 재담기 무시.

## 미리보기 사이드바 (QuestionPreview 확장/승격)

- 기존 `QuestionPreview`를 확장: 가짜 담기 제거 → 장바구니 스토어 연동.
- 액션 영역:
  - **[담기]/[담김✓]** — 스토어 `add`/`remove` 토글. 담김 상태 반영.
  - **[바로 풀기]** — 이 한 문항으로 즉시 `createSession({ questionIds:[id] })` → `/exam-sessions/[id]`.
- stem/choices/explanation은 `extractPlainText` 경유(raw 금지) — 기존대로.
- E2(문제집 미리보기)와 사이드바 idiom을 공유하지만, E3 범위에선 **문항 프리뷰만** 다룬다(문제집 프리뷰는 E2).

## 장바구니 패널 / 버튼

`web/components/cart/`:
- `CartButton.tsx` — 플로팅 뱃지(담은 수). 클릭 시 패널 토글. 0개면 숨김/비활성.
- `CartPanel.tsx` — 담은 문항 리스트(제목/유형, 개별 [빼기]), 하단 액션:
  - **[세션으로 풀기]** → `createSession({ questionIds })` → 라우팅 + 장바구니 유지/비움(정책: 비움).
  - **[문제집으로 저장]** → `AssembleDialog` 열기.
  - **[비우기]** → `clear()`.
- `AssembleDialog.tsx` — 문제집 저장용 미니 다이얼로그: 제목(필수)·공개범위 입력 → `createWorkbook({ title, visibility, questionIds })` → 성공 토스트 + (선택) 문제집으로 이동 + 장바구니 비움.

## 컴포넌트 구조

- `web/lib/cart-store.ts` — zustand 스토어(persist)
- `web/components/questions/QuestionPreview.tsx` — 담기/바로풀기 연동으로 확장
- `web/components/cart/CartButton.tsx`, `CartPanel.tsx`, `AssembleDialog.tsx`
- `web/lib/api.ts`: `createSession` 신규, `createWorkbook` questionIds 확장
- `web/lib/hooks.ts`: `useCreateSession` 신규
- `web/lib/types.ts`: `CreateSessionInput`, `CartItem`

장바구니 버튼은 전역 노출이 자연스러우므로 레이아웃(사이드바/`app/layout.tsx`) 또는 `/questions` 범위에 마운트할지 결정 — **MVP: `/questions` 범위에 마운트**(탐색 문맥), 추후 전역 승격.

## 방어 / 관례 (CLAUDE.md)

- `localStorage`(장바구니 persist) 접근 전 `typeof window` 가드.
- `(data||[]).map`, `new Date` 전 존재 체크.
- ProseMirror JSON은 `extractPlainText`/렌더러 경유.
- 세션/문제집 생성은 로그인 토큰 필요 → 미로그인 시 로그인 유도.

## 리스크 / 주의

- **QuestionPreview 흡수**: `/questions` 카드 클릭 동작이 바뀐다(가짜 담기 → 실제). 회귀 주의.
- **플레이리스트 발행 전제**: 미발행 문항이 담기면 세션에서 빠질 수 있음 → 담기 시 발행 상태 확인/경고.
- **장바구니 지속성**: persist라 새로고침/재방문에도 유지. 원치 않으면 조립 후 clear.
- **의존**: 풀기 목적지 `/exam-sessions/[id]`는 SP-B 완료 후 동작.

## 테스트 관점

- 타입체크. `/questions` 카드 클릭 → 사이드바 담기 → 뱃지 증가 → 패널에서 세션 조립 → `/exam-sessions/[id]` 진입 확인.
- 문제집 저장: 제목 입력 → `createWorkbook(questionIds)` 1콜로 생성 확인(N+1 아님).
- 새로고침 후 장바구니 유지(persist) 확인.

## 후속

- E2: 문제집 미리보기 사이드바 + 풀기(`startWorkbook`). 사이드바 idiom 공유.
- E1: 오답노트 복습 세션(잘못된 `/studio/editor` 링크 → `createSession` 복습 모드).
- 장바구니 버튼 전역 승격.
