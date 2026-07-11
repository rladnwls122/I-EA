# 오답노트 복습 세션 진입 설계 (SP-E1)

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
상위: SP-E(세션 생성 진입)의 형제. E3(Pick&Mix 장바구니), E2(문제집 미리보기)와 `createSession` API·세션 페이지(SP-B)를 공유.

## 배경

오답노트에서 "기록한 오답을 다시 풀어보세요"의 **복습 시작** 버튼(`app/notes/@sidebar/page.tsx:25–30`)이 지금 `/studio/editor`(AI 저작 에디터)로 **잘못 연결**돼 있다. 눌러도 복습 세션이 안 생긴다. 이를 실제 복습 세션 생성으로 배선한다.

## 목표

- 오답 문항들로 복습 세션 생성 → `/exam-sessions/[id]`(SP-B) 풀기 모드 진입
- 복습 세션이므로 정답 시 복습 보너스(+15) 적립(`isReview:true`)

## 데이터 / API

- **소스**: `GET /me/notes` → `MyNotesResponse.wrongQuestions[].questionId`(오답 문항 id 배열). 프론트 `useMyNotes`(hooks.ts:350) 기존.
- **생성**: `POST /exam-sessions` `{ questionIds, isReview:true }`(플레이리스트 모드). 프론트 `createSession`/`useCreateSession` — **E3에서 신규 추가하는 것 공유**. E3보다 먼저 구현되면 여기서 추가.
- 백엔드 변경 없음(`isReview` 필드 이미 `CreateSessionDto`에 있음).

## 동작

1. `useMyNotes`로 `wrongQuestions` 로드.
2. **복습 시작** 클릭 → `wrongQuestions.map(q=>q.questionId)`를 **중복 제거**(같은 문항이 여러 세션에서 오답이면 wrongQuestions가 `questionId+sessionId`로 나뉨) → `createSession({ questionIds, isReview:true })`.
3. 성공 → `router.push('/exam-sessions/[examSessionId]')`.
4. 로딩 중 버튼 스피너/비활성.

## 진입점 위치

- `app/notes/@sidebar/page.tsx` "복습 시작"(잘못된 `Link href="/studio/editor"` → 버튼 + `useCreateSession`).
- (선택) 오답노트 본문(`NotesDashboard`)에도 동일 액션 노출 검토 — MVP는 사이드바 버튼만.

## 방어 / 관례

- `wrongQuestions`가 0개면 버튼 비활성 + "복습할 오답이 없어요" 안내.
- questionIds 중복 제거(`[...new Set(ids)]`).
- 로그인 토큰 필요 → 미로그인 유도.
- `(data||[])` 가드.

## 리스크

- **발행 전제**: 플레이리스트 세션은 발행 문항 전제. 오답 문항이 미발행/삭제됐으면 세션에서 빠질 수 있음 → 조립 결과 문항 수 표시로 확인.
- **의존**: `createSession`(E3와 공유), 목적지 `/exam-sessions/[id]`(SP-B).

## 테스트 관점

- 타입체크. 오답노트 진입 → 복습 시작 → 세션 생성 → `/exam-sessions/[id]` 진입, 오답 문항들로 채워짐 확인.
- 오답 0개일 때 버튼 비활성 확인.

## 후속

- 복습 세션 제출 시 REVIEW_CORRECT(+15) 적립 반영(백엔드 기존) — 결과 배너에서 확인.
