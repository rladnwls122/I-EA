# 저작 캔버스 재구조화 — 문제 정의와 개선 방향 (#41)

> as-built 조사(2026-08-04) 기반. 원 계획: `2026-07-12-conversational-authoring-canvas.md`.
> 페르소나 전제(#42 재정의): 셀프서브 수험생이 AI 출력을 다듬어 자기 콘텐츠를 확보하는 도구.

## 1. '구조 많이 개선해야 할 것 같다'의 실체

조사로 확인된 문제를 심각도순으로.

### A. 편집 결과가 유실된다 (데이터 손실 — 최우선)

- 해설을 Tiptap으로 편집해도 저장 시 `extractPlainText → buildRichBlocks` 왕복으로 **서식이 전부 사라진다** (`AuthoringCanvas.tsx:523-525`, 복원도 `:155`에서 평문 왕복).
- 카드 읽기 모드가 지문·발문·해설 전부 `extractPlainText`라 **rich를 넣어도 안 보인다** (`AuthoringCanvasCard.tsx:137,142,69,192`). "편집은 rich, 표시·저장은 평문"이라는 자기모순 구조.
- 선지·선지해설은 애초에 평문 `<input>` — rich 경로 자체가 없음 (`:343-352`, `:371-380`).
- AI가 만든 문항이 검증 실패하면 **조용히 버려진다**(토스트만) — `AuthoringCanvas.tsx:66-75`.
- 함의: #35(수식)·이미지 삽입은 **이 왕복 구조를 먼저 고치지 않으면 얹을 수 없다**. 삽입해봤자 저장·표시에서 증발한다. 재구조화가 삽입 기능의 선행 조건.

### B. 편집기가 이원화돼 있다 (유지보수 이중화)

- `QuestionEditor.tsx` 1091줄이 `/studio/editor`에 병렬 생존. `Draft` vs `CanvasCard` 타입 불일치(choices 형이 다름, 필드 상호 누락), 유형 매핑 로직 중복.
- 셀프서브 페르소나에서 편집기는 하나면 된다. 방향: 캔버스 카드 편집기를 정본으로 승격, `/studio/editor`는 수렴·제거 대상.

### C. 거대 컴포넌트·암묵 규약 (변경 비용)

- `AuthoringCanvas.tsx` 795줄: useState 10+, 저장 함수 154줄(지문 영속화→태그 find-or-create→문항 4단계 직렬 루프). 저장 왕복 최소 3N회(N=문항 수).
- `local-` 접두사 id로 영속 여부 판별(타입 밖 규약), 하이드레이션 ref 플래그 3개(정책 불일치), subjectId 3중 소유 + 동기화 effect(레이스 흔적 주석 존재).
- 지문 공유가 **평문 완전일치 문자열 키** — 한 글자 다르면 그룹 깨짐, 같으면 의도 없이 묶임 (`:105-110`).

### D. AI 계약이 취약하다 (품질 상한)

- 펜스 블록 문자열 계약이라 파서·프롬프트 양쪽에 방어 코드 누적. `stripQuestionBlocks`가 **모든 코드 펜스를 산문에서 지운다**(문항 아닌 코드 예시도 증발, `authoring-chat.ts:108-111`).
- 교체 요청 시 AI가 기존 문항의 선지·정답·해설을 못 본다 — DTO는 받게 정의됐는데 프론트가 stem 120자만 보냄 (`authoring-chat.dto.ts:29-42` vs `AuthoringChatPanel.tsx:110-114`).
- 새로고침하면 화면 스레드만 초기화 — 서버 Redis 히스토리(6h)와 어긋남.
- Redis 히스토리 키에 userId 없음(`authoring:${workbookId}`) — 문제집 id만 알면 남의 대화 문맥에 이어 쓸 수 있는 구조(레이트 리밋 키는 userId 포함 — 스킴 불일치).

### E. 죽은 코드

- `WorkbookBuilder.tsx` 스테퍼 2단계("생성 방식")는 렌더 불가능한 죽은 상태(`:110-125`), `createdWorkbookId` 상태·가드 무의미.

## 2. 셀프서브 페르소나에서 캔버스의 역할 (재정의)

수험생 워크플로: **생성 → 훑기 → 다듬기 → 확정(발행) → 풀기**. 캔버스는 2~4단계 담당.

- "다듬기"의 실제 빈도 순서(코치 관점 추정): 오탈자·표현 수정 > 선지 교체(재생성) > 해설 보강 > 지문 수정 > 형식 요소 삽입(이미지·수식·표).
- 따라서 인라인 편집 품질(A 해결)이 삽입 수단(이미지·수식)보다 상류다. 순서를 바꾸면 안 된다.

## 3. 개선 방향 (단계)

### Phase 0 — 결정 불필요 퀵윈 (이번 세션 처리 가능)

1. 죽은 스테퍼 제거(`WorkbookBuilder.tsx`).
2. `stripQuestionBlocks`가 `qidea-questions` 펜스만 지우게 정규식 한정.
3. Redis 히스토리 키에 userId 포함(`authoring:${userId}:${workbookId}`) — 기존 키는 TTL 6h라 자연 소멸.
4. 교체 요청 컨텍스트 보강 — 프론트가 `currentQuestions`에 choices/answer/explanation을 이미 정의된 DTO대로 채워 보냄.
5. AI 문항 검증 실패를 조용히 버리지 않고 실패 사유를 채팅 스레드에 표시.

### Phase 1 — rich 왕복 구조 수리 (삽입 기능의 선행 조건)

- 저장·복원·읽기 모드에서 ProseMirror JSON을 **왕복 없이 그대로** 다루는 경로 확립: 카드 읽기 모드에 rich 렌더러(전용 read-only Tiptap 또는 노드 워커) 도입, 저장은 에디터 JSON 그대로(`sanitize`는 백엔드가 이미 함).
- `TiptapEditor`의 setTimeout `setContent` 되먹임 제거(controlled 패턴 정리).
- 선지 편집도 최소 rich(마크 수준) 허용할지는 이때 결정.

### Phase 2 — 삽입 수단 (원 티켓 #41 후반부 + #35 소비)

- **이미지**: 백엔드 완비(presign POST + sanitize image 노드 허용), **프론트 호출부 0건**이 현황. `@tiptap/extension-image` + 업로드 훅(`web/lib/api.ts`에 presign→S3 POST→등록 3단계) + 에디터 툴바 버튼. 크롭은 후속.
- **수식·화학식**: #35 결론(`@tiptap/extension-mathematics` v3 + KaTeX, mhchem). 함정 준수 — extractPlainText·sanitize를 백/프론트 같은 커밋으로 확장(주석 앵커·저장 400 리스크).
- **표**: Tiptap table 확장, 에디터 수동 입력 전용(LLM 계약 불변).
- **그래프·회로도**: 이미지 경로 유지.
- 주의: `extractPlainText`가 image/table leaf 노드에서 빈 문자열이 되는 구조(`prosemirror.ts:64-71`) — search_text·주석 앵커에 영향, Phase 2에서 백/프론트 동시 확장 필수.

### Phase 3 — 구조 분해 (점진)

- `handleSave` 154줄 분해 + 왕복 배칭(지문·태그·문항 저장 API를 배치화할지 백엔드 협의).
- `AuthoringCanvas` 상태를 reducer 또는 스토어로, `local-` id 규약을 타입으로 승격.
- `/studio/editor`(QuestionEditor 1091줄) 수렴·제거.
- 지문 공유를 문자열 일치가 아닌 명시적 passageId 연결로.

## 4. 이번 세션 반영분

Phase 0 퀵윈 5건만 코드 반영(결정 불필요·회귀 위험 낮음). Phase 1~3은 별도 세션 권장 —
특히 Phase 1은 렌더러 도입이라 UI 회귀 검증이 필요하고, Phase 2 수식은 #35가 "단독 세션" 조건을 명시했다.
