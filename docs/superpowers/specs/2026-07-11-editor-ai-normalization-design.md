# 문제 생성 에디터 / AI 기능 정상화 설계 (SP-F)

날짜: 2026-07-11
상태: 승인됨 (구현 대기)
대상: `web/app/studio/editor/page.tsx` → `web/components/workbook/QuestionEditor.tsx` (AI 저작 에디터. `/studio/editor`에 단독 마운트)

## 배경 — AI가 짠 요구사항 vs 실제 코드

원 요구사항은 AI가 작성한 것이라 일부가 현재 코드와 안 맞는다. 실측 결과로 재정렬한다:

| 요구 | 실제 상태 | 이번 작업 |
|---|---|---|
| 1. 가짜 목업 데이터 제거 | 과목은 **이미 API 연동**(`fetchSubjects` + "과목 로딩…" + 실패 토스트). 가짜는 ① "라이브 데모 카드"(하드코딩 예시 문항, 요청 전 항상 노출, QuestionEditor.tsx 628–659) ② 정적 헤더 제목 "2026 수능 국어·문학"(399). | 데모 카드 제거, 제목 동적/일반화 |
| 2. AI 설정창 상시 노출 → 톱니 토글 | 생성옵션(과목/유형/난이도/문항수/지문포함)이 우측 AI 패널에 **상시 노출**(739–872) | 패널 헤더 톱니 → 접이식 섹션(기본 접힘) |
| 3. 옵션이 대화창에 텍스트 노출되는 버그 | **이미 정상** — `handleSend`는 chat에 `currentPrompt`만 push, 옵션은 `createAiGeneration` 페이로드에만 주입 | 변경 없음(회귀 방지 확인만) |
| 4. 생성 완료 후 세션 라우팅 | **흐름 충돌 + 선행 미배선** — 생성=초안 저작(생성→pendingPreview→적용→drafts). "저장하기"(402)는 **핸들러 없는 죽은 버튼**, 문제집 저장 자체가 안 됨 | 명시적 "저장하고 바로 풀기" 브리지(의존 체인 아래) |
| 5. 마이크로 인터랙션 / 로딩 | 칩 hover는 이미 있음(`hover:border-primary/40`). 생성중은 chat 텍스트 "생성 중이에요…"만, **명시 스피너 없음** | 생성 스피너 + 입력 비활성 + 옵션 disabled 유지 |

## 목표

- 가짜 데모 카드/정적 제목 제거 → 실제 데이터·로딩 상태만 노출
- 생성옵션을 톱니 토글 접이식으로 정리(기본 접힘, 화면 안 가림)
- 생성중 명확한 로딩 피드백
- (조건부) 저작 완료 → "저장하고 바로 풀기"로 세션 진입 브리지

## 비목표 (YAGNI)

- #3은 이미 정상 → 신규 작업 없음(회귀 테스트만)
- 필기/계산기 등 세션 편의기능(그건 SP-B)
- 에디터 리치 편집 기능 확장(Tiptap 심화 등)

## 상세 설계

### 1. 가짜 데이터 제거
- **라이브 데모 카드 삭제**(628–659): `messages.length<=1 && pendingPreview.length===0 && !isGenerating`일 때 뜨는 하드코딩 예시 문항 블록 제거. 대신 빈 상태 안내(요청 유도 문구)만.
- **정적 제목 동적화**(399): "2026 수능 국어·문학" 하드코딩 → 선택된 과목/문제집 맥락 반영하거나 일반 문구("새 문항 초안")로.
- **제안 칩(SUGGESTIONS)**: 데이터가 아닌 프롬프트 힌트라 유지(제거 대상 아님).
- **과목**: 이미 실 API + 로딩 상태 → 변경 없음.

### 2. AI 설정(생성옵션) 접이식
- AI 패널 헤더(605–611)에 **톱니(Settings) 버튼** 추가.
- 생성옵션 블록(과목/유형/난이도/문항수/지문포함, 739–872)을 하나의 접이식 섹션으로 묶어 **기본 접힘**. 톱니 클릭 시 펼침(슬라이드, `max-height` 트랜지션 or 조건부 렌더 + 애니메이션).
- 접힘 상태에서도 현재 선택 요약(예: "문학 · 난이도3 · 3문항")을 톱니 옆에 칩으로 노출해 컨텍스트 유지.
- 과목 미선택 등 필수값 누락 시 자동 펼침(가이드).

### 3. 옵션 대화창 비노출 — 회귀 방지만
- `handleSend`가 chat엔 `currentPrompt`만, 옵션은 `createAiGeneration` payload에만 넣는 현 구조 유지. 코드 리뷰/테스트로 회귀만 막는다.

### 4. "저장하고 바로 풀기" 브리지 (의존 체인 주의)
현재 저작 흐름은 세션과 무관하고 저장 자체가 미배선이다. 브리지는 아래 체인을 요구한다:

1. **문제집 저장 배선** (선행, 현재 죽은 "저장하기"): 적용된 drafts로 `createWorkbook({ title, questionIds })`. AI 생성 문항은 이미 실 DB 행(`fetchQuestion` 가능)이라 questionId가 있음.
2. **문항 발행**: 생성 문항은 `DRAFT` 상태. `startWorkbook`은 **발행된 문항만** 세션에 담고 나머지는 `skippedQuestionIds`로 제외 → DRAFT면 빈 세션. 따라서 각 문항 `POST /questions/:id/publish` 선행 필요.
3. **세션 생성 + 라우팅**: `startWorkbook(id)` → `{examSessionId}` → `router.push('/exam-sessions/[id]')` (SP-B 풀기 모드).

- **정책**: 자동 라우팅 아님. 저작(생성→검토→적용)은 그대로. 저장/발행 후 명시적 **"저장하고 바로 풀기"** 버튼으로만 세션 진입.
- **복잡도 경고**: 이 브리지는 SP-F에서 가장 큰 덩어리이며 저장·발행 배선에 의존. 저장/발행이 이번 범위 밖이면 #4는 **후속으로 분리**하고 SP-F는 1·2·5만 먼저 낼 수 있다(권장 분기점).

### 5. 로딩 / 피드백
- 생성중(`isGenerating`): chat에 스피너 버블(회전 아이콘 + "생성 중") + 입력바 비활성 + 옵션 disabled(이미 있음). 스켈레톤/애니메이션으로 멈춘 느낌 제거.
- 호버: 옵션 칩/버튼은 이미 `transition-all` + `hover:border-primary/40`. 톱니·새 버튼도 동일 정책 적용.

## 데이터 소스 / API

- 기존: `fetchSubjects`, `createAiGeneration`, `pollGeneration`(폴링), `fetchQuestion`, `fetchPassage`, `regenerateChoices` — 모두 사용 중.
- #4 브리지 신규 사용: `createWorkbook`(api.ts 존재), `startWorkbook`(api.ts:288 존재), `POST /questions/:id/publish`(백엔드 존재 — 프론트 `publishQuestion` 없으면 추가), 필요시 `createQuestion`(수기 편집분 영속화 시).
- **백엔드 변경 없음**(모든 엔드포인트 존재). 프론트 배선만.

## 영향 파일
- `web/components/workbook/QuestionEditor.tsx` (주 대상 — 40KB, 큼)
- 필요시 접이식 옵션을 `components/workbook/AiSettingsSection.tsx`로 추출(파일이 이미 크므로 분리 권장)
- `web/lib/api.ts`/`hooks.ts`: `publishQuestion` 등 없으면 추가

## ProseMirror / 방어
- draft.stem/choices/explanation은 이미 `extractPlainText`/`buildRichDoc` 경유 중 — 유지.
- `localStorage` 토큰 가드, 배열 가드 관례 유지.

## 리스크 / 주의
- **#4 의존 체인**: 저장 미배선 + DRAFT 발행 필요 → 가장 무거움. 저장/발행 배선을 SP-F에 포함할지, #4를 후속으로 뗄지 먼저 결정(스펙 리뷰에서).
- **파일 크기**: QuestionEditor 40KB. 접이식 옵션·설정은 하위 컴포넌트로 추출해 응집도 유지.
- **회귀(#3)**: 옵션을 chat에 흘리지 않는 현 동작을 깨지 말 것.

## 테스트 관점
- 타입체크. `/studio/editor` 로드 시 데모 카드 사라짐 확인.
- 톱니 토글로 옵션 펼침/접힘, 요약 칩 반영 확인.
- 생성 요청 시 chat엔 유저 프롬프트만(옵션 미노출) + 스피너 노출 확인.
- (#4 포함 시) 저장→발행→바로 풀기→`/exam-sessions/[id]` 진입, 빈 세션 안 되는지 확인.

## 후속 / 의존
- SP-B(세션 페이지) 완료돼야 #4 라우팅 목적지 동작.
- 저장/발행 배선을 별도 태스크로 뗄지 여부는 스펙 리뷰에서 확정.
