# 세션 페이지(`/exam-sessions/[id]`, 풀기+결과 듀얼모드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 응시(풀기)와 결과 확인을 한 라우트(`/exam-sessions/[id]`)에서 제공한다. `GET /exam-sessions/:id`의 `status`로 자동 분기 — `IN_PROGRESS`면 문항 2열 그리드 + OMR 패널로 풀고 autosave, `SUBMITTED`면 채점 결과·해설·자기채점을 보여준다.

**Architecture:** Next.js 14 App Router 클라이언트 컴포넌트(`"use client"`, `useParams`). `SessionPage`가 `useSession(id)`로 세션을 조회해 status로 분기하고, 타이머/OMR접힘/화면필기/계산기 UI 상태를 소유한다. 데이터는 TanStack Query(`@tanstack/react-query` v5)로 관리하며, 백엔드는 100% 기존 API(`src/modules/exam-sessions/`)를 그대로 쓴다 — 이번 작업은 프론트 전용.

**Tech Stack:** Next.js 14(App Router) · React 18 · TanStack Query v5 · TypeScript(strict) · Tailwind CSS(+ `tailwindcss-animate`) · shadcn/ui(Radix 기반 `Dialog`/`Button`) · `sonner`(toast) · **신규**: `mathjs`(계산기).

## Global Constraints

- 참고 스펙(단일 출처): `docs/superpowers/specs/2026-07-11-exam-session-page-design.md` — 이 문서와 상충하면 스펙이 옳다.
- **백엔드 변경 없음.** `src/modules/exam-sessions/*`는 절대 건드리지 않는다. 모든 엔드포인트 경로/응답 형태는 실측 완료(아래 각 태스크에 명시).
- **`web`에는 자동화 테스트 러너가 없다**(jest/vitest 미설치, `*.test.ts` 없음). 각 태스크의 "테스트" 단계는 `npx tsc --noEmit -p tsconfig.json`(타입체크) + `npm run dev`로 띄운 뒤 브라우저/curl로 수동 검증이다. pytest/jest 스타일 automated test는 이 레포의 프론트에 존재하지 않으므로 발명하지 않는다.
- 모든 명령은 `web/` 디렉터리에서 실행한다(`cd web` 또는 이미 그 안에 있다고 가정).
- ProseMirror JSON(stem/choices[].content/explanation)은 반드시 `web/lib/prosemirror.ts`의 `extractPlainText(doc:any):string`을 거쳐 렌더링한다. raw 객체를 그대로 렌더링 금지(`[object Object]`/크래시 방지).
- `localStorage` 접근은 `typeof window !== 'undefined'` 가드 뒤에서만(기존 `apiFetch`가 이미 처리 — 신규 코드가 직접 `localStorage`를 만지는 곳은 없음, 있다면 가드).
- 배열은 항상 `(arr || [])` 가드 후 `.map`/`.filter`.
- **객관식은 MVP에서 단일 선택(라디오)만 지원한다.** 이유: `IN_PROGRESS` 상태에서 `GET /exam-sessions/:id`가 반환하는 마스킹된 snapshot은 `choices[].isCorrect`를 완전히 제거한다(`src/modules/exam-sessions/grading.util.ts`의 `maskSnapshot`) — 풀이 중인 클라이언트는 이 문항이 복수정답인지 알 방법이 자체적으로 없다. 스펙 문서의 "복수정답이면 체크"는 이 마스킹 제약과 상충하므로, 이 계획은 라디오 단일선택으로 구현한다(향후 백엔드가 `allowMultiple` 같은 필드를 snapshot에 추가하면 확장).
- **`/questions/[id]` 상세 페이지는 아직 존재하지 않는다**(별도 서브프로젝트 SP-A, 스펙만 있고 미구현). 결과 카드의 "문항 상세 보기" 링크는 **이번 범위에서 제외**한다 — 없는 라우트로 링크를 걸면 이 세션 동안 여러 번 고친 것과 같은 404 패턴이 재발한다. SP-A 구현 후 별도 태스크로 추가.
- 신규 코드는 기존 컨벤션을 따른다: `"use client"` 최상단, `@/*` 경로 별칭(`web/tsconfig.json`이 `@/*` → `./*`), `cn()`(`@/lib/utils`)으로 className 병합, `lucide-react` 아이콘, `sonner`의 `toast`, `--primary`/`--correct`/`--wrong`/`--border`/`--card`/`--muted-foreground` 등 기존 CSS 변수(Tailwind에 `correct`/`wrong`/`primary` 등으로 등록됨, `tailwind.config.ts`).
- 커밋 메시지는 한글, 기존 스타일(`feat:`/`fix:`/`docs:`) 따름.

---

## File Structure

```
web/
  package.json                                    # 수정 — mathjs 의존성 추가
  lib/
    types.ts                                       # 수정 — Session* 타입 추가
    api.ts                                          # 수정 — 세션 응시 API 함수 5개 추가
    hooks.ts                                        # 수정 — 세션 응시 훅 5개 추가
  app/
    exam-sessions/
      [id]/
        page.tsx                                    # 신규 — 라우트 진입점
  components/
    exam-session/
      SessionPage.tsx                               # 신규 — 조회+분기+공통 상태 오케스트레이터
      OmrPanel.tsx                                   # 신규 — 접이식 답안지
      SolveQuestionCard.tsx                          # 신규 — 풀기 카드(OMR+autosave+힌트)
      ResultQuestionCard.tsx                         # 신규 — 결과 카드(채점색+해설+자기채점)
      ResultBanner.tsx                               # 신규 — 채점 요약 배너
      SolveBottomBar.tsx                              # 신규 — 타이머/진행/저장/필기/계산기/제출
      SubmitDialog.tsx                                # 신규 — 미답 문항 경고 확인
      DrawingOverlay.tsx                              # 신규 — 화면필기 canvas(조건부 마운트)
      Calculator.tsx                                  # 신규 — mathjs 공학용 플로팅 계산기
```

각 컴포넌트는 스펙(`2026-07-11-exam-session-page-design.md`)의 "프론트 컴포넌트 구조" 절과 1:1 대응한다. `SessionPage`가 데이터/공통 UI 상태를 소유하고 나머지는 props로 받는 순수 프레젠테이션에 가깝게 유지한다(상태 로직이 여러 파일에 흩어지지 않도록).

---

## 백엔드 계약 실측 (모든 태스크가 참조)

`src/modules/exam-sessions/exam-sessions.controller.ts`(`@Controller('exam-sessions')`) 기준 정확한 경로·응답:

| 함수 | HTTP | 경로 | 응답 |
|---|---|---|---|
| `getById` | GET | `/exam-sessions/:id` | 아래 A |
| `submitAnswer` | PUT | `/exam-sessions/questions/:sessionQuestionId/answer` | `{ sessionQuestionId: string; saved: true }` |
| `revealHint` | POST | `/exam-sessions/questions/:sessionQuestionId/hint` | `{ sessionQuestionId: string; hint: string \| null; isHintUsed: true; hintUsedAt: string }` — `hintContent` 없는 문항이면 404("이 문항에는 힌트가 없습니다.") |
| `submit` | POST | `/exam-sessions/:id/submit` | 아래 B |
| `selfGrade` | PUT | `/exam-sessions/questions/:sessionQuestionId/self-grade` body `{isCorrect:boolean}` | `{ sessionQuestionId: string; isCorrect: boolean; reward: {xp,level,gained} \| null }` |

**A. getById 응답** (`exam-sessions.service.ts:153-198`):
```ts
{
  id: string;
  subject: { id: string; name: string } | null;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
  questions: Array<{
    sessionQuestionId: string;
    questionId: string;
    displayOrder: number;
    isHintUsed: boolean;
    hintUsedAt: string | null;
    // IN_PROGRESS면 choices[].isCorrect·correctAnswerText·explanation 제거(maskSnapshot)
    snapshot: {
      questionType: '객관식' | '주관식';
      stem: any; // ProseMirror
      choices?: Array<{ id: string; isCorrect?: boolean; content?: any; explanation?: any }>;
      explanation?: any;
      correctAnswerText?: string | null;
      points: number;
      difficulty: number;
    };
    answer: {
      selectedChoiceIds: string[] | null;
      answerText: string | null;
      annotations: any;
      isCorrect: boolean | null | undefined; // IN_PROGRESS면 undefined(마스킹)
      timeSpentSec: number | null;
    } | null;
  }>;
}
```

**B. submit 응답** (`exam-sessions.service.ts:400-410`, reward 형태는 `awardForSubmit` `:660-668`):
```ts
{
  id: string;
  status: 'SUBMITTED';
  total: number;
  answered: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
  reward: {
    xp: number;
    level: number;
    gained: number;
    breakdown: { solveXp: number; comboXp: number; weakXp: number; streakXp: number; dailyXp: number; boostActive: boolean };
    streak: { current: number; longest: number; extended: boolean };
    boostGranted: boolean;
  } | null;
}
```

---

### Task 1: mathjs 설치 + 세션 타입 정의

**Files:**
- Modify: `web/package.json` (의존성만, `npm install`로 처리)
- Modify: `web/lib/types.ts`

**Interfaces:**
- Produces: `SessionStatus`, `SessionChoice`, `SessionQuestionSnapshot`, `SessionAnswer`, `SessionQuestionItem`, `SessionDetail`, `SubmitAnswerInput`, `SubmitAnswerResult`, `RevealHintResult`, `RewardBreakdown`, `SubmitReward`, `SubmitSessionResult`, `SelfGradeReward`, `SelfGradeResult` — 이후 모든 태스크가 이 타입들을 그대로 import한다.

- [ ] **Step 1: mathjs 설치**

```bash
npm install mathjs
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "const m=require('./package.json'); console.log('mathjs:', m.dependencies.mathjs)"
```
Expected: `mathjs: ^N.N.N` (버전 문자열 출력, MISSING 아님)

- [ ] **Step 3: `web/lib/types.ts` 끝에 세션 타입 추가**

`web/lib/types.ts` 파일 맨 끝(파일 끝 확인: `grep -c "" web/lib/types.ts`로 마지막 줄 확인 후 그 뒤에 추가)에 다음을 그대로 append:

```ts

// ─── 시험 세션 응시 (GET/PUT/POST /exam-sessions/*) ─────────────────

export type SessionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export interface SessionChoice {
  id: string;
  /** IN_PROGRESS(풀이 중)에는 마스킹되어 없음 */
  isCorrect?: boolean;
  /** ProseMirror JSON */
  content?: any;
  explanation?: any;
}

export interface SessionQuestionSnapshot {
  questionType: QuestionType;
  /** ProseMirror JSON */
  stem: any;
  choices?: SessionChoice[];
  /** ProseMirror JSON. IN_PROGRESS에는 없음 */
  explanation?: any;
  /** 주관식 단답 정답. IN_PROGRESS에는 없음(undefined) */
  correctAnswerText?: string | null;
  points: number;
  difficulty: number;
}

export interface SessionAnswer {
  selectedChoiceIds: string[] | null;
  answerText: string | null;
  annotations: any;
  /** IN_PROGRESS에는 undefined(마스킹). SUBMITTED에는 boolean|null(서술형 미채점) */
  isCorrect: boolean | null | undefined;
  timeSpentSec: number | null;
}

export interface SessionQuestionItem {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  isHintUsed: boolean;
  hintUsedAt: string | null;
  snapshot: SessionQuestionSnapshot;
  answer: SessionAnswer | null;
}

export interface SessionDetail {
  id: string;
  subject: { id: string; name: string } | null;
  status: SessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
  questions: SessionQuestionItem[];
}

export interface SubmitAnswerInput {
  selectedChoiceIds?: string[];
  answerText?: string;
  timeSpentSec?: number;
}

export interface SubmitAnswerResult {
  sessionQuestionId: string;
  saved: true;
}

export interface RevealHintResult {
  sessionQuestionId: string;
  hint: string | null;
  isHintUsed: true;
  hintUsedAt: string;
}

export interface RewardBreakdown {
  solveXp: number;
  comboXp: number;
  weakXp: number;
  streakXp: number;
  dailyXp: number;
  boostActive: boolean;
}

export interface SubmitReward {
  xp: number;
  level: number;
  gained: number;
  breakdown: RewardBreakdown;
  streak: { current: number; longest: number; extended: boolean };
  boostGranted: boolean;
}

export interface SubmitSessionResult {
  id: string;
  status: 'SUBMITTED';
  total: number;
  answered: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
  reward: SubmitReward | null;
}

export interface SelfGradeReward {
  xp: number;
  level: number;
  gained: number;
}

export interface SelfGradeResult {
  sessionQuestionId: string;
  isCorrect: boolean;
  reward: SelfGradeReward | null;
}
```

- [ ] **Step 4: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: `web/lib/types.ts` 관련 에러 없음(기존 파일 다른 곳 에러가 있었다면 그건 이번 변경과 무관 — 이 태스크가 만든 파일만 확인).

- [ ] **Step 5: 커밋**

```bash
git add web/package.json web/package-lock.json web/lib/types.ts
git commit -m "feat: 세션 응시 타입 추가 + mathjs 의존성 설치"
```

---

### Task 2: 세션 응시 API 함수

**Files:**
- Modify: `web/lib/api.ts`

**Interfaces:**
- Consumes: Task 1의 `SessionDetail`, `SubmitAnswerInput`, `SubmitAnswerResult`, `RevealHintResult`, `SubmitSessionResult`, `SelfGradeResult`(전부 `./types`에서 import).
- Produces: `fetchSession(id: string): Promise<SessionDetail>`, `submitSessionAnswer(sessionQuestionId: string, data: SubmitAnswerInput): Promise<SubmitAnswerResult>`, `revealSessionHint(sessionQuestionId: string): Promise<RevealHintResult>`, `submitSession(id: string): Promise<SubmitSessionResult>`, `selfGradeSessionQuestion(sessionQuestionId: string, isCorrect: boolean): Promise<SelfGradeResult>` — Task 3(훅)이 그대로 import.

- [ ] **Step 1: import 타입 추가**

`web/lib/api.ts` 상단의 `import type { ... } from './types';` 블록(파일 8~26번째 줄)에 아래 타입들을 기존 목록 끝에 추가한다. 기존 블록은:

```ts
import type {
  Subject,
  Tag,
  Question,
  Passage,
  QuestionStatus,
  Workbook,
  WorkbookQuestion,
  AiGeneration,
  AiGenerationCreated,
  CreateAiGenerationInput,
  QuestionStats,
  QuestionComment,
  UserQuestionAnnotation,
  AuthResponse,
  MyNotesResponse,
  MyExamSession,
  PaginatedResponse,
} from './types';
```

`PaginatedResponse,` 다음 줄에 추가해서 아래처럼 만든다:

```ts
import type {
  Subject,
  Tag,
  Question,
  Passage,
  QuestionStatus,
  Workbook,
  WorkbookQuestion,
  AiGeneration,
  AiGenerationCreated,
  CreateAiGenerationInput,
  QuestionStats,
  QuestionComment,
  UserQuestionAnnotation,
  AuthResponse,
  MyNotesResponse,
  MyExamSession,
  PaginatedResponse,
  SessionDetail,
  SubmitAnswerInput,
  SubmitAnswerResult,
  RevealHintResult,
  SubmitSessionResult,
  SelfGradeResult,
} from './types';
```

- [ ] **Step 2: 파일 끝에 세션 응시 함수 5개 추가**

`web/lib/api.ts` 맨 끝에 추가:

```ts

// ─── 시험 세션 응시 ─────────────────────────────────────────────────

/** 세션 응시 데이터 조회 (진행 중이면 정답 마스킹, 제출 완료면 공개) */
export function fetchSession(id: string) {
  return apiFetch<SessionDetail>(`/exam-sessions/${id}`);
}

/** 문항 답안 저장(OMR) — autosave용. upsert라 여러 번 호출해도 안전 */
export function submitSessionAnswer(
  sessionQuestionId: string,
  data: SubmitAnswerInput,
) {
  return apiFetch<SubmitAnswerResult>(
    `/exam-sessions/questions/${sessionQuestionId}/answer`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

/** 힌트 열람 (힌트 없는 문항이면 404) */
export function revealSessionHint(sessionQuestionId: string) {
  return apiFetch<RevealHintResult>(
    `/exam-sessions/questions/${sessionQuestionId}/hint`,
    { method: 'POST' },
  );
}

/** 세션 최종 제출 — 채점 집계 + XP 적립 */
export function submitSession(id: string) {
  return apiFetch<SubmitSessionResult>(`/exam-sessions/${id}/submit`, {
    method: 'POST',
  });
}

/** 서술형 자기채점 확정(SUBMITTED 세션에서만 호출 가능) */
export function selfGradeSessionQuestion(
  sessionQuestionId: string,
  isCorrect: boolean,
) {
  return apiFetch<SelfGradeResult>(
    `/exam-sessions/questions/${sessionQuestionId}/self-grade`,
    {
      method: 'PUT',
      body: JSON.stringify({ isCorrect }),
    },
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add web/lib/api.ts
git commit -m "feat: 세션 응시 API 함수 추가(fetchSession/submitAnswer/hint/submit/selfGrade)"
```

---

### Task 3: 세션 응시 훅

**Files:**
- Modify: `web/lib/hooks.ts`

**Interfaces:**
- Consumes: Task 2의 `fetchSession`, `submitSessionAnswer`, `revealSessionHint`, `submitSession`, `selfGradeSessionQuestion`(전부 `./api`에서 import). Task 1의 `SubmitAnswerInput` 타입.
- Produces:
  - `useSession(id: string | null): UseQueryResult<SessionDetail>`
  - `useSubmitAnswer(sessionQuestionId: string): UseMutationResult<SubmitAnswerResult, Error, SubmitAnswerInput>` — `mutationKey: ['submit-answer', sessionQuestionId]`(레이스 방지, `SolveBottomBar`가 `useIsMutating`으로 이 키를 구독해 저장중 표시)
  - `useRevealHint(): UseMutationResult<RevealHintResult, Error, string>` (variables = sessionQuestionId)
  - `useSubmitSession(): UseMutationResult<SubmitSessionResult, Error, string>` (variables = sessionId) — 성공 시 `['session', sessionId]` 쿼리 invalidate
  - `useSelfGrade(): UseMutationResult<SelfGradeResult, Error, {sessionQuestionId:string; isCorrect:boolean}>` — 성공 시 `['session', variables 소속 sessionId]`를 모른다(응답에 sessionId 없음) → 호출부(SessionPage)가 직접 invalidate하도록 `onSuccess`는 두지 않고 컴포넌트에서 처리(Task 11에서 구체화).

- [ ] **Step 1: import 함수 추가**

`web/lib/hooks.ts` 상단 import 블록(1~32번째 줄 부근)의 `from './api'` 목록에 추가:

```ts
import {
  fetchSubjects,
  fetchQuestions,
  fetchQuestion,
  fetchQuestionStats,
  fetchAiGeneration,
  fetchWorkbooks,
  fetchWorkbook,
  fetchComments,
  fetchAnnotations,
  fetchMyNotes,
  fetchMyExamSessions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  publishQuestion,
  createWorkbook,
  addQuestionToWorkbook,
  createAiGeneration,
  createComment,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  fetchSession,
  submitSessionAnswer,
  revealSessionHint,
  submitSession,
  selfGradeSessionQuestion,
} from './api';
```

`import type { ... } from './types';` 블록에도 `SubmitAnswerInput` 추가:

```ts
import type {
  Subject,
  Question,
  QuestionStatus,
  Workbook,
  AiGeneration,
  SubmitAnswerInput,
} from './types';
```

- [ ] **Step 2: 파일 끝에 세션 응시 훅 5개 추가**

`web/lib/hooks.ts` 맨 끝(기존 `useDebounce` 다음)에 추가:

```ts

// ─── 시험 세션 응시 ─────────────────────────────────────────────────

/** 세션 응시 데이터. IN_PROGRESS/SUBMITTED로 프론트가 모드를 분기한다 */
export function useSession(id: string | null) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => fetchSession(id!),
    enabled: !!id,
  });
}

/**
 * 답안 저장(autosave). mutationKey에 sessionQuestionId를 포함해
 * SolveBottomBar가 useIsMutating(['submit-answer'])으로 "저장중" 여부를
 * 전역에서 알 수 있게 한다. 세션 전체를 invalidate하지 않는다 —
 * 매 저장마다 리페치하면 카드가 깜빡인다(로컬 상태가 이미 최신).
 */
export function useSubmitAnswer(sessionQuestionId: string) {
  return useMutation({
    mutationKey: ['submit-answer', sessionQuestionId],
    mutationFn: (data: SubmitAnswerInput) =>
      submitSessionAnswer(sessionQuestionId, data),
  });
}

/** 힌트 열람. 힌트 없는 문항이면 apiFetch가 Error를 throw(404) */
export function useRevealHint() {
  return useMutation({
    mutationFn: (sessionQuestionId: string) =>
      revealSessionHint(sessionQuestionId),
  });
}

/** 세션 최종 제출. 성공 시 세션 쿼리를 invalidate해 SUBMITTED로 재조회 → 결과 모드 전환 */
export function useSubmitSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitSession(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
    },
  });
}

/** 서술형 자기채점. 호출부가 성공 후 세션 쿼리 invalidate를 직접 처리한다(id를 몰라 여기선 못함) */
export function useSelfGrade() {
  return useMutation({
    mutationFn: ({
      sessionQuestionId,
      isCorrect,
    }: {
      sessionQuestionId: string;
      isCorrect: boolean;
    }) => selfGradeSessionQuestion(sessionQuestionId, isCorrect),
  });
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add web/lib/hooks.ts
git commit -m "feat: 세션 응시 훅 추가(useSession/useSubmitAnswer/useRevealHint/useSubmitSession/useSelfGrade)"
```

---

### Task 4: 라우트 + SessionPage 셸(로딩/에러/분기 뼈대)

**Files:**
- Create: `web/app/exam-sessions/[id]/page.tsx`
- Create: `web/components/exam-session/SessionPage.tsx`

**Interfaces:**
- Consumes: Task 3의 `useSession`.
- Produces: `SessionPage` 컴포넌트(`props: { id: string }`)가 이후 태스크들이 채워넣을 셸. 이 태스크 시점엔 로딩/에러/EXPIRED 처리와 IN_PROGRESS/SUBMITTED 자리표시자만 있고, 실제 레이아웃은 Task 10·12에서 채운다.

- [ ] **Step 1: 라우트 파일 작성**

`web/app/exam-sessions/[id]/page.tsx`:

```tsx
"use client";
import { useParams } from "next/navigation";
import { SessionPage } from "@/components/exam-session/SessionPage";

export default function ExamSessionRoute() {
  const { id } = useParams() as { id: string };
  return <SessionPage id={id} />;
}
```

- [ ] **Step 2: SessionPage 셸 작성**

`web/components/exam-session/SessionPage.tsx`:

```tsx
"use client";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/hooks";

export function SessionPage({ id }: { id: string }) {
  const { data: session, isLoading, isError } = useSession(id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          세션을 찾을 수 없어요.
        </p>
        <p className="text-xs text-muted-foreground">
          삭제되었거나 접근 권한이 없는 세션입니다.
        </p>
      </div>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          만료된 세션이에요.
        </p>
        <p className="text-xs text-muted-foreground">
          제한 시간이 지나 더 이상 응시할 수 없습니다.
        </p>
      </div>
    );
  }

  if (session.status === "IN_PROGRESS") {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        풀기 모드 — {session.questions.length}문항 (Task 10에서 완성)
      </div>
    );
  }

  return (
    <div className="p-8 text-sm text-muted-foreground">
      결과 모드 — {session.questions.length}문항 (Task 12에서 완성)
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 4: dev 서버로 라우트 존재 확인**

```bash
npm run dev -- -p 3011 &
sleep 4
curl -s -o /dev/null -w "STATUS:%{http_code}\n" http://localhost:3011/exam-sessions/00000000-0000-0000-0000-000000000000
```
Expected: `STATUS:200`(존재하지 않는 id라도 라우트 자체는 200 — 클라이언트에서 로딩 후 "세션을 찾을 수 없어요" 표시. 서버는 항상 200 반환하는 클라이언트 컴포넌트 라우트이므로 정상). 확인 후 서버 종료:

```bash
kill %1
```

- [ ] **Step 5: 커밋**

```bash
git add web/app/exam-sessions web/components/exam-session/SessionPage.tsx
git commit -m "feat: 세션 페이지 라우트 + 로딩/에러/분기 셸 추가"
```

---

### Task 5: SolveQuestionCard (풀기 카드 — OMR + autosave + 힌트)

**Files:**
- Create: `web/components/exam-session/SolveQuestionCard.tsx`

**Interfaces:**
- Consumes: `SessionQuestionItem`(Task 1), `useSubmitAnswer`·`useRevealHint`(Task 3), `useDebounce`(기존 `lib/hooks.ts:447`), `extractPlainText`(기존 `lib/prosemirror.ts`).
- Produces: `SolveQuestionCard` 컴포넌트.
  ```ts
  function SolveQuestionCard(props: {
    item: SessionQuestionItem;
    order: number; // 1-based 표시 번호
    onAnswerStateChange: (sessionQuestionId: string, answered: boolean) => void;
  }): JSX.Element
  ```
  `onAnswerStateChange`를 Task 10에서 `SessionPage`가 받아 OMR 패널의 "답한 문항" 집합을 갱신한다.

- [ ] **Step 1: 컴포넌트 작성**

`web/components/exam-session/SolveQuestionCard.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useDebounce, useSubmitAnswer, useRevealHint } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import type { SessionQuestionItem } from "@/lib/types";

export function SolveQuestionCard({
  item,
  order,
  onAnswerStateChange,
}: {
  item: SessionQuestionItem;
  order: number;
  onAnswerStateChange: (sessionQuestionId: string, answered: boolean) => void;
}) {
  const isObjective = item.snapshot.questionType === "객관식";
  const submitAnswer = useSubmitAnswer(item.sessionQuestionId);
  const revealHint = useRevealHint();

  // ── 객관식: 단일 선택(라디오). 마스킹된 snapshot은 복수정답 여부를 알 수 없다(Global Constraints 참고) ──
  const [selectedId, setSelectedId] = useState<string | null>(
    item.answer?.selectedChoiceIds?.[0] ?? null,
  );

  const selectChoice = (choiceId: string) => {
    setSelectedId(choiceId);
    onAnswerStateChange(item.sessionQuestionId, true);
    submitAnswer.mutate({ selectedChoiceIds: [choiceId] });
  };

  // ── 주관식: 입력 후 600ms 디바운스 저장 ──
  const [answerText, setAnswerText] = useState(item.answer?.answerText ?? "");
  const debouncedText = useDebounce(answerText, 600);
  const firstRender = useRef(true);
  useEffect(() => {
    if (isObjective) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    onAnswerStateChange(item.sessionQuestionId, debouncedText.trim().length > 0);
    submitAnswer.mutate({ answerText: debouncedText });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText]);

  // ── 힌트 ──
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintUnavailable, setHintUnavailable] = useState(false);
  const openHint = () => {
    revealHint.mutate(item.sessionQuestionId, {
      onSuccess: (res) => setHintText(res.hint),
      onError: () => setHintUnavailable(true),
    });
  };

  const choices = item.snapshot.choices ?? [];

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {order}.
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {item.snapshot.questionType}
        </Badge>
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {extractPlainText(item.snapshot.stem)}
      </p>

      {isObjective ? (
        <div className="space-y-2">
          {choices.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectChoice(c.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                selectedId === c.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] font-mono ${
                  selectedId === c.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {i + 1}
              </span>
              <span>{extractPlainText(c.content)}</span>
            </button>
          ))}
        </div>
      ) : (
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          rows={3}
          placeholder="답안을 입력하세요"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      )}

      <div className="mt-3 flex items-center gap-2">
        {!hintUnavailable && (
          <button
            type="button"
            onClick={openHint}
            disabled={revealHint.isPending}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
          >
            {revealHint.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Lightbulb size={13} />
            )}
            힌트
          </button>
        )}
        {submitAnswer.isPending && (
          <span className="text-[10px] text-muted-foreground">저장 중…</span>
        )}
      </div>

      {hintText && (
        <p className="mt-2 rounded-lg bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          💡 {hintText}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add web/components/exam-session/SolveQuestionCard.tsx
git commit -m "feat: 세션 풀기 카드(SolveQuestionCard) — OMR 라디오/주관식 autosave/힌트"
```

---

### Task 6: OmrPanel (접이식 답안지)

**Files:**
- Create: `web/components/exam-session/OmrPanel.tsx`

**Interfaces:**
- Consumes: 없음(순수 props).
- Produces:
  ```ts
  function OmrPanel(props: {
    items: Array<{ sessionQuestionId: string; order: number }>;
    answeredIds: Set<string>;
    onJump: (sessionQuestionId: string) => void;
  }): JSX.Element
  ```
  내부에 접힘 상태(`collapsed: boolean`)를 자체 소유(`useState`) — 부모에 노출 안 함(스펙상 다른 컴포넌트가 이 상태를 알 필요 없음).

- [ ] **Step 1: 컴포넌트 작성**

`web/components/exam-session/OmrPanel.tsx`:

```tsx
"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function OmrPanel({
  items,
  answeredIds,
  onJump,
}: {
  items: Array<{ sessionQuestionId: string; order: number }>;
  answeredIds: Set<string>;
  onJump: (sessionQuestionId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="답안지 펼치기"
        className="sticky top-4 flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft size={16} />
      </button>
    );
  }

  return (
    <aside className="sticky top-4 w-[200px] flex-none rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">답안지</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="답안지 접기"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {items.map((it) => {
          const answered = answeredIds.has(it.sessionQuestionId);
          return (
            <button
              key={it.sessionQuestionId}
              type="button"
              onClick={() => onJump(it.sessionQuestionId)}
              className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-[11px] transition-colors ${
                answered
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {it.order}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        {answeredIds.size}/{items.length} 답변
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add web/components/exam-session/OmrPanel.tsx
git commit -m "feat: 접이식 OMR 패널(OmrPanel) — 번호 그리드+점프+접기"
```

---

### Task 7: SubmitDialog + SolveBottomBar (타이머/진행/저장/제출)

**Files:**
- Create: `web/components/exam-session/SubmitDialog.tsx`
- Create: `web/components/exam-session/SolveBottomBar.tsx`

**Interfaces:**
- Consumes: shadcn `Dialog`(`@/components/ui/dialog`), `Button`(`@/components/ui/button`), `useIsMutating`(`@tanstack/react-query`).
- Produces:
  ```ts
  function SubmitDialog(props: {
    open: boolean;
    unansweredCount: number;
    onConfirm: () => void;
    onCancel: () => void;
    isSubmitting: boolean;
  }): JSX.Element

  function SolveBottomBar(props: {
    startedAt: string | null;
    answeredCount: number;
    totalCount: number;
    drawingEnabled: boolean;
    onToggleDrawing: () => void;
    calculatorOpen: boolean;
    onToggleCalculator: () => void;
    onRequestSubmit: () => void; // SubmitDialog를 열지 SessionPage가 결정
  }): JSX.Element
  ```

- [ ] **Step 1: SubmitDialog 작성**

`web/components/exam-session/SubmitDialog.tsx`:

```tsx
"use client";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function SubmitDialog({
  open,
  unansweredCount,
  onConfirm,
  onCancel,
  isSubmitting,
}: {
  open: boolean;
  unansweredCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>제출할까요?</DialogTitle>
          <DialogDescription>
            {unansweredCount > 0
              ? `아직 풀지 않은 문항이 ${unansweredCount}개 있어요. 제출하면 되돌릴 수 없습니다.`
              : "모든 문항에 답했어요. 제출하면 채점 결과를 바로 확인할 수 있습니다."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            취소
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            제출하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: SolveBottomBar 작성**

`web/components/exam-session/SolveBottomBar.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Calculator as CalculatorIcon, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SolveBottomBar({
  startedAt,
  answeredCount,
  totalCount,
  drawingEnabled,
  onToggleDrawing,
  calculatorOpen,
  onToggleCalculator,
  onRequestSubmit,
}: {
  startedAt: string | null;
  answeredCount: number;
  totalCount: number;
  drawingEnabled: boolean;
  onToggleDrawing: () => void;
  calculatorOpen: boolean;
  onToggleCalculator: () => void;
  onRequestSubmit: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // 이 세션에서 진행 중인 답안 저장(submit-answer) 뮤테이션이 하나라도 있으면 "저장 중"
  const savingCount = useIsMutating({ mutationKey: ["submit-answer"] });

  return (
    <div className="sticky bottom-0 z-40 flex items-center gap-4 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        ⏱ {formatElapsed(elapsed)}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        답안 {answeredCount}/{totalCount}
      </span>
      <span className="text-[11px] text-muted-foreground">
        {savingCount > 0 ? "저장 중…" : "💾 저장됨"}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleDrawing}
        aria-pressed={drawingEnabled}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          drawingEnabled
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title="화면필기"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={onToggleCalculator}
        aria-pressed={calculatorOpen}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          calculatorOpen
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
        title="계산기"
      >
        <CalculatorIcon size={16} />
      </button>

      <Button size="sm" onClick={onRequestSubmit} className="gap-1.5">
        <Send size={14} /> 제출
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add web/components/exam-session/SubmitDialog.tsx web/components/exam-session/SolveBottomBar.tsx
git commit -m "feat: 제출 확인 다이얼로그 + 풀기 하단바(타이머/진행/저장표시/제출)"
```

---

### Task 8: DrawingOverlay (화면필기 canvas)

**Files:**
- Create: `web/components/exam-session/DrawingOverlay.tsx`

**Interfaces:**
- Consumes: 없음(순수 canvas 로직).
- Produces: `DrawingOverlay(props: { onClose: () => void }): JSX.Element`. **조건부 마운트 방식**(`{drawingEnabled && <DrawingOverlay .../>}`)으로 사용 — 컴포넌트 자체는 항상 "켜진" 상태로만 렌더링되므로 내부에 `pointer-events` 토글 로직이 필요 없다(스펙의 "OFF면 pointer-events:none" 요구를 충족하는 가장 단순한 방법: OFF면 아예 마운트하지 않음 → 자연히 하위 UI 클릭이 통과됨). 스펙이 명시한 "저장 안 함(꺼지면 소멸)" 요구사항도 언마운트 시 canvas가 사라지며 자동으로 만족된다.

- [ ] **Step 1: 컴포넌트 작성**

`web/components/exam-session/DrawingOverlay.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Trash2, X } from "lucide-react";

const COLORS = ["#f87171", "#34d399", "#60a5fa", "#facc15", "#f7f8f8"];

export function DrawingOverlay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = erasing ? "#000000" : color;
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.lineWidth = erasing ? 24 : 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(e.clientX, e.clientY);
    ctx.stroke();
    last.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    drawing.current = false;
    last.current = null;
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="fixed bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setErasing(false);
            }}
            aria-label={`색상 ${c}`}
            className={`h-6 w-6 rounded-full border-2 ${
              !erasing && color === c ? "border-foreground" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          onClick={() => setErasing(true)}
          aria-pressed={erasing}
          className={`flex h-7 w-7 items-center justify-center rounded-md border ${
            erasing ? "border-primary text-primary" : "border-border text-muted-foreground"
          }`}
          title="지우개"
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-wrong"
          title="전체 지우기"
        >
          <Trash2 size={14} />
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          title="화면필기 끄기"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add web/components/exam-session/DrawingOverlay.tsx
git commit -m "feat: 화면필기 canvas 오버레이(DrawingOverlay) — 조건부 마운트로 휘발"
```

---

### Task 9: Calculator (mathjs 공학용 플로팅 계산기)

**Files:**
- Create: `web/components/exam-session/Calculator.tsx`

**Interfaces:**
- Consumes: `mathjs`(Task 1에서 설치).
- Produces: `Calculator(props: { onClose: () => void }): JSX.Element`. **이 파일 자체는 `next/dynamic` 대상**이다 — 이 파일 안에서는 그냥 평범한 컴포넌트로 작성하고, Task 10에서 `SessionPage`가 `next/dynamic(() => import('./Calculator').then(m => m.Calculator), { ssr: false })`로 지연 로드한다(패턴은 `web/app/notes/@sidebar/page.tsx`의 `VegaStatWidget` 동적 임포트와 동일).

- [ ] **Step 1: 컴포넌트 작성**

`web/components/exam-session/Calculator.tsx`:

```tsx
"use client";
import { useState } from "react";
import * as math from "mathjs";
import { X } from "lucide-react";

const BUTTONS = [
  "sin(", "cos(", "tan(", "(",
  "log(", "ln(", "sqrt(", ")",
  "7", "8", "9", "÷",
  "4", "5", "6", "×",
  "1", "2", "3", "−",
  "0", ".", "π", "+",
  "^", "e", "C", "=",
];

function toMathExpr(display: string): string {
  return display
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replaceAll("π", "pi");
}

export function Calculator({ onClose }: { onClose: () => void }) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragging = useState({ active: false, offX: 0, offY: 0 })[0];
  const [display, setDisplay] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    dragging.active = true;
    dragging.offX = e.clientX - pos.x;
    dragging.offY = e.clientY - pos.y;
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!dragging.active) return;
    setPos({ x: e.clientX - dragging.offX, y: e.clientY - dragging.offY });
  };
  const onHeaderPointerUp = () => {
    dragging.active = false;
  };

  const press = (token: string) => {
    if (token === "C") {
      setDisplay("");
      setResult(null);
      return;
    }
    if (token === "=") {
      try {
        const value = math.evaluate(toMathExpr(display));
        setResult(String(value));
      } catch {
        setResult("오류");
      }
      return;
    }
    setDisplay((d) => d + token);
  };

  return (
    <div
      className="fixed z-[70] w-[260px] rounded-xl border border-border bg-card shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className="flex cursor-grab items-center justify-between rounded-t-xl border-b border-border bg-surface-raised px-3 py-2 active:cursor-grabbing"
      >
        <span className="text-xs font-semibold text-foreground">계산기</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="min-h-[20px] text-right font-mono text-xs text-muted-foreground">
          {display || "0"}
        </div>
        <div className="min-h-[28px] text-right font-mono text-lg font-semibold text-foreground">
          {result ?? ""}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 p-3 pt-0">
        {BUTTONS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => press(b)}
            className={`rounded-md border border-border py-2 font-mono text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 ${
              b === "=" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-foreground"
            }`}
          >
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음. (mathjs가 자체 타입을 번들하므로 `@types/mathjs` 불필요 — 에러 나면 `node -e "console.log(require('mathjs/package.json').types)"`로 타입 진입점 확인)

- [ ] **Step 3: 커밋**

```bash
git add web/components/exam-session/Calculator.tsx
git commit -m "feat: mathjs 공학용 플로팅 계산기(Calculator)"
```

---

### Task 10: 풀기 모드 전체 조립 (SessionPage에 Solve 레이아웃 완성)

**Files:**
- Modify: `web/components/exam-session/SessionPage.tsx`

**Interfaces:**
- Consumes: Task 3의 `useSession`, `useSubmitSession`; Task 5~9의 모든 컴포넌트(`SolveQuestionCard`, `OmrPanel`, `SolveBottomBar`, `SubmitDialog`, `DrawingOverlay`); Task 9의 `Calculator`(동적 임포트).
- Produces: `SessionPage`가 `IN_PROGRESS`일 때 완전한 2열 그리드+OMR+하단바+제출 플로우를 렌더링. 제출 성공 시 `useSubmitSession`의 `onSuccess`가 `['session', id]`를 invalidate(Task 3에 이미 구현됨) → 재조회된 `session.status === 'SUBMITTED'`로 자동 전환(Task 12가 결과 레이아웃을 채우기 전까지는 Task 4의 자리표시자가 잠깐 보임 — Task 12에서 마무리).

- [ ] **Step 1: `SessionPage.tsx` 전체 교체**

`web/components/exam-session/SessionPage.tsx`를 아래로 전체 교체(Task 4의 셸을 확장):

```tsx
"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSession, useSubmitSession } from "@/lib/hooks";
import { OmrPanel } from "./OmrPanel";
import { SolveQuestionCard } from "./SolveQuestionCard";
import { SolveBottomBar } from "./SolveBottomBar";
import { SubmitDialog } from "./SubmitDialog";
import { DrawingOverlay } from "./DrawingOverlay";

const Calculator = dynamic(
  () => import("./Calculator").then((m) => m.Calculator),
  { ssr: false },
);

export function SessionPage({ id }: { id: string }) {
  const { data: session, isLoading, isError } = useSession(id);
  const submitSession = useSubmitSession();

  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  // 서버에서 최초 로드된 답변 상태로 answeredIds를 초기화(한 번만).
  const initialized = useMemo(() => {
    if (!session) return false;
    setAnsweredIds((prev) => {
      if (prev.size > 0) return prev; // 이미 로컬 상태가 있으면(사용자가 조작 중) 덮지 않음
      const ids = session.questions
        .filter((q) => q.answer != null)
        .map((q) => q.sessionQuestionId);
      return new Set(ids);
    });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const handleAnswerStateChange = (sessionQuestionId: string, answered: boolean) => {
    setAnsweredIds((prev) => {
      const next = new Set(prev);
      if (answered) next.add(sessionQuestionId);
      else next.delete(sessionQuestionId);
      return next;
    });
  };

  const jumpTo = (sessionQuestionId: string) => {
    document
      .getElementById(`sq-${sessionQuestionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleSubmit = () => {
    submitSession.mutate(id, {
      onSuccess: () => {
        setSubmitDialogOpen(false);
        toast.success("제출 완료! 채점 결과를 확인하세요.");
      },
      onError: () => {
        toast.error("제출에 실패했어요. 다시 시도해주세요.");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">세션을 찾을 수 없어요.</p>
        <p className="text-xs text-muted-foreground">
          삭제되었거나 접근 권한이 없는 세션입니다.
        </p>
      </div>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">만료된 세션이에요.</p>
        <p className="text-xs text-muted-foreground">
          제한 시간이 지나 더 이상 응시할 수 없습니다.
        </p>
      </div>
    );
  }

  if (session.status !== "IN_PROGRESS") {
    // SUBMITTED — Task 12에서 결과 레이아웃으로 교체
    return (
      <div className="p-8 text-sm text-muted-foreground">
        결과 모드 — {session.questions.length}문항 (Task 12에서 완성)
      </div>
    );
  }

  void initialized;
  const omrItems = session.questions
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((q) => ({ sessionQuestionId: q.sessionQuestionId, order: q.displayOrder }));

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 gap-4 p-6">
        <div className="flex-1 grid grid-cols-1 gap-4 md:grid-cols-2">
          {session.questions
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((q) => (
              <div key={q.sessionQuestionId} id={`sq-${q.sessionQuestionId}`}>
                <SolveQuestionCard
                  item={q}
                  order={q.displayOrder}
                  onAnswerStateChange={handleAnswerStateChange}
                />
              </div>
            ))}
        </div>
        <OmrPanel items={omrItems} answeredIds={answeredIds} onJump={jumpTo} />
      </div>

      <SolveBottomBar
        startedAt={session.startedAt}
        answeredCount={answeredIds.size}
        totalCount={session.questions.length}
        drawingEnabled={drawingEnabled}
        onToggleDrawing={() => setDrawingEnabled((v) => !v)}
        calculatorOpen={calculatorOpen}
        onToggleCalculator={() => setCalculatorOpen((v) => !v)}
        onRequestSubmit={() => setSubmitDialogOpen(true)}
      />

      <SubmitDialog
        open={submitDialogOpen}
        unansweredCount={session.questions.length - answeredIds.size}
        onConfirm={handleSubmit}
        onCancel={() => setSubmitDialogOpen(false)}
        isSubmitting={submitSession.isPending}
      />

      {drawingEnabled && <DrawingOverlay onClose={() => setDrawingEnabled(false)} />}
      {calculatorOpen && <Calculator onClose={() => setCalculatorOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 3: 실제 Railway API로 풀기 모드 수동 검증**

`.env`/`web/.env.local`의 `NEXT_PUBLIC_API_URL`이 Railway를 가리키는 상태에서:

```bash
npm run dev -- -p 3011 &
sleep 4
```

브라우저에서 `http://localhost:3011/login`으로 `consumer@demo.io`/`demo1234!` 로그인 후, curl로 시드 문제집의 세션을 하나 만들어 확인(토큰은 로그인 응답에서):

```bash
TOKEN=$(curl -s -X POST https://i-ea-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"consumer@demo.io","password":"demo1234!"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
WB_ID=$(curl -s https://i-ea-production.up.railway.app/api/workbooks -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).items[0].id))")
SESSION_ID=$(curl -s -X POST https://i-ea-production.up.railway.app/api/workbooks/$WB_ID/start -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).examSessionId))")
echo "http://localhost:3011/exam-sessions/$SESSION_ID"
```

이 URL을 브라우저(로그인된 상태)로 열어 확인:
- 문항 카드가 2열로 뜨는지, 객관식 클릭 시 즉시 저장되는지("저장 중…" → 사라짐)
- OMR 패널 `>` 로 접고 펼치기, 번호 클릭 시 해당 카드로 스크롤
- 화면필기 토글 시 그림이 그려지고, 꺼도 하위 버튼 클릭이 막히지 않는지
- 계산기 토글 시 `sin(pi/2)` 입력 후 `=` → `1` 표시
- 제출 클릭 → 다이얼로그 → 확인 → "결과 모드 — N문항 (Task 12에서 완성)" 텍스트로 바뀌는지(모드 전환 확인, 완성된 결과 UI는 Task 12)

확인 후 서버 종료:

```bash
kill %1
```

- [ ] **Step 4: 커밋**

```bash
git add web/components/exam-session/SessionPage.tsx
git commit -m "feat: 풀기 모드 전체 조립(2열 그리드+OMR+하단바+제출+필기/계산기)"
```

---

### Task 11: ResultBanner + ResultQuestionCard (결과 모드 컴포넌트)

**Files:**
- Create: `web/components/exam-session/ResultBanner.tsx`
- Create: `web/components/exam-session/ResultQuestionCard.tsx`

**Interfaces:**
- Consumes: `SessionQuestionItem`, `SubmitSessionResult`(Task 1), `useSelfGrade`(Task 3), `extractPlainText`(기존).
- Produces:
  ```ts
  function ResultBanner(props: {
    total: number;
    correct: number;
    scorePercent: number;
    durationSec: number | null;
    reward?: SubmitReward | null; // 방금 제출한 경우에만 존재(새로고침 후엔 undefined)
  }): JSX.Element

  function ResultQuestionCard(props: {
    item: SessionQuestionItem;
    order: number;
    onSelfGraded: (sessionQuestionId: string, isCorrect: boolean) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: ResultBanner 작성**

`web/components/exam-session/ResultBanner.tsx`:

```tsx
"use client";
import { Sparkles } from "lucide-react";
import type { SubmitReward } from "@/lib/types";

function formatDuration(sec: number | null): string {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}

export function ResultBanner({
  total,
  correct,
  scorePercent,
  durationSec,
  reward,
}: {
  total: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
  reward?: SubmitReward | null;
}) {
  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            점수
          </span>
          <span className="font-mono text-2xl font-semibold text-foreground">
            {scorePercent}%
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            정답
          </span>
          <span className="font-mono text-lg font-medium text-foreground">
            {correct}/{total}
          </span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
            소요 시간
          </span>
          <span className="font-mono text-lg font-medium text-foreground">
            {formatDuration(durationSec)}
          </span>
        </div>
        {reward && reward.gained > 0 && (
          <div className="ml-auto flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-primary">
            <Sparkles size={14} />
            <span className="text-sm font-medium">+{reward.gained} XP</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ResultQuestionCard 작성**

`web/components/exam-session/ResultQuestionCard.tsx`:

```tsx
"use client";
import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSelfGrade } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import type { SessionQuestionItem } from "@/lib/types";

export function ResultQuestionCard({
  item,
  order,
  onSelfGraded,
}: {
  item: SessionQuestionItem;
  order: number;
  onSelfGraded: (sessionQuestionId: string, isCorrect: boolean) => void;
}) {
  const selfGrade = useSelfGrade();
  const isObjective = item.snapshot.questionType === "객관식";
  const choices = item.snapshot.choices ?? [];
  const selectedIds = new Set(item.answer?.selectedChoiceIds ?? []);
  const needsSelfGrade =
    !isObjective &&
    !item.snapshot.correctAnswerText &&
    item.answer != null &&
    (item.answer.isCorrect === null || item.answer.isCorrect === undefined);

  const isCorrect = item.answer?.isCorrect;
  const borderColor =
    isCorrect === true
      ? "border-correct"
      : isCorrect === false
        ? "border-wrong"
        : "border-border";

  const handleSelfGrade = (correct: boolean) => {
    selfGrade.mutate(
      { sessionQuestionId: item.sessionQuestionId, isCorrect: correct },
      { onSuccess: () => onSelfGraded(item.sessionQuestionId, correct) },
    );
  };

  return (
    <article className={`rounded-xl border ${borderColor} bg-card p-5`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {order}.
        </span>
        <Badge variant="secondary" className="text-[10px] font-medium">
          {item.snapshot.questionType}
        </Badge>
        {isCorrect === true && (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-correct">
            <Check size={13} /> 정답
          </span>
        )}
        {isCorrect === false && (
          <span className="ml-auto flex items-center gap-1 text-xs font-medium text-wrong">
            <X size={13} /> 오답
          </span>
        )}
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {extractPlainText(item.snapshot.stem)}
      </p>

      {isObjective ? (
        <div className="space-y-2">
          {choices.map((c, i) => {
            const picked = selectedIds.has(c.id);
            const correct = c.isCorrect === true;
            return (
              <div
                key={c.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                  correct
                    ? "border-correct bg-correct/10 text-foreground"
                    : picked
                      ? "border-wrong bg-wrong/10 text-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border border-current text-[10px] font-mono">
                  {i + 1}
                </span>
                <span>{extractPlainText(c.content)}</span>
                {correct && <Check size={13} className="ml-auto text-correct" />}
                {!correct && picked && <X size={13} className="ml-auto text-wrong" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            내 답: <span className="text-foreground">{item.answer?.answerText || "(응답 없음)"}</span>
          </p>
          {item.snapshot.correctAnswerText && (
            <p className="text-muted-foreground">
              정답: <span className="text-foreground">{item.snapshot.correctAnswerText}</span>
            </p>
          )}
        </div>
      )}

      {needsSelfGrade && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">서술형 자기채점:</span>
          <button
            type="button"
            onClick={() => handleSelfGrade(true)}
            disabled={selfGrade.isPending}
            className="flex items-center gap-1 rounded-md border border-correct px-2.5 py-1 text-xs text-correct transition-colors hover:bg-correct/10 disabled:opacity-50"
          >
            {selfGrade.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            맞음
          </button>
          <button
            type="button"
            onClick={() => handleSelfGrade(false)}
            disabled={selfGrade.isPending}
            className="flex items-center gap-1 rounded-md border border-wrong px-2.5 py-1 text-xs text-wrong transition-colors hover:bg-wrong/10 disabled:opacity-50"
          >
            {selfGrade.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            틀림
          </button>
        </div>
      )}

      {extractPlainText(item.snapshot.explanation) && (
        <p className="mt-4 rounded-lg bg-surface-raised px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {extractPlainText(item.snapshot.explanation)}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 3: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add web/components/exam-session/ResultBanner.tsx web/components/exam-session/ResultQuestionCard.tsx
git commit -m "feat: 결과 배너(ResultBanner) + 결과 카드(ResultQuestionCard, 채점색/해설/자기채점)"
```

---

### Task 12: 결과 모드 전체 조립 + 종단 검증

**Files:**
- Modify: `web/components/exam-session/SessionPage.tsx`

**Interfaces:**
- Consumes: Task 11의 `ResultBanner`, `ResultQuestionCard`; Task 3의 `useSubmitSession`(제출 응답을 결과 배너에 즉시 반영하기 위해 로컬 state로 보관).
- Produces: `SessionPage`가 `SUBMITTED` 상태에서 완전한 결과 레이아웃을 렌더링. 이걸로 SP-B+C 전체 완성.

- [ ] **Step 1: `SessionPage.tsx`에 결과 모드 상태 + 렌더 추가**

`web/components/exam-session/SessionPage.tsx`에서 두 군데를 수정한다.

**(a)** import 목록에 추가(파일 상단):

```tsx
import type { SubmitSessionResult } from "@/lib/types";
import { ResultBanner } from "./ResultBanner";
import { ResultQuestionCard } from "./ResultQuestionCard";
```

**(b)** 컴포넌트 본문 — `const [submitDialogOpen, setSubmitDialogOpen] = useState(false);` 바로 아래에 상태 추가:

```tsx
  const [justSubmitted, setJustSubmitted] = useState<SubmitSessionResult | null>(null);
```

**(c)** `handleSubmit` 함수를 아래로 교체(방금 제출 결과를 저장):

```tsx
  const handleSubmit = () => {
    submitSession.mutate(id, {
      onSuccess: (result) => {
        setSubmitDialogOpen(false);
        setJustSubmitted(result);
        toast.success("제출 완료! 채점 결과를 확인하세요.");
      },
      onError: () => {
        toast.error("제출에 실패했어요. 다시 시도해주세요.");
      },
    });
  };
```

**(d)** 파일 맨 아래 `if (session.status !== "IN_PROGRESS")` 블록(자리표시자)을 아래로 교체:

```tsx
  // SUBMITTED — 결과 모드
  const sortedQuestions = session.questions
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const total = session.questions.length;
  const correct = session.questions.filter((q) => q.answer?.isCorrect === true).length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <ResultBanner
        total={justSubmitted?.total ?? total}
        correct={justSubmitted?.correct ?? correct}
        scorePercent={justSubmitted?.scorePercent ?? scorePercent}
        durationSec={justSubmitted?.durationSec ?? session.durationSec}
        reward={justSubmitted?.reward}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sortedQuestions.map((q) => (
          <ResultQuestionCard
            key={q.sessionQuestionId}
            item={q}
            order={q.displayOrder}
            onSelfGraded={() => {
              /* useSelfGrade는 세션 쿼리를 자동 invalidate하지 않으므로
                 배너/카드 최신화를 위해 세션을 다시 조회한다. */
              queryClient.invalidateQueries({ queryKey: ["session", id] });
            }}
          />
        ))}
      </div>

      {drawingEnabled && <DrawingOverlay onClose={() => setDrawingEnabled(false)} />}
      {calculatorOpen && <Calculator onClose={() => setCalculatorOpen(false)} />}
    </div>
  );
```

**(e)** 위에서 `queryClient`를 썼으므로 `useQueryClient`를 import하고 컴포넌트 최상단에서 선언한다. import 블록 상단을:

```tsx
import { useMemo, useState } from "react";
```

에서

```tsx
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
```

로, 그리고 컴포넌트 본문 첫 줄(`const { data: session, isLoading, isError } = useSession(id);` 바로 위)에 추가:

```tsx
  const queryClient = useQueryClient();
```

**(f)** 결과 모드에서도 화면필기/계산기 버튼이 필요하다(스펙: "하단바는 [화면필기]/[계산기]만"). `SolveBottomBar`는 제출 버튼을 포함하므로 결과 모드에는 부적합 — 이 태스크 범위에서는 결과 모드에 별도의 간이 플로팅 토글 버튼 2개만 우측 하단에 둔다(새 컴포넌트를 만들지 않고 인라인으로 충분히 작다). 위 (d)의 return 블록에서 `{drawingEnabled && ...}` 줄 바로 위에 추가:

```tsx
      <div className="fixed bottom-6 right-6 z-40 flex gap-2">
        <button
          type="button"
          onClick={() => setDrawingEnabled((v) => !v)}
          aria-pressed={drawingEnabled}
          className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors ${
            drawingEnabled
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
          title="화면필기"
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={() => setCalculatorOpen((v) => !v)}
          aria-pressed={calculatorOpen}
          className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors ${
            calculatorOpen
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
          title="계산기"
        >
          🧮
        </button>
      </div>
```

- [ ] **Step 2: 타입체크**

```bash
npx tsc --noEmit -p tsconfig.json
```
Expected: 에러 없음. (`justSubmitted`가 `null`일 때 `?? total` 등 폴백이 정확한 타입인지, `ResultBanner`의 `reward` prop이 `SubmitReward | null | undefined`를 받는지 확인 — `SubmitReward | null` 타입에 `undefined`도 허용하려면 `reward?:`로 optional 처리되어 있음, Task 11에서 이미 `reward?: SubmitReward | null` 시그니처로 작성함)

- [ ] **Step 3: 종단 검증 — 풀기부터 결과까지 전체 플로우**

```bash
npm run dev -- -p 3011 &
sleep 4
```

Task 10 Step 3와 동일하게 세션을 하나 생성해 브라우저로 열고:
1. 몇 문항 풀고 제출 → 결과 모드로 자동 전환되는지(배너에 점수·정답수·소요시간·XP 표시)
2. 문항 카드들이 정답 초록/오답 빨강 테두리로 구분되는지
3. 서술형 문항이 있으면(시드 데이터의 `seed-q-subj-1`류) [맞음]/[틀림] 버튼으로 자기채점 → 배너 정답수가 즉시 갱신되는지
4. 결과 모드에서도 우측 하단 ✏️/🧮 버튼으로 필기·계산기 토글되는지
5. 페이지 새로고침 후에도 결과가 그대로 보이는지(서버 재조회 기준, `justSubmitted`는 사라져도 `session.questions` 기반 배너는 유지)

```bash
kill %1
```

- [ ] **Step 4: 최종 커밋**

```bash
git add web/components/exam-session/SessionPage.tsx
git commit -m "feat: 결과 모드 전체 조립(배너+채점카드+자기채점+필기/계산기) — 세션 페이지 완성"
```

---

## Self-Review 결과

**스펙 커버리지 확인** (`2026-07-11-exam-session-page-design.md` 대비):
- 모드 분기(status) → Task 4·10·12
- 문항 2열 그리드 + OMR 접기 → Task 6·10
- autosave(객관식 즉시/주관식 debounce) → Task 5
- 하단바(타이머/진행/저장/필기/계산기/제출) → Task 7·10
- 결과 배너 + 채점색/해설/자기채점 → Task 11·12
- 화면필기(휘발) → Task 8(조건부 마운트로 단순화, 근거 명시)
- 계산기(mathjs, 동적 로드) → Task 1·9·10
- 힌트 → Task 5(백엔드가 힌트 존재 여부를 사전 노출하지 않는 제약을 반영해 클릭 시 404 처리로 설계)
- `/questions/[id]?reveal=1` 링크 → **의도적으로 이번 범위에서 제외**(Global Constraints에 근거 명시, SP-A 완료 후 후속 태스크)
- 세션 생성 진입(SP-E) → 명시적으로 범위 밖(스펙의 비목표와 일치)

**플레이스홀더 스캔**: "TBD"/"나중에" 패턴 없음. 모든 스텝에 완전한 코드 포함.

**타입 일관성**: `SessionQuestionItem`(Task 1)이 Task 5·6·11·12에서 동일한 필드명(`sessionQuestionId`/`displayOrder`/`snapshot`/`answer`)으로 일관되게 쓰임. `useSubmitAnswer(sessionQuestionId)`(Task 3, 커링된 훅)와 Task 5의 호출부 시그니처 일치. `SubmitSessionResult`/`SubmitReward`(Task 1)가 Task 11·12에서 동일 필드로 소비됨.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-12-exam-session-page.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
