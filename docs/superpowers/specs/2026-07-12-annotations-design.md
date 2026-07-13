# 오답노트 2.0 — 텍스트 어노테이션 프론트 구현 설계

날짜: 2026-07-12
상태: 승인됨

## 배경 / 문제

오답노트 2.0의 백엔드(annotations 모듈, `/me/notes` 병합 응답)와 프론트 API 계층(`lib/api.ts`, `lib/hooks.ts`, `lib/types.ts`)은 완성돼 있으나, **사용하는 UI가 없다**:

- 텍스트 드래그 → 하이라이트/밑줄 저장 UI 전무 (`window.getSelection` 사용처 0건)
- 저장된 주석을 문항 텍스트 위에 재렌더링하는 코드 없음 (상세 페이지는 `extractPlainText` 평문만)
- `useCreateAnnotation`/`useUpdateAnnotation`/`useDeleteAnnotation` 소비 컴포넌트 0건
- 상세 페이지(`web/app/notes/[questionId]/page.tsx`)가 mock: i===0을 정답, i===1을 내 선택으로 하드코딩, "이번 풀이 결과" 항상 "오답", 죽은 textarea(147-150행), reasonCode 원문 코드 그대로 노출

**목표**: 오답노트 상세 페이지에서 드래그 → 주석 생성 → 마크 렌더링 루프를 완성하고, mock 데이터를 실데이터로 교체한다. 백엔드는 변경하지 않는다.

## 범위

- 대상 화면: `web/app/notes/[questionId]` **한 곳만**. 시험 결과 리뷰 등 다른 화면은 컴포넌트 재사용으로 추후 확장.
- 백엔드 무변경. 스키마/DTO/엔드포인트 그대로 사용.

## 1. 앵커 모델

`selectionRange = { start: number, end: number }` — **target 블록의 `extractPlainText` 평문 기준 오프셋** (end는 exclusive).

- `target`: `STEM` / `PASSAGE` / `CHOICES` / `EXPLANATION` (기존 `ANNOTATION_TARGETS` 상수, `src/common/constants/question.ts`)
- `target=CHOICES`일 때 `targetId` = choice id → 블록을 선지 하나로 좁힘
- `target=GENERAL` = 문항 전체 일반 메모, 앵커 없음 (백엔드 이미 지원)

**복구 전략** (주석은 question 원본에 붙는데 문항이 나중에 수정될 수 있음) — 렌더 단계에서 **status를 계산**해 렌더러·패널이 동일한 상태값을 공유한다:

| status | 조건 | 처리 |
|---|---|---|
| `NORMAL` | 오프셋 위치 텍스트 === `selectedText` | 그대로 마크 |
| `RECOVERED` | 불일치 → 블록 평문에서 `selectedText` 첫 매치 재검색 성공 | 재검색 위치에 마크 |
| `LOST` | 재검색도 실패 | 마크 생략, 패널에 "위치 유실" 배지 |

**데이터는 삭제하지 않는다.** status는 저장하지 않고 렌더 시 계산 (`resolveAnnotation` 유틸).

**겹치는 주석 우선순위**: `createdAt ASC` 정렬 → 나중에 생성된 것이 위에 렌더.

## 2. 경량 렌더러

### `web/lib/prosemirror.ts` 확장 — visitor 공통화

- 내부 `visitTextNodes(doc, visit)` visitor를 추가하고, **`extractPlainText`와 신규 `walkTextSegments`가 같은 visitor를 사용**하도록 리팩터. 줄바꿈(`\n`)·hardBreak·공백 처리가 두 함수에서 항상 동일 → 오프셋 불일치 원천 차단.
- `walkTextSegments(doc)` — 텍스트 세그먼트 배열 `{ text, start, end }` 산출 (start/end = 평문 오프셋).

### 신규 `web/lib/annotations.ts` — 앵커 해석·공통 유틸

- `resolveAnnotation(plain, ann)` → `{ start, end, status: 'NORMAL' | 'RECOVERED' | 'LOST' }` — 복구 전략 구현. 렌더러·패널이 공유.
- `getReasonLabel(reasonCode)` — REASON_LABELS 접근 공통 유틸 (중복 제거, 향후 다국어 대비).
- 색 팔레트 상수, `ANNOTATION_TARGETS`/`MARK_STYLES`/`REASON_CODES` 프론트 미러 상수.

### 역할 분리 — 렌더링 / 선택 / 오프셋 변환

- **`web/components/notes/AnnotatedText.tsx`** — **렌더링 전용.** props: `{ doc, annotations, onMarkClick }`. 세그먼트를 주석 오프셋 경계로 분할해 span 렌더. 각 span에 `data-start` **+ `data-end`** 속성(DOM↔오프셋 변환 단순화). 마크 클릭 → `onMarkClick(annotationId)`.
- **`web/lib/hooks/useTextSelection.ts`** — 드래그/Selection 계산 훅. `onMouseUp`/`onTouchEnd` **+ `selectionchange`(debounce ~150ms)** 처리 — Safari·모바일 선택 핸들 이동 안정성. 컨테이너 ref 내부 선택만 인정, `data-start`/`data-end`로 평문 오프셋 환산 → `{ target, targetId, start, end, selectedText, rect }` 반환.
- 효과: 렌더러 재사용(리뷰 화면 확장 용이), 선택 로직 독립 테스트 가능.
- 마크 스타일: 하이라이트 = 배경색(알파 낮춤), 밑줄 = `border-bottom` 2px.
- Tiptap 의존 없음.

### 색 팔레트 (기존 토큰 재사용, 신규 색 없음)

| 코드 | hex |
|---|---|
| yellow | #fbbf24 |
| emerald | #34d399 |
| purple | #a78bfa |
| blue | #60a5fa |

## 3. 작성 UX — 툴바 + 패널

### 신규 `web/components/notes/AnnotationToolbar.tsx`

- 드래그 종료 직후 선택 영역 위에 플로팅(데스크톱). 모바일(`md` 미만)은 하단 고정 시트.
- 구성: 마크 스타일 2종(하이라이트/밑줄) + 색 4개 + 원인태그 4개(개념부족/실수/시간부족/기타, `REASON_CODES`) + 메모 입력(선택).
- **Esc 키로 툴바 닫기** (선택 해제 포함).
- 저장 → `useCreateAnnotation` → 쿼리 invalidate로 즉시 마크 반영. (Optimistic update는 이번 범위 아님 — 추후 UX 개선 시 setQueryData+rollback으로 전환 가능.)

### 신규 `web/components/notes/AnnotationPanel.tsx`

- 상세 페이지 우측(모바일: 아래 스택). **두 섹션으로 분리**: ① 문항 메모(`target=GENERAL`) ② 텍스트 주석 목록 — 앵커 유무의 의미 구분.
- 텍스트 주석 항목: `selectedText` 인용 + 원인 배지(`getReasonLabel` — 목록 페이지와 일치) + 메모 + `resolveAnnotation` status가 LOST면 "위치 유실" 배지.
- 인라인 수정(`useUpdateAnnotation`) / 삭제(`useDeleteAnnotation`).
- 문항 메모 섹션 + 버튼 → `target=GENERAL` 생성.
- 기존 죽은 textarea(147-150행)를 이 패널로 대체.

## 4. 상세 페이지 실데이터화 — `web/app/notes/[questionId]/page.tsx`

- 진입 경로: `/notes/[questionId]?sessionId=...`. `NotesDashboard` 오답 링크에 `sessionId` 쿼리 부여(`/me/notes`의 `wrongQuestions[].sessionId` 사용). 쿼리 없으면 `useMyNotes`의 `wrongQuestions`에서 해당 문항 첫 항목의 sessionId로 fallback (**목록이 이미 채점 답안 조회 순서 — 명시적으로는 wrongQuestions 배열 첫 매치 사용으로 고정**, 해석 차이 제거).
- `fetchExamSession(sessionId)`(기존 `lib/api.ts:527`, 제출 후 unmask됨) → 해당 questionId의 snapshot으로:
  - 선지 렌더: snapshot의 `isCorrect` 플래그로 정답 표시, 내 답안 레코드로 내 선택 표시 (**i===0/i===1 하드코딩 제거**)
  - "이번 풀이 결과": 실제 `isCorrect` 값
- stem/passage/explanation을 `AnnotatedText`로 렌더 (`extractPlainText` 평문 렌더 대체).
- reasonCode 원문 노출 → `REASON_LABELS` 매핑.

## 5. 에러 처리·검증

가드 (WEB_GUIDE 관례 준수):

- doc 없음/비정상 → 평문 fallback 렌더
- selection 빈 값·컨테이너 밖 → 툴바 안 띄움
- `(annotations || [])` 방어, `typeof window !== 'undefined'` 가드

수동 검증 시나리오 (프론트에 테스트 러너 없음):

1. 드래그 → 툴바 → 저장 → 마크 즉시 표시
2. 새로고침 → 마크 재렌더 (오프셋 복원)
3. 문항 텍스트 수정(저작 화면) 후 재방문 → selectedText 재검색 복구 or "위치 유실" 배지
4. 패널에서 수정/삭제 → 마크 동기화
5. 모바일 뷰포트: 터치 선택 → 하단 시트, 패널 스택
6. GENERAL 메모 생성/수정/삭제
7. 상세 페이지: 실제 정답/내 선택/풀이 결과 표시 확인
8. `npm run lint` (web)

백엔드 무변경 → `npm test` 영향 없음.

## 신규/변경 파일 요약

| 파일 | 작업 |
|---|---|
| `web/lib/prosemirror.ts` | `visitTextNodes` visitor 공통화 + `walkTextSegments` 추가, `extractPlainText`를 visitor 기반으로 리팩터 |
| `web/lib/annotations.ts` | 신규 — `resolveAnnotation`(status), `getReasonLabel`, 팔레트·상수 미러 |
| `web/lib/hooks/useTextSelection.ts` | 신규 — 선택 계산 훅 (mouseup/touchend + selectionchange debounce) |
| `web/components/notes/AnnotatedText.tsx` | 신규 — 렌더링 전용 (data-start/data-end) |
| `web/components/notes/AnnotationToolbar.tsx` | 신규 — 플로팅 툴바/모바일 시트, Esc 닫기 |
| `web/components/notes/AnnotationPanel.tsx` | 신규 — 문항 메모/텍스트 주석 2섹션, 수정/삭제 |
| `web/app/notes/[questionId]/page.tsx` | mock 제거, 실데이터 + AnnotatedText 통합 |
| `web/components/notes/NotesDashboard.tsx` | 오답 링크에 sessionId 쿼리 부여 |
