# 문제집 미리보기 사이드바 + 풀기 설계 (SP-E2)

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
상위: SP-E(세션 생성 진입)의 형제. E3(Pick&Mix 장바구니)와 **우측 미리보기 사이드바 idiom 공유**. 세션 페이지(SP-B)가 풀이 목적지.

## 배경

문제집 리스트(`app/workbook/page.tsx`)의 카드는 현재 **비클릭**(상세 페이지가 없어 static 처리했음). 카드에 직접 "바로 풀기" 버튼을 다는 대신, **카드 클릭 → 우측 사이드바 미리보기**가 열리고 그 안의 **[풀기]** 버튼으로 세션을 시작한다.

## 목표

- 문제집 카드 클릭 → 우측 슬라이드 사이드바로 문제집 미리보기
- 사이드바 [풀기] → 세션 생성 후 `/exam-sessions/[id]`(SP-B)

## 데이터 / API

- **미리보기**: `GET /workbooks/:id` → `Workbook`(제목/설명/문항수/평균점수 등) + `questions?: WorkbookQuestion[]`(문항 목록). 프론트 `fetchWorkbook`/`useWorkbook`(hooks.ts:183) 기존.
- **풀기**: `POST /workbooks/:id/start` → `{ examSessionId }`. 프론트 `startWorkbook`(api.ts:288) 기존, **훅 `useStartWorkbook` 신규**.
- 백엔드 변경 없음.

## 동작

1. 카드 클릭 → 사이드바 열림, `useWorkbook(id)`로 상세 로드(로딩 스켈레톤).
2. 사이드바 내용: 제목·설명·공개범위·문항수·평균점수·문항 목록 미리보기(각 문항 stem 요약, `extractPlainText`).
3. **[풀기]** → `startWorkbook(id)` → `router.push('/exam-sessions/[examSessionId]')`.
   - 백엔드는 **발행 문항만** 담고 제외분을 `skippedQuestionIds`로 반환 → 제외가 있으면 토스트로 "N개 문항 제외됨" 안내.
   - 담길 문항이 0개면 시작 막고 안내.
4. ESC/배경 클릭으로 닫힘.

## 미리보기 사이드바 (공유 idiom)

- E3의 문항 미리보기 사이드바와 같은 우측 슬라이드 패턴(`fixed inset-0 justify-end`, max-w, slide-in-from-right).
- **대상 타입만 다름**: E3=문항, E2=문제집. 공통 셸(`components/preview-sidebar/PreviewSidebar.tsx`)에 헤더/닫기/슬라이드를 두고, 내용·액션을 대상별 컴포넌트로 주입하는 구조 권장. (E3 먼저 구현되면 그 셸 재사용.)

## 컴포넌트 구조

- `web/app/workbook/page.tsx` — 카드 클릭 시 선택 workbook id 상태 → 사이드바 열기.
- `web/components/workbook/WorkbookPreviewSidebar.tsx` — 상세 로드 + [풀기].
- `web/lib/hooks.ts`: `useStartWorkbook` 신규(`startWorkbook` 래핑, mutation).
- (공유) `components/preview-sidebar/PreviewSidebar.tsx` 셸 — E3와 공용.

## 방어 / 관례

- 문항 stem은 ProseMirror JSON → `extractPlainText`.
- 로그인 토큰 필요 → 미로그인 유도.
- `(workbook.questions||[]).map` 가드, 평균점수 null 처리.
- `startWorkbook` 실패/빈 세션 처리(위 3).

## 리스크

- **상세 페이지 부재**: 문제집 상세 전용 페이지(`/workbook/[id]`)는 여전히 없음 — 이 사이드바가 미리보기 역할을 대신. 전체 상세가 필요해지면 별도.
- **발행 문항 전제**: DRAFT 문항만 있는 문제집은 빈 세션 → 시작 차단/안내.
- **의존**: 목적지 `/exam-sessions/[id]`(SP-B), 공유 사이드바 셸(E3).

## 테스트 관점

- 타입체크. 문제집 카드 클릭 → 사이드바 미리보기 → [풀기] → `/exam-sessions/[id]` 진입 확인.
- 미발행 포함 문제집에서 skipped 안내 확인.

## 후속

- 필요 시 문제집 전체 상세 페이지(`/workbook/[id]`)로 확장.
- 사이드바에서 문제집 통째 포크(`forkWorkbook`) 액션 추가 검토.
