# Q-Idea 프론트엔드 1주 E2E 데모 Implementation Plan

> ⚠️ **부분 폐기 (2026-07-09)** — `specs/2026-07-09-qidea-frontend-redesign.md`가 우선한다.
> **Task 8(VizRenderer + KaTeX)과 Task 9(AI 시각화 Route Handler)는 실행하지 말 것.** LLM 생성 시각화와 KaTeX는 제품에서 제외됐다.
> Task 6의 `UnitTreeSelect`는 `SubjectSelect`(대분류→세부과목 2단계)로 대체한다 — `units` 테이블은 존재하지 않는다.
> Task 0~5, 7은 유효하되 화면 구성은 새 스펙을 따른다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미 배포된 NestJS 백엔드 위에, Next.js 프론트엔드로 출제자→응시자 골든패스 E2E 데모 + 수험생 생태계 기능(리뷰·댓글·메모·필기·오답노트·AI 시각화)을 1주 안에 완성한다.

**Architecture:** 기존 NestJS API(Railway) 재사용. Next.js(App Router)가 orval 자동생성 타입 클라이언트로 REST 호출. AI 시각화만 Next Route Handler에서 Gemini 서버사이드 호출로 Vega-Lite/SVG 스펙을 받아 안전 렌더. 백엔드는 CORS·시드·읽기 엔드포인트 2개만 최소 추가.

**Tech Stack:** Next.js 14(App Router), TypeScript strict, Tailwind CSS 3, shadcn/ui, TanStack Query v5, Zustand v4, orval, KaTeX, react-vega + vega-lite, DOMPurify, @tiptap/react, perfect-freehand, zod, @google/generative-ai. 백엔드: NestJS 10 + Prisma(MySQL).

## Global Constraints

- TypeScript strict, `any` 금지(백엔드 기존 국소 캐스팅은 예외). 모든 데이터 구조에 타입/인터페이스 정의.
- 프론트 디렉터리 규약: `app/`(페이지·레이아웃·Route Handler), `components/`, `hooks/`, `lib/`, `types/`.
- 스타일: Tailwind + shadcn/ui, `cn`(clsx+tailwind-merge). RSC 기본, 훅/브라우저 API 쓰는 곳만 `"use client"`.
- 백엔드 API 프리픽스 `/api`. 인증: 전역 `JwtAuthGuard`, `@Public()`만 예외. 클라이언트는 `Authorization: Bearer <accessToken>` 첨부.
- 프론트 앱 위치: `web/` (백엔드 repo 하위 별도 Next 앱). 프론트 패키지매니저: **npm**(pnpm 미가용).
- **배포 타깃: Cloudflare Pages/Workers**(Vercel 아님) via `@cloudflare/next-on-pages`. Route Handler는 `export const runtime = 'edge'` 필수. 백엔드 NestJS는 Node 호스트(Railway), DB=TiDB(MySQL 호환), Redis=Aiven.
- 런타임 검증 인프라 부재 시(로컬 DB/Redis 없음): 유닛테스트(jest/vitest)로 검증 가능한 태스크 우선, 백엔드 런타임 의존 태스크는 TiDB/Aiven + 백엔드 URL 확보 후 검증.
- 시각화 렌더는 **임의 JS 실행 금지** — Vega-Lite 스펙(react-vega) 또는 DOMPurify sanitize된 SVG만.
- 필기 stroke 스키마(정규화 좌표 0~1)는 `memos.canvas`와 `exam_session_answers.annotations` 양쪽 공용.
- 커밋 자주. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**백엔드 확정 계약 (읽어서 확인함):**
- `POST /api/auth/login` (`@Public`) body `{ email, nickname?, roles?: ('CREATOR'|'CONSUMER'|'ADMIN')[] }` → `{ accessToken, user: { id, email, nickname, roles } }`. find-or-create.
- `GET /api/auth/me` → `{ id, email, roles }`.
- `GET /api/subjects`, `GET /api/subjects/:subjectId/units`(트리), `GET /api/tags?category=`.
- `GET /api/questions`(QueryQuestionDto: `unitId,status,questionType,difficulty(1~5),q,tagIds[],page,pageSize`), `GET /api/questions/:id`, `POST /api/questions`, `PATCH /api/questions/:id`, `POST /api/questions/:id/publish`, `DELETE /api/questions/:id`.
- `POST /api/ai-generations`(202) body(CreateGenerationDto), `GET /api/ai-generations/:id` → `{ id, status, model, createdAt, passageIds, questions:[{id,questionType,status}] }`.
- `POST /api/exam-sessions` body `{ subjectId, questionCount(1~100), filter: { unitIds?, tagIds?, questionTypes?, minDifficulty?, maxDifficulty? } }` → `{ id, questionCount, status }`.
- `GET /api/exam-sessions/:id` → `{ id, subject, status, startedAt, submittedAt, durationSec, questions:[{ sessionQuestionId, questionId, displayOrder, snapshot, answer }] }` (진행 중 정답 마스킹).
- `PUT /api/exam-sessions/questions/:sessionQuestionId/answer` body `{ selectedChoiceIds?, blankAnswers?, answerText?, annotations?, timeSpentSec? }` → `{ sessionQuestionId, saved:true }`.
- `POST /api/exam-sessions/:id/submit` → `{ id, status, total, answered, correct, scorePercent, durationSec }`.
- `GET/PUT /api/questions/:questionId/reviews`, `GET/POST /api/questions/:questionId/comments`, `POST/DELETE /api/comments/:id/pin`, `GET/PUT/DELETE /api/questions/:questionId/memo`, `GET/POST /api/questions/:id/variants`.
- 신규 추가(Task 1): `GET /api/me/exam-sessions`, `GET /api/me/wrong-notes`.

---

## File Structure

**백엔드 (신규/수정):**
- Modify `src/main.ts` — CORS 활성화.
- Create `src/modules/me/me.module.ts`, `me.controller.ts`, `me.service.ts`, `me.service.spec.ts`.
- Modify `src/app.module.ts` — MeModule 등록.
- Create `prisma/seed.ts` — 데모 유저·과목·단원·문항 시드.
- Modify `package.json` — `db:seed` 스크립트.

**프론트 (`web/`):**
- `web/lib/` — `api-client.ts`(orval mutator), `auth.ts`(토큰 스토어), `cn.ts`, `query-client.ts`.
- `web/hooks/generated/` — orval 산출물.
- `web/types/` — `viz.ts`(시각화 스펙 타입), `canvas.ts`(stroke 스키마).
- `web/components/` — `ui/*`(shadcn), `editor/QuestionViewer.tsx`, `viz/VizRenderer.tsx`, `viz/VizRenderer.test.tsx`, `canvas/SketchCanvas.tsx`, `canvas/normalize.ts`, `canvas/normalize.test.ts`, `exam/*`, `community/*`.
- `web/app/` — 화면별 라우트(스펙 §3.1).
- `web/app/api/ai/visualize/route.ts` — 시각화 Route Handler.

---

## Task 0: 백엔드 CORS + 데모 시드 + 빌드 검증

**Files:**
- Modify: `src/main.ts`
- Create: `prisma/seed.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: 시드된 데모 유저 2명 — creator@demo.io(CREATOR,CONSUMER), consumer@demo.io(CONSUMER). PUBLISHED 문항 최소 5개(단원·유형 다양). CORS가 임의 origin 허용(데모).

- [ ] **Step 1: CORS 활성화**

`src/main.ts`의 `app.setGlobalPrefix('api');` 바로 위에 추가:

```typescript
  app.enableCors({
    origin: true, // 데모: 모든 origin 허용. 운영 시 Vercel 도메인으로 좁힐 것.
    credentials: true,
  });
```

- [ ] **Step 2: 시드 스크립트 작성**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient, UserRoleType, QuestionType, QuestionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 데모 유저
  const creator = await prisma.user.upsert({
    where: { email: 'creator@demo.io' },
    update: {},
    create: {
      email: 'creator@demo.io',
      nickname: '데모출제자',
      roles: { create: [{ role: UserRoleType.CREATOR }, { role: UserRoleType.CONSUMER }] },
    },
  });
  await prisma.user.upsert({
    where: { email: 'consumer@demo.io' },
    update: {},
    create: {
      email: 'consumer@demo.io',
      nickname: '데모응시자',
      roles: { create: [{ role: UserRoleType.CONSUMER }] },
    },
  });

  // 과목 + 단원 트리
  const subject = await prisma.subject.upsert({
    where: { id: 'seed-subject-math' },
    update: {},
    create: { id: 'seed-subject-math', name: '수학', examCategory: '수능', sortOrder: 1 },
  });
  const unit = await prisma.unit.upsert({
    where: { id: 'seed-unit-func' },
    update: {},
    create: { id: 'seed-unit-func', subjectId: subject.id, name: '함수', depth: 0, isLeaf: true },
  });
  const unit2 = await prisma.unit.upsert({
    where: { id: 'seed-unit-geo' },
    update: {},
    create: { id: 'seed-unit-geo', subjectId: subject.id, name: '기하', depth: 0, isLeaf: true },
  });

  // PUBLISHED 문항 5개 (ProseMirror JSON 최소형)
  const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const choices = () => [
    { id: 'c1', content: doc('보기 1'), isCorrect: true },
    { id: 'c2', content: doc('보기 2'), isCorrect: false },
    { id: 'c3', content: doc('보기 3'), isCorrect: false },
    { id: 'c4', content: doc('보기 4'), isCorrect: false },
  ];
  for (let i = 0; i < 5; i++) {
    const id = `seed-q-${i}`;
    await prisma.question.upsert({
      where: { id },
      update: {},
      create: {
        id,
        creatorId: creator.id,
        primaryUnitId: i % 2 === 0 ? unit.id : unit2.id,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: doc(`데모 문항 ${i + 1}: 다음 중 옳은 것은?`),
        choices: choices(),
        explanation: doc('정답은 1번입니다.'),
        difficulty: (i % 5) + 1,
        status: QuestionStatus.PUBLISHED,
        publishedAt: new Date(),
        searchText: `데모 문항 ${i + 1}`,
      },
    });
  }
  console.log('seed done');
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: seed 스크립트 등록**

`package.json`의 `scripts`에 추가:

```json
    "db:seed": "ts-node prisma/seed.ts",
```

`prisma` 키(없으면 최상위에) 추가:

```json
  "prisma": { "seed": "ts-node prisma/seed.ts" }
```

devDependency 필요 시: `npm i -D ts-node`.

- [ ] **Step 4: 빌드 검증**

Run: `npm install && npm run build`
Expected: `dist/` 생성, 컴파일 에러 0. (README가 tsc 미검증 명시 → 여기서 최초 확인)

- [ ] **Step 5: 시드 실행 검증**

Run: `npm run prisma:generate && npm run db:seed`
Expected: 콘솔 `seed done`. DB에 creator@demo.io/consumer@demo.io, 수학 과목, 함수·기하 단원, PUBLISHED 문항 5개.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts prisma/seed.ts package.json
git commit -m "feat(be): CORS 활성화 + 데모 시드 스크립트"
```

---

## Task 1: 백엔드 `/me` 읽기 엔드포인트 (풀이기록 + 오답 집계)

**Files:**
- Create: `src/modules/me/me.service.ts`, `me.controller.ts`, `me.module.ts`, `me.service.spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Produces:
  - `GET /api/me/exam-sessions` → `MySessionSummary[]` = `{ id, subjectName, status, submittedAt, total, correct, scorePercent, durationSec }[]` (SUBMITTED만, 최신순).
  - `GET /api/me/wrong-notes` → `{ byUnit: WrongStat[], byType: WrongStat[], wrongQuestions: WrongQuestion[] }`. `WrongStat = { key, label, total, wrong, wrongRatio }`. `WrongQuestion = { questionId, unitName, questionType, sessionId }`.

- [ ] **Step 1: 실패 테스트 작성**

Create `src/modules/me/me.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { MeService } from './me.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('MeService.wrongNotes', () => {
  it('오답을 단원·유형별로 집계하고 비율을 계산한다', async () => {
    const prisma = {
      examSessionAnswer: {
        findMany: jest.fn().mockResolvedValue([
          { isCorrect: false, examSessionQuestion: { question: { primaryUnitId: 'u1', questionType: 'SINGLE_CHOICE', unit: { name: '함수' } }, examSessionId: 's1', questionId: 'q1' } },
          { isCorrect: true,  examSessionQuestion: { question: { primaryUnitId: 'u1', questionType: 'SINGLE_CHOICE', unit: { name: '함수' } }, examSessionId: 's1', questionId: 'q2' } },
        ]),
      },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.wrongNotes('user-1');

    expect(result.byUnit).toEqual([
      { key: 'u1', label: '함수', total: 2, wrong: 1, wrongRatio: 0.5 },
    ]);
    expect(result.byType[0]).toMatchObject({ key: 'SINGLE_CHOICE', wrong: 1, total: 2 });
    expect(result.wrongQuestions).toEqual([
      { questionId: 'q1', unitName: '함수', questionType: 'SINGLE_CHOICE', sessionId: 's1' },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx jest src/modules/me/me.service.spec.ts`
Expected: FAIL — `Cannot find module './me.service'`.

- [ ] **Step 3: 서비스 구현**

Create `src/modules/me/me.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface WrongStat { key: string; label: string; total: number; wrong: number; wrongRatio: number; }
export interface WrongQuestion { questionId: string; unitName: string; questionType: string; sessionId: string; }

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async examSessions(userId: string) {
    const sessions = await this.prisma.examSession.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      include: {
        subject: { select: { name: true } },
        sessionQuestions: { include: { answer: { select: { isCorrect: true } } } },
      },
    });
    return sessions.map((s) => {
      const total = s.sessionQuestions.length;
      const correct = s.sessionQuestions.filter((q) => q.answer?.isCorrect === true).length;
      return {
        id: s.id,
        subjectName: s.subject.name,
        status: s.status,
        submittedAt: s.submittedAt,
        total,
        correct,
        scorePercent: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
        durationSec: s.durationSec,
      };
    });
  }

  async wrongNotes(userId: string) {
    const answers = await this.prisma.examSessionAnswer.findMany({
      where: { examSessionQuestion: { examSession: { userId, status: 'SUBMITTED' } } },
      include: {
        examSessionQuestion: {
          select: {
            examSessionId: true,
            questionId: true,
            question: {
              select: { primaryUnitId: true, questionType: true, unit: { select: { name: true } } },
            },
          },
        },
      },
    });

    const unitMap = new Map<string, WrongStat>();
    const typeMap = new Map<string, WrongStat>();
    const wrongQuestions: WrongQuestion[] = [];

    for (const a of answers) {
      const q = a.examSessionQuestion.question;
      const isWrong = a.isCorrect === false;
      const bump = (map: Map<string, WrongStat>, key: string, label: string) => {
        const cur = map.get(key) ?? { key, label, total: 0, wrong: 0, wrongRatio: 0 };
        cur.total += 1;
        if (isWrong) cur.wrong += 1;
        cur.wrongRatio = Math.round((cur.wrong / cur.total) * 100) / 100;
        map.set(key, cur);
      };
      bump(unitMap, q.primaryUnitId, q.unit.name);
      bump(typeMap, q.questionType, q.questionType);
      if (isWrong) {
        wrongQuestions.push({
          questionId: a.examSessionQuestion.questionId,
          unitName: q.unit.name,
          questionType: q.questionType,
          sessionId: a.examSessionQuestion.examSessionId,
        });
      }
    }

    return {
      byUnit: [...unitMap.values()],
      byType: [...typeMap.values()],
      wrongQuestions,
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest src/modules/me/me.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: 컨트롤러 + 모듈 작성**

Create `src/modules/me/me.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get('exam-sessions')
  @ApiOperation({ summary: '내 제출 세션(풀이기록)' })
  sessions(@CurrentUser() user: CurrentUserPayload) {
    return this.service.examSessions(user.id);
  }

  @Get('wrong-notes')
  @ApiOperation({ summary: '내 오답노트(단원·유형별 집계 + 오답 문항)' })
  wrongNotes(@CurrentUser() user: CurrentUserPayload) {
    return this.service.wrongNotes(user.id);
  }
}
```

Create `src/modules/me/me.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({ controllers: [MeController], providers: [MeService] })
export class MeModule {}
```

주의: `me/memos`는 MemosModule 소유. 여기 경로는 `me/exam-sessions`, `me/wrong-notes`뿐이라 충돌 없음.

- [ ] **Step 6: app.module 등록**

`src/app.module.ts` imports 배열에 `MeModule` 추가 + import 문 추가:

```typescript
import { MeModule } from './modules/me/me.module';
```

- [ ] **Step 7: 빌드 + 통합 확인**

Run: `npm run build`
Expected: 컴파일 성공. `GET /api/me/wrong-notes`가 Swagger `/api/docs`에 노출.

- [ ] **Step 8: Commit**

```bash
git add src/modules/me src/app.module.ts
git commit -m "feat(be): /me/exam-sessions, /me/wrong-notes 읽기 엔드포인트"
```

---

## Task 2: Next.js 앱 스캐폴딩 + Tailwind + shadcn + Query Provider

**Files:**
- Create: `web/` (Next 앱 전체)
- Create: `web/lib/cn.ts`, `web/lib/query-client.ts`, `web/app/providers.tsx`, `web/.env.local`

**Interfaces:**
- Produces: `cn(...)` 헬퍼. `QueryProvider`로 감싼 루트 레이아웃. `NEXT_PUBLIC_API_BASE`(백엔드 `/api` 베이스).

- [ ] **Step 1: Next 앱 생성**

Run:
```bash
cd web 2>/dev/null || npx create-next-app@14 web --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm
cd web && npm i @tanstack/react-query@5 zustand@4 clsx tailwind-merge zod
npm i katex react-vega vega vega-lite dompurify @tiptap/react @tiptap/starter-kit @tiptap/pm perfect-freehand @google/generative-ai
npm i -D @types/dompurify orval
# Cloudflare Pages 어댑터 + wrangler (배포 타깃)
npm i -D @cloudflare/next-on-pages wrangler
npx @cloudflare/next-on-pages@1 --help >/dev/null 2>&1 || true
```

- [ ] **Step 2: cn 헬퍼**

Create `web/lib/cn.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 3: shadcn 초기화 + 기본 컴포넌트**

Run:
```bash
cd web && npx shadcn@latest init -d
npx shadcn@latest add button input card dialog select textarea badge tabs skeleton sonner
```

- [ ] **Step 4: Query Provider**

Create `web/lib/query-client.ts`:

```typescript
import { QueryClient } from '@tanstack/react-query';
export const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
```

Create `web/app/providers.tsx`:

```tsx
'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { makeQueryClient } from '@/lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

`web/app/layout.tsx`의 `<body>` 자식을 `<Providers>{children}</Providers>`로 감싼다.

- [ ] **Step 5: 환경변수**

Create `web/.env.local`:

```
NEXT_PUBLIC_API_BASE=https://<railway-backend-host>/api
GEMINI_API_KEY=<gemini-key>
```

- [ ] **Step 6: 실행 확인**

Run: `cd web && npm run dev`
Expected: `localhost:3000` 기본 페이지 정상 렌더, 콘솔 에러 없음.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(fe): Next.js 스캐폴딩 + Tailwind/shadcn/react-query"
```

---

## Task 3: orval 타입 클라이언트 자동생성 + API mutator

**Files:**
- Create: `web/lib/api-client.ts`, `web/lib/auth.ts`, `web/orval.config.ts`
- Create: `web/hooks/generated/` (산출물)

**Interfaces:**
- Consumes: 백엔드 Swagger JSON `${NEXT_PUBLIC_API_BASE}/docs-json` (NestJS는 `api/docs-json`으로 노출).
- Produces: orval 생성 React Query 훅(예: `useAuthControllerLogin`, `useQuestionsControllerList`, ...). `getToken()/setToken()/clearToken()`. `customInstance`(mutator)가 baseURL·Bearer 자동 첨부.

- [ ] **Step 1: 토큰 스토어**

Create `web/lib/auth.ts`:

```typescript
const KEY = 'qidea_token';
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(KEY);
}
export function setToken(t: string) { window.localStorage.setItem(KEY, t); }
export function clearToken() { window.localStorage.removeItem(KEY); }
```

- [ ] **Step 2: mutator (fetch 기반)**

Create `web/lib/api-client.ts`:

```typescript
import { getToken } from '@/lib/auth';

const BASE = process.env.NEXT_PUBLIC_API_BASE!;

export const customInstance = async <T>(config: {
  url: string; method: string; params?: Record<string, unknown>; data?: unknown; headers?: Record<string, string>;
}): Promise<T> => {
  const qs = config.params
    ? '?' + new URLSearchParams(
        Object.entries(config.params).filter(([, v]) => v != null).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((x) => [k, String(x)]) : [[k, String(v)]],
        ) as [string, string][],
      ).toString()
    : '';
  const token = getToken();
  const res = await fetch(`${BASE}${config.url}${qs}`, {
    method: config.method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...config.headers,
    },
    body: config.data != null ? JSON.stringify(config.data) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

export default customInstance;
```

- [ ] **Step 3: orval 설정**

Create `web/orval.config.ts`:

```typescript
import { defineConfig } from 'orval';
export default defineConfig({
  qidea: {
    input: { target: `${process.env.NEXT_PUBLIC_API_BASE}/docs-json` },
    output: {
      mode: 'tags-split',
      target: 'hooks/generated',
      client: 'react-query',
      override: { mutator: { path: 'lib/api-client.ts', name: 'customInstance' } },
    },
  },
});
```

- [ ] **Step 4: 생성 실행**

Run: `cd web && NEXT_PUBLIC_API_BASE=https://<railway-host>/api npx orval --config orval.config.ts`
Expected: `web/hooks/generated/` 아래 태그별 훅·모델 생성. TypeScript 에러 0.

Fallback: Swagger JSON 원격 접근 불가 시 로컬 백엔드 실행(`npm run start:dev`) 후 `http://localhost:3000/api/docs-json` 사용. 그래도 안 되면 `npx orval` 대신 백엔드에서 `curl .../docs-json > web/openapi.json` 후 `input.target: './openapi.json'`.

- [ ] **Step 5: 타입 확인**

Run: `cd web && npx tsc --noEmit`
Expected: 생성 훅 타입 컴파일 성공.

- [ ] **Step 6: Commit**

```bash
git add web/lib web/orval.config.ts web/hooks/generated
git commit -m "feat(fe): orval 타입 클라이언트 + fetch mutator"
```

---

## Task 4: 인증 — 로그인/회원가입 화면 + 라우트 가드

**Files:**
- Create: `web/app/(auth)/login/page.tsx`, `web/app/(auth)/signup/page.tsx`
- Create: `web/hooks/useSession.ts`, `web/components/auth/AuthGuard.tsx`

**Interfaces:**
- Consumes: 생성 훅 `useAuthControllerLogin`(또는 mutator 직접), `setToken`.
- Produces: `useSession()` → `{ user, isAuthed, logout }`. `<AuthGuard>` 미인증 시 `/login` 리다이렉트.

- [ ] **Step 1: 세션 훅**

Create `web/hooks/useSession.ts`:

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { customInstance } from '@/lib/api-client';
import { getToken, clearToken } from '@/lib/auth';

export interface SessionUser { id: string; email: string; roles: string[]; }

export function useSession() {
  const enabled = !!getToken();
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => customInstance<SessionUser>({ url: '/auth/me', method: 'get' }),
    enabled,
  });
  return {
    user: data ?? null,
    isAuthed: enabled && !!data,
    logout: () => { clearToken(); window.location.href = '/login'; },
  };
}
```

- [ ] **Step 2: 로그인 화면 (Figma 참조)**

Create `web/app/(auth)/login/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { customInstance } from '@/lib/api-client';
import { setToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(withEmail: string, roles?: string[]) {
    setLoading(true);
    try {
      const res = await customInstance<{ accessToken: string }>({
        url: '/auth/login', method: 'post', data: { email: withEmail, roles },
      });
      setToken(res.accessToken);
      router.push('/questions');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Q-Idea 로그인</h1>
        <Input placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button className="w-full" disabled={loading || !email} onClick={() => login(email)}>로그인</Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => login('creator@demo.io', ['CREATOR', 'CONSUMER'])}>데모 출제자</Button>
          <Button variant="outline" className="flex-1" onClick={() => login('consumer@demo.io', ['CONSUMER'])}>데모 응시자</Button>
        </div>
        <a href="/signup" className="text-sm text-muted-foreground underline">회원가입</a>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: 회원가입 화면**

Create `web/app/(auth)/signup/page.tsx` — 로그인과 동일 `POST /auth/login`에 `nickname` 추가 전달(프로비저닝이 find-or-create이므로 신규면 생성). email + nickname 입력 → `login` 호출 후 `/questions` 이동. (Step 2 로직 재사용, `data: { email, nickname, roles: ['CONSUMER'] }`.)

- [ ] **Step 4: AuthGuard**

Create `web/components/auth/AuthGuard.tsx`:

```tsx
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => { if (!getToken()) router.replace('/login'); }, [router]);
  return <>{children}</>;
}
```

- [ ] **Step 5: 수동 검증**

Run: `cd web && npm run dev` → `/login`에서 "데모 출제자" 클릭.
Expected: 토큰 저장, `/questions`로 이동, `useSession().user`에 creator@demo.io 로딩.

- [ ] **Step 6: Commit**

```bash
git add web/app web/hooks web/components/auth
git commit -m "feat(fe): 로그인/회원가입 + 세션 훅 + AuthGuard"
```

---

## Task 5: 문제 검색결과 조회 화면 (Figma 참조)

**Files:**
- Create: `web/app/questions/page.tsx`, `web/components/questions/QuestionCard.tsx`, `web/components/questions/QuestionFilters.tsx`

**Interfaces:**
- Consumes: `GET /api/questions`(QueryQuestionDto), `useSession`, `AuthGuard`.
- Produces: 필터 상태 → 쿼리 파라미터 매핑. 카드 클릭 시 `/questions/[id]`.

- [ ] **Step 1: 필터 컴포넌트**

Create `web/components/questions/QuestionFilters.tsx` — `q`(키워드 Input), `questionType`(Select), `difficulty`(Select 1~5). 값 변경 시 `onChange(filters)` 콜백. 상태는 부모 보유.

- [ ] **Step 2: 카드 컴포넌트**

Create `web/components/questions/QuestionCard.tsx`:

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function QuestionCard({ q }: { q: { id: string; stem: unknown; questionType: string; difficulty: number; totalSolvedCount?: number; correctSolvedCount?: number } }) {
  const rate = q.totalSolvedCount ? Math.round((100 * (q.correctSolvedCount ?? 0)) / q.totalSolvedCount) : null;
  const preview = extractPlainText(q.stem);
  return (
    <Link href={`/questions/${q.id}`}>
      <Card className="p-4 hover:shadow-md transition space-y-2">
        <div className="flex gap-2">
          <Badge>{q.questionType}</Badge>
          <Badge variant="outline">난이도 {q.difficulty}</Badge>
          {rate != null && <Badge variant="secondary">정답률 {rate}%</Badge>}
        </div>
        <p className="line-clamp-2 text-sm">{preview}</p>
      </Card>
    </Link>
  );
}

function extractPlainText(doc: unknown): string {
  // ProseMirror JSON에서 text 노드만 평문 추출
  const out: string[] = [];
  const walk = (n: any) => { if (n?.text) out.push(n.text); n?.content?.forEach(walk); };
  walk(doc);
  return out.join(' ');
}
```

- [ ] **Step 2b: 평문 추출 유틸 공용화**

`extractPlainText`를 `web/lib/prosemirror.ts`로 분리해 export하고 QuestionCard·QuestionViewer가 공유(DRY).

```typescript
export function extractPlainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: any) => { if (n?.text) out.push(n.text); n?.content?.forEach(walk); };
  walk(doc);
  return out.join(' ');
}
```

- [ ] **Step 3: 리스트 페이지**

Create `web/app/questions/page.tsx` — `'use client'`. `useState` 필터 → `useQuestionsControllerList(params)`(orval 훅) 또는 `customInstance` 호출. `AuthGuard`로 감싸고 카드 그리드 렌더. 로딩 시 shadcn `Skeleton`. 상단 "AI로 문제 만들기" 버튼 → `/create`.

- [ ] **Step 4: 수동 검증**

Expected: 시드 문항 5개가 카드로 표시, 유형/난이도/키워드 필터가 목록을 좁힘, 카드 클릭 시 상세로 이동(상세는 Task 14).

- [ ] **Step 5: Commit**

```bash
git add web/app/questions web/components/questions web/lib/prosemirror.ts
git commit -m "feat(fe): 문제 검색결과 조회 화면 + 필터"
```

---

## Task 6: AI 생성 시작 폼 + 단원 트리 + 폴링

**Files:**
- Create: `web/app/create/page.tsx`, `web/components/catalog/UnitTreeSelect.tsx`, `web/hooks/useGenerationPolling.ts`

**Interfaces:**
- Consumes: `GET /api/subjects`, `GET /api/subjects/:id/units`, `POST /api/ai-generations`, `GET /api/ai-generations/:id`.
- Produces: `useGenerationPolling(genId)` → `{ status, questions, passageIds }`, COMPLETED까지 3초 간격 폴링.

- [ ] **Step 1: 단원 트리 선택**

Create `web/components/catalog/UnitTreeSelect.tsx` — subject 선택 후 `unitTree` 조회, 자기참조 트리를 들여쓰기 렌더. leaf 선택 시 `onSelect(unitId, subjectId)`.

- [ ] **Step 2: 폴링 훅**

Create `web/hooks/useGenerationPolling.ts`:

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { customInstance } from '@/lib/api-client';

interface GenResult { id: string; status: 'PENDING' | 'COMPLETED' | 'FAILED'; passageIds: string[]; questions: { id: string; questionType: string; status: string }[]; }

export function useGenerationPolling(genId: string | null) {
  return useQuery({
    queryKey: ['generation', genId],
    queryFn: () => customInstance<GenResult>({ url: `/ai-generations/${genId}`, method: 'get' }),
    enabled: !!genId,
    refetchInterval: (q) => (q.state.data?.status === 'COMPLETED' || q.state.data?.status === 'FAILED' ? false : 3000),
  });
}
```

- [ ] **Step 3: 생성 폼**

Create `web/app/create/page.tsx` — 폼: 단원(UnitTreeSelect), 프롬프트(Textarea), 난이도(1~5), 문항수, 지문포함(체크), 유형(Select). 제출 시 `POST /ai-generations` → 반환 `id`로 폴링 시작. COMPLETED 시 `router.push(/studio/${genId})`. 진행 중 상태 배지·스피너.

- [ ] **Step 4: 수동 검증**

Expected: 단원 선택·폼 제출 → 202 응답 → 폴링이 PENDING→COMPLETED 전이 감지 → 스튜디오로 이동. (백엔드 Gemini 키/워커 필요. 워커 미가동이면 PENDING 고정 — 그 경우 백엔드 프로세서 가동 확인.)

- [ ] **Step 5: Commit**

```bash
git add web/app/create web/components/catalog web/hooks/useGenerationPolling.ts
git commit -m "feat(fe): AI 생성 폼 + 단원 트리 + 폴링"
```

---

## Task 7: 출제 스튜디오 — 렌더 + 경량 인라인 편집 + 발행 + 변형 셸

**Files:**
- Create: `web/app/studio/[genId]/page.tsx`, `web/components/editor/QuestionViewer.tsx`, `web/components/editor/InlineEditableText.tsx`, `web/components/studio/VariantShell.tsx`

**Interfaces:**
- Consumes: `GET /api/ai-generations/:id`(문항 ID들), `GET /api/questions/:id`, `PATCH /api/questions/:id`, `POST /api/questions/:id/publish`, `GET/POST /api/questions/:id/variants`.
- Produces: `QuestionViewer`(ProseMirror JSON + 시각화 + 수식 읽기 렌더). `InlineEditableText`(blur 시 PATCH). Task 8의 `VizRenderer`를 소비.

- [ ] **Step 1: QuestionViewer (읽기)**

Create `web/components/editor/QuestionViewer.tsx` — props `{ stem, choices, explanation, visual? }`. ProseMirror JSON을 문단 렌더(`extractPlainText` 또는 read-only Tiptap). `visual` 있으면 `<VizRenderer spec={visual} />`(Task 8). KaTeX는 텍스트 내 `$...$` 구간 렌더.

- [ ] **Step 2: InlineEditableText**

Create `web/components/editor/InlineEditableText.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function InlineEditableText({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      className="outline-none focus:ring-1 rounded px-1"
      onBlur={(e) => { const v = e.currentTarget.textContent ?? ''; setText(v); if (v !== value) onSave(v); }}
    >{text}</div>
  );
}
```

편집 저장 시 발문 평문을 ProseMirror doc으로 감싸 `PATCH /questions/:id`에 `{ stem: doc(v) }` 전송(`doc` 헬퍼는 `lib/prosemirror.ts`에 추가).

- [ ] **Step 3: 변형 셸**

Create `web/components/studio/VariantShell.tsx` — "변형문제 생성" 버튼(`POST /questions/:id/variants` 연결) + 연결된 변형 리스트(`GET /questions/:id/variants`) 렌더. 생성 깊이는 얕게(엔드포인트 호출 + 결과 링크). "설계됨" 배지 표기.

- [ ] **Step 4: 스튜디오 페이지**

Create `web/app/studio/[genId]/page.tsx` — 생성 결과 문항 ID들 조회 → 각 `GET /questions/:id` → 지문 + 문항 리스트. 각 문항: QuestionViewer + InlineEditableText(발문/선지/해설), 정답 토글, 난이도 Select, 삭제(`DELETE /questions/:id`), 발행 버튼(`POST /questions/:id/publish`), VariantShell.

- [ ] **Step 5: 수동 검증**

Expected: 생성된 문항 렌더, 발문 인라인 수정 후 blur → PATCH 반영, 발행 클릭 → status PUBLISHED, 변형 버튼 동작.

- [ ] **Step 6: Commit**

```bash
git add web/app/studio web/components/editor web/components/studio
git commit -m "feat(fe): 출제 스튜디오 렌더+경량편집+발행+변형셸"
```

---

## Task 8: VizRenderer — 안전 시각화 렌더 (TDD) + KaTeX

**Files:**
- Create: `web/types/viz.ts`, `web/components/viz/VizRenderer.tsx`, `web/components/viz/VizRenderer.test.tsx`, `web/components/viz/MathText.tsx`
- Config: `web/vitest.config.ts` (없으면 생성)

**Interfaces:**
- Produces: `VizSpec = { kind: 'vega'; spec: object } | { kind: 'svg'; svg: string }`. `<VizRenderer spec={VizSpec} />`. `sanitizeSvg(raw: string): string`(script/on* 제거). `<MathText text />`(`$...$` KaTeX).

- [ ] **Step 1: vitest 셋업**

Run: `cd web && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`
Create `web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', globals: true } });
```

- [ ] **Step 2: 실패 테스트**

Create `web/components/viz/VizRenderer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from './VizRenderer';

describe('sanitizeSvg', () => {
  it('script와 이벤트 핸들러를 제거한다', () => {
    const dirty = '<svg><script>alert(1)</script><rect onload="x()" width="10"/></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onload');
    expect(clean).toContain('<rect');
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `cd web && npx vitest run components/viz`
Expected: FAIL — `sanitizeSvg` 미정의.

- [ ] **Step 4: 구현**

Create `web/components/viz/VizRenderer.tsx`:

```tsx
'use client';
import DOMPurify from 'dompurify';
import { VegaLite } from 'react-vega';
import type { VizSpec } from '@/types/viz';

export function sanitizeSvg(raw: string): string {
  return DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } });
}

export function VizRenderer({ spec }: { spec: VizSpec }) {
  if (spec.kind === 'svg') {
    return <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(spec.svg) }} />;
  }
  return <VegaLite spec={spec.spec as object} actions={false} />;
}
```

Create `web/types/viz.ts`:

```typescript
export type VizSpec = { kind: 'vega'; spec: object } | { kind: 'svg'; svg: string };
```

주의: `sanitizeSvg`가 jsdom에서 동작하도록 DOMPurify는 브라우저/jsdom window 사용. 테스트 환경 jsdom이면 그대로 동작.

- [ ] **Step 5: 통과 확인**

Run: `cd web && npx vitest run components/viz`
Expected: PASS.

- [ ] **Step 6: MathText (KaTeX)**

Create `web/components/viz/MathText.tsx` — 문자열을 `$...$` 기준 분할, 수식 조각은 `katex.renderToString(expr, { throwOnError: false })`로 렌더, 나머지는 평문. `import 'katex/dist/katex.min.css'`를 `app/layout.tsx`에 추가.

- [ ] **Step 7: Commit**

```bash
git add web/components/viz web/types/viz.ts web/vitest.config.ts web/app/layout.tsx
git commit -m "feat(fe): VizRenderer(Vega/SVG sanitize)+MathText(KaTeX)"
```

---

## Task 9: AI 시각화 Route Handler (`/api/ai/visualize`)

**Files:**
- Create: `web/app/api/ai/visualize/route.ts`, `web/lib/viz-schema.ts`

**Interfaces:**
- Consumes: `GEMINI_API_KEY`(서버 전용 env), `VizSpec`(Task 8), zod.
- Produces: `POST /api/ai/visualize` body `{ context: string }` → `VizSpec`(검증됨) 또는 `{ error }`(400).

- [ ] **Step 1: zod 스키마**

Create `web/lib/viz-schema.ts`:

```typescript
import { z } from 'zod';
export const vizSpecSchema = z.union([
  z.object({ kind: z.literal('vega'), spec: z.record(z.unknown()) }),
  z.object({ kind: z.literal('svg'), svg: z.string().max(20000) }),
]);
export type VizSpecParsed = z.infer<typeof vizSpecSchema>;
```

- [ ] **Step 2: Route Handler**

Create `web/app/api/ai/visualize/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { vizSpecSchema } from '@/lib/viz-schema';

// Cloudflare Pages/Workers: Route Handler는 edge 런타임에서 동작.
export const runtime = 'edge';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYS = `너는 수학/과학 문항의 시각화 스펙 생성기다. 반드시 JSON만 출력.
형식1(선호): {"kind":"vega","spec":<Vega-Lite v5 스펙 객체>}
형식2: {"kind":"svg","svg":"<svg ...>...</svg>"}  // script/onload 등 금지, 순수 도형만
설명·마크다운·코드펜스 금지. JSON 객체 하나만.`;

export async function POST(req: NextRequest) {
  const { context } = (await req.json()) as { context?: string };
  if (!context) return NextResponse.json({ error: 'context required' }, { status: 400 });
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const r = await model.generateContent(`${SYS}\n\n문항 맥락:\n${context}`);
    const raw = r.response.text().replace(/^```json?/m, '').replace(/```$/m, '').trim();
    const parsed = vizSpecSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: 'invalid spec' }, { status: 400 });
    return NextResponse.json(parsed.data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
```

- [ ] **Step 3: 스튜디오/뷰어 연동**

QuestionViewer(Task 7)에 "시각화 생성" 버튼 추가: 발문 평문을 `POST /api/ai/visualize`에 전송 → 반환 `VizSpec`을 상태에 담아 `<VizRenderer>`로 렌더. 실패(400) 시 조용히 스킵(폴백: 시각화 없음).

- [ ] **Step 4: 수동 검증**

Expected: 함수 문항에서 "시각화 생성" 클릭 → Vega-Lite 그래프 또는 SVG 렌더. 잘못된 스펙은 에러 없이 미표시.

- [ ] **Step 5: Commit**

```bash
git add web/app/api web/lib/viz-schema.ts web/components/editor/QuestionViewer.tsx
git commit -m "feat(fe): AI 시각화 Route Handler + zod 검증 렌더 연동"
```

---

## Task 10: SketchCanvas — 재사용 필기 컴포넌트 (TDD 좌표 정규화)

**Files:**
- Create: `web/types/canvas.ts`, `web/components/canvas/normalize.ts`, `web/components/canvas/normalize.test.ts`, `web/components/canvas/SketchCanvas.tsx`

**Interfaces:**
- Produces: `Stroke = { id: string; color: string; width: number; points: { x: number; y: number; p?: number }[] }`(x,y는 0~1). `CanvasData = { version: 1; strokes: Stroke[] }`. `toNormalized(px, py, w, h)`/`toPixel(nx, ny, w, h)`. `<SketchCanvas value onChange />`.

- [ ] **Step 1: 실패 테스트**

Create `web/components/canvas/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toNormalized, toPixel } from './normalize';

describe('canvas normalize', () => {
  it('픽셀↔정규화 왕복이 일치한다', () => {
    const n = toNormalized(50, 100, 200, 400); // → 0.25, 0.25
    expect(n).toEqual({ x: 0.25, y: 0.25 });
    expect(toPixel(0.25, 0.25, 200, 400)).toEqual({ x: 50, y: 100 });
  });
  it('경계를 0~1로 클램프한다', () => {
    expect(toNormalized(-10, 500, 200, 400)).toEqual({ x: 0, y: 1 });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && npx vitest run components/canvas`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

Create `web/components/canvas/normalize.ts`:

```typescript
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function toNormalized(px: number, py: number, w: number, h: number) {
  return { x: clamp(px / w), y: clamp(py / h) };
}
export function toPixel(nx: number, ny: number, w: number, h: number) {
  return { x: nx * w, y: ny * h };
}
```

Create `web/types/canvas.ts`:

```typescript
export interface StrokePoint { x: number; y: number; p?: number; }
export interface Stroke { id: string; color: string; width: number; points: StrokePoint[]; }
export interface CanvasData { version: 1; strokes: Stroke[]; }
```

- [ ] **Step 4: 통과 확인**

Run: `cd web && npx vitest run components/canvas`
Expected: PASS.

- [ ] **Step 5: SketchCanvas 컴포넌트**

Create `web/components/canvas/SketchCanvas.tsx` — `'use client'`. `<canvas>` 위 포인터 이벤트로 stroke 수집(정규화 저장), perfect-freehand `getStroke`로 렌더, undo/clear 버튼. `value: CanvasData`, `onChange(next)`. 리사이즈 시 정규화 좌표로 재그리기.

- [ ] **Step 6: Commit**

```bash
git add web/components/canvas web/types/canvas.ts
git commit -m "feat(fe): SketchCanvas 재사용 필기 컴포넌트 + 좌표 정규화"
```

---

## Task 11: 모의고사 조립 화면

**Files:**
- Create: `web/app/exam/assemble/page.tsx`

**Interfaces:**
- Consumes: `GET /api/subjects`, `GET /api/subjects/:id/units`, `POST /api/exam-sessions`.
- Produces: `CreateSessionDto` 조립 → 세션 `id`로 `/exam/[sessionId]` 이동.

- [ ] **Step 1: 조립 폼**

Create `web/app/exam/assemble/page.tsx` — subject Select, 단원 다중선택(UnitTreeSelect 재사용, 다중), 유형 다중, 난이도 min/max, 문항수. 제출 시 `POST /exam-sessions` body `{ subjectId, questionCount, filter: { unitIds, questionTypes, minDifficulty, maxDifficulty } }` → 반환 `id`로 `router.push(/exam/${id})`. 조건 무매칭 400 시 토스트("필터를 완화하세요").

- [ ] **Step 2: 수동 검증**

Expected: 수학 과목 선택·조립 → 세션 생성 → 응시 화면으로 이동. 시드 PUBLISHED 문항으로 조립 성공.

- [ ] **Step 3: Commit**

```bash
git add web/app/exam/assemble
git commit -m "feat(fe): 모의고사 조립 화면"
```

---

## Task 12: 응시 화면 — OMR + 타이머 + 문항 필기

**Files:**
- Create: `web/app/exam/[sessionId]/page.tsx`, `web/components/exam/OmrSheet.tsx`, `web/components/exam/ExamTimer.tsx`, `web/stores/examStore.ts`

**Interfaces:**
- Consumes: `GET /api/exam-sessions/:id`, `PUT /api/exam-sessions/questions/:sqId/answer`, `POST /api/exam-sessions/:id/submit`, `SketchCanvas`, `QuestionViewer`.
- Produces: `useExamStore`(Zustand) — `answers: Record<sqId, AnswerDraft>`, `currentIndex`, `setAnswer`, `elapsedSec`. `AnswerDraft = { selectedChoiceIds?; blankAnswers?; answerText?; annotations?: CanvasData }`.

- [ ] **Step 1: Zustand 스토어**

Create `web/stores/examStore.ts`:

```typescript
import { create } from 'zustand';
import type { CanvasData } from '@/types/canvas';

export interface AnswerDraft { selectedChoiceIds?: string[]; blankAnswers?: string[]; answerText?: string; annotations?: CanvasData; }

interface ExamState {
  answers: Record<string, AnswerDraft>;
  currentIndex: number;
  setAnswer: (sqId: string, draft: AnswerDraft) => void;
  setIndex: (i: number) => void;
  reset: () => void;
}

export const useExamStore = create<ExamState>((set) => ({
  answers: {},
  currentIndex: 0,
  setAnswer: (sqId, draft) => set((s) => ({ answers: { ...s.answers, [sqId]: { ...s.answers[sqId], ...draft } } })),
  setIndex: (i) => set({ currentIndex: i }),
  reset: () => set({ answers: {}, currentIndex: 0 }),
}));
```

- [ ] **Step 2: 타이머**

Create `web/components/exam/ExamTimer.tsx` — `startedAt` 기준 경과초 표시(1초 인터벌). `mm:ss` 포맷.

- [ ] **Step 3: OMR 시트**

Create `web/components/exam/OmrSheet.tsx` — 문항 목록(번호 그리드), 현재 문항 하이라이트, 답안 입력 완료 표시. 클릭 시 `setIndex`.

- [ ] **Step 4: 응시 페이지**

Create `web/app/exam/[sessionId]/page.tsx` — `GET /exam-sessions/:id` 로드. 현재 문항: QuestionViewer(마스킹된 snapshot) + 선지 클릭(SINGLE/MULTI)·빈칸 Input(SHORT)·Textarea(ESSAY). 우측 또는 하단 SketchCanvas(문항 필기 → annotations). 답 변경 시 debounce `PUT .../answer`(selected/blank/text + annotations + timeSpentSec). OmrSheet + ExamTimer. "제출" → `POST /:id/submit` → `router.push(/exam/${id}/result)`.

- [ ] **Step 5: 수동 검증**

Expected: 문항 이동·선지 선택 저장(PUT 200), 필기 stroke 저장, 제출 시 결과 화면 이동. 진행 중 정답 미노출.

- [ ] **Step 6: Commit**

```bash
git add web/app/exam web/components/exam web/stores/examStore.ts
git commit -m "feat(fe): 응시 화면 OMR+타이머+문항 필기"
```

---

## Task 13: 채점 결과 화면

**Files:**
- Create: `web/app/exam/[sessionId]/result/page.tsx`

**Interfaces:**
- Consumes: `POST /api/exam-sessions/:id/submit` 결과 또는 `GET /api/exam-sessions/:id`(SUBMITTED면 정답·해설 공개).
- Produces: 점수 요약 + 문항별 정오·해설 리스트, 문제상세 링크.

- [ ] **Step 1: 결과 페이지**

Create `web/app/exam/[sessionId]/result/page.tsx` — `GET /exam-sessions/:id`(SUBMITTED) 로드. 상단 점수 카드(`scorePercent`, correct/total, durationSec). 문항별: 내 답 vs 정답, 정오 배지, 해설(QuestionViewer). 각 문항 → `/questions/[questionId]` 링크(재풀이·변형·커뮤니티). "오답노트 보기" → `/me/notes`.

- [ ] **Step 2: 수동 검증**

Expected: 제출 후 점수·문항별 정오·해설 정확 표시. 정답률 반영 확인.

- [ ] **Step 3: Commit**

```bash
git add web/app/exam
git commit -m "feat(fe): 채점 결과 화면"
```

---

## Task 14: 문제 상세 허브 — 리뷰·댓글·대댓글·메모·캔버스·핀 (Figma 참조)

**Files:**
- Create: `web/app/questions/[id]/page.tsx`, `web/components/community/ReviewPanel.tsx`, `web/components/community/CommentTree.tsx`, `web/components/community/MemoPanel.tsx`

**Interfaces:**
- Consumes: `GET /api/questions/:id`, `GET/PUT /api/questions/:id/reviews`, `GET/POST /api/questions/:id/comments`, `POST/DELETE /api/comments/:id/pin`, `GET/PUT /api/questions/:id/memo`, `SketchCanvas`, `QuestionViewer`.
- Produces: `CommentTree`(재귀 렌더 + 답글 `parentCommentId`).

- [ ] **Step 1: ReviewPanel**

Create `web/components/community/ReviewPanel.tsx` — 평점 요약(리스트 응답의 summary) + 내 별점 1~5 선택 → `PUT /questions/:id/reviews` `{ rating, reviewText? }`.

- [ ] **Step 2: CommentTree (재귀 + 대댓글)**

Create `web/components/community/CommentTree.tsx`:

```tsx
'use client';
interface CommentNode { id: string; content: string; author?: { nickname?: string }; isPinned?: boolean; replies?: CommentNode[]; }

export function CommentTree({ nodes, onReply, onPin, depth = 0 }: {
  nodes: CommentNode[]; onReply: (parentId: string, text: string) => void; onPin: (id: string, pin: boolean) => void; depth?: number;
}) {
  return (
    <ul className={depth > 0 ? 'ml-4 border-l pl-3' : ''}>
      {nodes.map((n) => (
        <li key={n.id} className="py-2">
          <div className="flex items-center gap-2">
            {n.isPinned && <span className="text-xs text-amber-600">📌 고정</span>}
            <span className="text-sm font-medium">{n.author?.nickname ?? '익명'}</span>
          </div>
          <p className="text-sm">{n.content}</p>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <button onClick={() => { const t = prompt('답글'); if (t) onReply(n.id, t); }}>답글</button>
            <button onClick={() => onPin(n.id, !n.isPinned)}>{n.isPinned ? '고정 해제' : '고정'}</button>
          </div>
          {depth < 2 && n.replies?.length ? (
            <CommentTree nodes={n.replies} onReply={onReply} onPin={onPin} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

`onReply(parentId, text)` → `POST /questions/:id/comments` `{ content: text, parentCommentId: parentId }`. 핀 버튼은 UI 배치 + `POST/DELETE /comments/:id/pin` 연결(권한 없으면 에러 토스트).

- [ ] **Step 3: MemoPanel (텍스트 + 캔버스)**

Create `web/components/community/MemoPanel.tsx` — `GET /questions/:id/memo` 로드, Textarea(텍스트) + SketchCanvas(캔버스). 저장 시 `PUT /questions/:id/memo` `{ content, canvas }`.

- [ ] **Step 4: 상세 페이지 조립**

Create `web/app/questions/[id]/page.tsx` — QuestionViewer(발문·선지·해설·시각화·정답률) + Tabs(리뷰/댓글/메모) 또는 세로 스택. ReviewPanel + CommentTree + MemoPanel. "이 문제 변형 생성"(VariantShell 재사용) 링크.

- [ ] **Step 5: 수동 검증**

Expected: 별점 저장, 댓글·대댓글 작성·표시, 핀 버튼 동작(권한 시), 메모 텍스트+필기 저장·복원.

- [ ] **Step 6: Commit**

```bash
git add web/app/questions/[id] web/components/community
git commit -m "feat(fe): 문제 상세 허브 리뷰/댓글/대댓글/메모/캔버스/핀"
```

---

## Task 15: 오답노트·풀이기록 + 오답비율 그래프

**Files:**
- Create: `web/app/me/notes/page.tsx`, `web/components/notes/WrongNoteChart.tsx`

**Interfaces:**
- Consumes: `GET /api/me/exam-sessions`, `GET /api/me/wrong-notes`(Task 1), `VizRenderer`(Task 8).
- Produces: 단원·유형별 오답비율 막대그래프(Vega-Lite spec 구성) + 오답 문항 리스트.

- [ ] **Step 1: WrongNoteChart**

Create `web/components/notes/WrongNoteChart.tsx`:

```tsx
'use client';
import { VizRenderer } from '@/components/viz/VizRenderer';

interface Stat { key: string; label: string; total: number; wrong: number; wrongRatio: number; }

export function WrongNoteChart({ title, stats }: { title: string; stats: Stat[] }) {
  const spec = {
    kind: 'vega' as const,
    spec: {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title,
      data: { values: stats.map((s) => ({ 단원: s.label, 오답비율: s.wrongRatio })) },
      mark: 'bar',
      encoding: {
        x: { field: '단원', type: 'nominal' },
        y: { field: '오답비율', type: 'quantitative', scale: { domain: [0, 1] } },
      },
      width: 320, height: 200,
    },
  };
  return <VizRenderer spec={spec} />;
}
```

- [ ] **Step 2: 오답노트 페이지**

Create `web/app/me/notes/page.tsx` — `GET /me/wrong-notes`, `GET /me/exam-sessions` 로드. 탭1 풀이기록(세션 리스트: 점수·일시·소요시간). 탭2 오답노트: `WrongNoteChart('단원별', byUnit)` + `WrongNoteChart('유형별', byType)` + 오답 문항 리스트(`wrongQuestions` → `/questions/[id]` 링크). 데이터 없으면 "아직 제출한 세션이 없습니다".

- [ ] **Step 3: 수동 검증**

Expected: 세션 1개 이상 제출 후, 단원·유형별 오답비율 막대그래프 렌더, 오답 문항 리스트에서 상세 이동.

- [ ] **Step 4: Commit**

```bash
git add web/app/me web/components/notes
git commit -m "feat(fe): 오답노트/풀이기록 + 오답비율 그래프"
```

---

## Task 16: 디자인 폴리시 + 반응형 + 네비 + 배포

**Files:**
- Create: `web/components/layout/AppNav.tsx`
- Modify: `web/app/layout.tsx`, 각 페이지 반응형 클래스
- Create: `web/wrangler.toml`(Cloudflare Pages 설정), `web/.dev.vars`(로컬 시크릿)

**Interfaces:**
- Produces: 전역 네비(로그인 상태/역할별 메뉴), 배포된 Cloudflare Pages URL.

- [ ] **Step 1: 전역 네비**

Create `web/components/layout/AppNav.tsx` — `useSession()` 기반. 링크: 문제(`/questions`), 만들기(`/create`, CREATOR만), 모의고사(`/exam/assemble`), 오답노트(`/me/notes`), 로그아웃. `layout.tsx`에 배치(로그인/회원가입 라우트그룹 제외).

- [ ] **Step 2: 반응형 점검**

각 페이지 컨테이너에 `max-w-*`, 그리드 `sm:grid-cols-2 lg:grid-cols-3`, 모바일 스택 확인. 스튜디오·응시 화면은 좁은 화면에서 세로 스택.

- [ ] **Step 3: shadcn 토스트 연결**

`layout.tsx`에 `<Toaster />`(sonner) 추가. API 에러 공통 토스트.

- [ ] **Step 4: 프로덕션 빌드**

Run: `cd web && npm run build`
Expected: 빌드 성공, 타입/린트 에러 0.

- [ ] **Step 5: 배포**

Run (Cloudflare Pages):
```bash
cd web && npx @cloudflare/next-on-pages   # .vercel/output/static 빌드
npx wrangler pages deploy .vercel/output/static --project-name qidea-web
```
Cloudflare 대시보드에서 env/시크릿 설정: `NEXT_PUBLIC_API_BASE`(TiDB/Aiven 물린 백엔드 URL), `GEMINI_API_KEY`. `nodejs_compat` 호환 플래그 필요 시 wrangler.toml에 추가. 백엔드 CORS(Task 0 `origin:true`)로 Cloudflare origin 허용됨.
Expected: Cloudflare Pages URL에서 골든패스 동작.

- [ ] **Step 6: 데모 리허설**

스펙 §12 스토리라인 수동 완주: 출제자 로그인 → 생성 → 시각화·편집 → 발행 → 검색 → 조립 → 응시(필기) → 채점 → 상세(리뷰·댓글·메모) → 오답노트 그래프 → 변형.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(fe): 전역 네비 + 반응형 폴리시 + 배포 설정"
```

---

## 리스크 & 폴백 (실행 중 참조)

- **orval 원격 Swagger 접근 불가**(Task 3): 로컬 백엔드 `docs-json` 또는 `openapi.json` 파일 폴백.
- **AI 워커 미가동**으로 생성 PENDING 고정(Task 6): 백엔드 BullMQ 프로세서·Redis·Gemini 키 확인. 데모는 시드 PUBLISHED 문항으로 응시 경로 우선 시연 가능.
- **Gemini 시각화 스펙 불안정**(Task 9): zod 검증 실패 시 미표시 폴백. 데모 안정성 우선.
- **Figma MCP 호출 한도**: 화면별 `get_design_context` 아껴 사용. 막히면 shadcn 기본 레이아웃으로 진행.
- **1주 압박 시 컷 순서**: 핀 배선 > 대댓글 depth > 오답 문항 리스트 상세 > 문항 필기(메모 캔버스만 유지).

## 실행 우선순위 (Day 매핑)

- D1: Task 0, 1, 2, 3, 4
- D2: Task 5, 6
- D3: Task 7
- D4: Task 8, 9, 10
- D5: Task 11, 12
- D6: Task 13, 14
- D7: Task 15, 16
