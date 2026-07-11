# SP-E3 Pick & Mix 장바구니 — 구현 계획

스펙: docs/superpowers/specs/2026-07-11-pick-and-mix-cart-design.md
백엔드 변경 없음(CreateWorkbookDto.questionIds 벌크 이미 지원, POST /exam-sessions 플레이리스트 모드 존재).

## 파일
- 신규 `web/lib/cart-store.ts` — zustand persist(localStorage `qidea-cart`), items/add/remove/clear/has
- 수정 `web/lib/types.ts` — `CartItem`, `CreateSessionInput`, `CreateSessionResult`
- 수정 `web/lib/api.ts` — `createSession`(POST /exam-sessions), `createWorkbook`에 `questionIds?` 추가
- 수정 `web/lib/hooks.ts` — `useCreateSession`
- 수정 `web/components/questions/QuestionPreview.tsx` — 목업 담기(하드코딩 select/가짜 saved) 제거 → 장바구니 [담기/담김] 토글 + [바로 풀기](단일 문항 세션 → /exam-sessions/[id])
- 신규 `web/components/cart/CartButton.tsx` — 플로팅 뱃지(0개면 숨김)
- 신규 `web/components/cart/CartPanel.tsx` — 목록 + [세션으로 풀기]/[문제집으로 저장]/[비우기]
- 신규 `web/components/cart/AssembleDialog.tsx` — 제목/공개범위 → createWorkbook(questionIds)
- 수정 `web/app/questions/page.tsx` — CartButton 마운트

## 결정
- 조립(세션/문제집) 성공 시 장바구니 비움.
- 담기 시점 발행 상태 확인: /questions 목록은 PUBLISHED만 내려오므로 별도 경고 생략(스펙 리스크 수용).
- QuestionPreview의 choices 파싱: 배열/`.content` 양쪽 방어.

## 검증
tsc --noEmit. 서버 기동 검증 생략(사용자 지시).

## 완료 기록
(구현 후 갱신)
