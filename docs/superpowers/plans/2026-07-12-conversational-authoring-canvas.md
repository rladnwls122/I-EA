# 대화형 출제 캔버스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 좌측 문제집 카드 캔버스 + 우측 멀티턴 AI 채팅으로, AI가 한 개 또는 여러 개 문항을 대화 중 제시하면 버튼으로 좌측 캔버스에 담고 수정하는 협업 출제 화면을 만든다.

**Architecture:** 백엔드는 tutor 모듈의 SSE 스트리밍 + Redis 히스토리 패턴을 각색한 `POST /ai-generations/chat` 엔드포인트 하나를 추가한다(Gemini 산문 스트림, 상태는 Redis에만). AI는 산문 뒤에 ` ```qidea-questions ` 펜스 블록으로 문항 배열(평문)을 방출하고, 프론트가 이를 파싱해 좌측 캔버스 카드로 조립한다(`buildRichBlocks`). 새 `/edit?workbookId=` 라우트가 캔버스이며 기존 `QuestionEditor`의 카드/저장 로직을 재사용한다.

**Tech Stack:** NestJS 10, Gemini REST(streamGenerateContent SSE), Redis(ioredis), Next.js 14 App Router, TanStack Query, Tiptap/ProseMirror JSON.

## Global Constraints

- **LLM은 평문만 방출** — ProseMirror 노드 트리 금지. 조립은 `web/lib/prosemirror.ts`의 `buildRichDoc`/`buildRichBlocks`가 담당(CLAUDE.md 규칙).
- **questionType은 VARCHAR** `"객관식" | "주관식"` 만. OX는 객관식의 스타일 힌트일 뿐 별도 타입 아님.
- **LLM provider는 Gemini only.** `GeminiLlmService`만 주입. 새 provider 금지.
- **모든 라우트는 기본 인증됨**(전역 `JwtAuthGuard`). 새 엔드포인트도 예외 아님.
- **DTO 필수** — `ValidationPipe({ whitelist, forbidNonWhitelisted })`이므로 요청 바디는 class-validator DTO로 정의, 미정의 필드는 거부됨.
- **주석·사용자 메시지는 한국어.**
- **모바일 반응형·Tiptap 선택교체·필드별 refine 엔드포인트는 범위 밖**(스펙 참고).

---

## File Structure

**백엔드 (신규/수정)**
- Create `src/modules/ai-generation/dto/authoring-chat.dto.ts` — 채팅 요청 DTO.
- Create `src/modules/ai-generation/authoring-chat.prompt.ts` — 출제 채팅 시스템 프롬프트 빌더.
- Create `src/modules/ai-generation/authoring-chat.service.ts` — SSE 스트림 + Redis 히스토리.
- Create `src/modules/ai-generation/authoring-chat.service.spec.ts` — 히스토리 trim/파싱 유닛 테스트.
- Modify `src/modules/ai-generation/ai-generation.controller.ts` — `POST chat` 라우트 추가.
- Modify `src/modules/ai-generation/ai-generation.module.ts` — `AuthoringChatService` 등록.

**프론트 (신규/수정)**
- Create `web/lib/authoring-chat.ts` — SSE 소비 `streamAuthoringChat` + ` ```qidea-questions ` 파서 `parseQuestionBlocks`.
- Create `web/lib/authoring-chat.test.ts` — 파서 유닛 테스트.
- Create `web/app/edit/page.tsx` — `/edit?workbookId=` 라우트 진입점.
- Create `web/components/workbook/AuthoringCanvas.tsx` — 좌 캔버스 + 우 채팅 컨테이너(상태 소유).
- Create `web/components/workbook/AuthoringChatPanel.tsx` — 우측 멀티턴 채팅 패널.
- Modify `web/components/workbook/WorkbookBuilder.tsx` — Step1 과목 선택 후 `/edit`로 이동.

---

## Task 1: 채팅 요청 DTO

**Files:**
- Create: `src/modules/ai-generation/dto/authoring-chat.dto.ts`

**Interfaces:**
- Produces: `AuthoringChatDto { workbookId: string; subjectId: string; message: string; batchSize?: number; currentQuestions?: CurrentQuestionRef[] }`, `CurrentQuestionRef { index: number; questionType: string; stem: string; choices?: string[]; answer?: string; explanation?: string }`

- [ ] **Step 1: DTO 작성**

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 좌측 캔버스의 현재 문항 요약 — 교체/수정 참조용(평문). */
export class CurrentQuestionRef {
  @IsInt()
  index!: number;

  @IsString()
  @MaxLength(20)
  questionType!: string;

  @IsString()
  @MaxLength(4000)
  stem!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  choices?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  explanation?: string;
}

/** POST /ai-generations/chat 요청 바디. */
export class AuthoringChatDto {
  @IsUUID()
  workbookId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  /** "한번에 N개씩" — AI가 이번 턴에 목표로 하는 문항 수. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  batchSize?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurrentQuestionRef)
  currentQuestions?: CurrentQuestionRef[];
}
```

- [ ] **Step 2: 타입 컴파일 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `No errors found`

- [ ] **Step 3: 커밋**

```bash
git add src/modules/ai-generation/dto/authoring-chat.dto.ts
git commit -m "feat: 출제 채팅 요청 DTO(AuthoringChatDto)"
```

---

## Task 2: 출제 채팅 시스템 프롬프트

**Files:**
- Create: `src/modules/ai-generation/authoring-chat.prompt.ts`
- Test: `src/modules/ai-generation/authoring-chat.prompt.spec.ts`

**Interfaces:**
- Consumes: `CurrentQuestionRef` (Task 1)
- Produces: `buildAuthoringSystemPrompt(ctx: { subjectName?: string; examCategory?: string; batchSize: number; currentQuestions?: CurrentQuestionRef[] }): string`, and the fenced block contract constant `QUESTION_BLOCK_LANG = 'qidea-questions'`.

프롬프트는 AI가 (a) 자연스러운 한국어로 대화하고, (b) 문항을 낼 준비가 되면 산문 끝에 ` ```qidea-questions ` 펜스 블록으로 **평문** 문항 배열을 방출하도록 지시한다. 배열 각 원소는 `{ target, questionType, stem, choices?, correctIndex?, answerText?, explanation?, passage? }`.

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { buildAuthoringSystemPrompt, QUESTION_BLOCK_LANG } from './authoring-chat.prompt';

describe('buildAuthoringSystemPrompt', () => {
  it('과목·배치수·펜스 블록 규약을 프롬프트에 포함한다', () => {
    const p = buildAuthoringSystemPrompt({
      subjectName: '문학',
      examCategory: '국어',
      batchSize: 3,
    });
    expect(p).toContain('문학');
    expect(p).toContain('국어');
    expect(p).toContain('3');
    expect(p).toContain(QUESTION_BLOCK_LANG);
    expect(p).toContain('평문');
  });

  it('현재 문항이 있으면 교체 참조용으로 목록을 넣는다', () => {
    const p = buildAuthoringSystemPrompt({
      batchSize: 1,
      currentQuestions: [
        { index: 1, questionType: '객관식', stem: '지구는?' },
      ],
    });
    expect(p).toContain('지구는?');
    expect(p).toContain('replace:1');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest authoring-chat.prompt`
Expected: FAIL — `Cannot find module './authoring-chat.prompt'`

- [ ] **Step 3: 프롬프트 빌더 구현**

```ts
import { CurrentQuestionRef } from './dto/authoring-chat.dto';

/** 펜스 블록 언어 태그 — 프론트 파서와 공유하는 계약. */
export const QUESTION_BLOCK_LANG = 'qidea-questions';

interface PromptCtx {
  subjectName?: string;
  examCategory?: string;
  batchSize: number;
  currentQuestions?: CurrentQuestionRef[];
}

/**
 * 출제 도우미 채팅 시스템 프롬프트.
 * - 평소엔 자연스러운 한국어 대화(되묻기·설계 제안).
 * - 문항을 낼 준비가 되면 산문 뒤에 qidea-questions 펜스 블록으로 평문 문항 배열을 방출.
 * - 노드 트리(ProseMirror) 금지 — 평문만. 조립은 프론트가 한다.
 */
export function buildAuthoringSystemPrompt(ctx: PromptCtx): string {
  const subject = [ctx.examCategory, ctx.subjectName].filter(Boolean).join(' · ') || '지정된 과목';
  const current =
    ctx.currentQuestions && ctx.currentQuestions.length > 0
      ? ctx.currentQuestions
          .map(
            (q) =>
              `- ${q.index}번(${q.questionType}): ${q.stem.slice(0, 120)}`,
          )
          .join('\n')
      : '(아직 없음)';

  return [
    `당신은 한국 시험 대비 문항 출제를 돕는 AI 도우미입니다. 대상 과목은 "${subject}"입니다.`,
    `사용자와 자연스러운 한국어로 대화하며, 필요하면 되묻고, 한 번에 최대 ${ctx.batchSize}개 문항을 만들어 제시하세요.`,
    ``,
    `현재 문제집에 담긴 문항(교체/수정 참조용):`,
    current,
    ``,
    `문항을 제시할 때는 대화 산문 뒤에 아래 형식의 펜스 코드블록을 정확히 한 번 붙이세요.`,
    `블록 안은 순수 JSON 배열이며, 각 값은 평문(plain text)만 씁니다. 마크다운·HTML·노드 트리를 넣지 마세요.`,
    '```' + QUESTION_BLOCK_LANG,
    `[`,
    `  {`,
    `    "target": "new",              // 새 문항이면 "new", 기존 N번 교체면 "replace:N"`,
    `    "questionType": "객관식",     // "객관식" 또는 "주관식"만`,
    `    "stem": "발문 평문",`,
    `    "choices": ["선지1", "선지2", "선지3", "선지4"],   // 객관식만`,
    `    "correctIndex": 0,             // 객관식만, 0부터`,
    `    "answerText": "정답 평문",     // 주관식 단답만(서술형이면 생략)`,
    `    "explanation": "해설 평문",    // 선택`,
    `    "passage": "지문 평문"         // 선택`,
    `  }`,
    `]`,
    '```',
    ``,
    `대화만 하고 문항을 아직 안 낼 때는 펜스 블록을 붙이지 마세요.`,
  ].join('\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest authoring-chat.prompt`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/modules/ai-generation/authoring-chat.prompt.ts src/modules/ai-generation/authoring-chat.prompt.spec.ts
git commit -m "feat: 출제 채팅 시스템 프롬프트 + qidea-questions 블록 규약"
```

---

## Task 3: 출제 채팅 서비스 (SSE + Redis 히스토리)

**Files:**
- Create: `src/modules/ai-generation/authoring-chat.service.ts`
- Test: `src/modules/ai-generation/authoring-chat.service.spec.ts`

**Interfaces:**
- Consumes: `AuthoringChatDto` (Task 1), `buildAuthoringSystemPrompt` (Task 2), `GeminiLlmService.streamChat(system, history, userText)` (기존, `gemini-llm.service.ts:139`), `TutorTurn` (기존 `llm.types.ts`), `REDIS_CLIENT` (기존 `@/redis/redis.module`, @Global).
- Produces: `AuthoringChatService.chat(userId: string, dto: AuthoringChatDto, res: Response): Promise<void>`, 그리고 순수 헬퍼 `trimAuthoringTurns(turns: TutorTurn[]): TutorTurn[]` (테스트 대상).

권한: 이 채팅은 정답 유출 경로가 아니다(출제자 본인이 자기 문제집을 만든다). 최소 검증만 — `workbookId`가 요청자 소유인지 확인 후 진행.

- [ ] **Step 1: 실패 테스트 작성 (히스토리 trim 순수 함수)**

```ts
import { trimAuthoringTurns } from './authoring-chat.service';
import type { TutorTurn } from './llm/llm.types';

describe('trimAuthoringTurns', () => {
  it('20턴을 넘으면 최근 20턴만 남긴다', () => {
    const turns: TutorTurn[] = Array.from({ length: 26 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      text: `t${i}`,
    }));
    const out = trimAuthoringTurns(turns);
    expect(out.length).toBe(20);
    expect(out[out.length - 1].text).toBe('t25');
  });

  it('20턴 이하는 그대로 둔다', () => {
    const turns: TutorTurn[] = [
      { role: 'user', text: 'a' },
      { role: 'model', text: 'b' },
    ];
    expect(trimAuthoringTurns(turns)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest authoring-chat.service`
Expected: FAIL — `Cannot find module './authoring-chat.service'`

- [ ] **Step 3: 서비스 구현**

```ts
import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { GeminiLlmService } from './llm/gemini-llm.service';
import type { TutorTurn } from './llm/llm.types';
import { AuthoringChatDto } from './dto/authoring-chat.dto';
import { buildAuthoringSystemPrompt } from './authoring-chat.prompt';

const MAX_TURNS = 20;
const HISTORY_TTL_SEC = 60 * 60 * 6; // 6시간

/** 최근 MAX_TURNS 턴만 유지(순수 함수 — 결정적 테스트). */
export function trimAuthoringTurns(turns: TutorTurn[]): TutorTurn[] {
  return turns.length <= MAX_TURNS ? turns : turns.slice(turns.length - MAX_TURNS);
}

@Injectable()
export class AuthoringChatService {
  private readonly logger = new Logger(AuthoringChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiLlmService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * 출제 도우미 채팅. tutor.chat과 동일한 SSE 패턴:
   * 인가·첫 델타는 헤더 전송 전에 끝내고, 이후 실패는 SSE error 프레임으로만 알린다.
   */
  async chat(userId: string, dto: AuthoringChatDto, res: Response): Promise<void> {
    // 1) 인가 — 본인 문제집만. (정답 유출 경로 아님, 최소 검증)
    const subject = await this.authorize(userId, dto.workbookId, dto.subjectId);

    // 2) 컨텍스트 + 히스토리
    const system = buildAuthoringSystemPrompt({
      subjectName: subject?.name,
      examCategory: subject?.examCategory,
      batchSize: dto.batchSize ?? 1,
      currentQuestions: dto.currentQuestions,
    });
    const history = await this.loadHistory(dto.workbookId);

    // 3) 첫 델타를 헤더 전송 전에 당겨온다.
    const iterator = this.gemini
      .streamChat(system, history, dto.message)
      [Symbol.asyncIterator]();
    const first = await iterator.next();

    res.status(HttpStatus.OK);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let full = '';
    try {
      if (!first.done && first.value) {
        full += first.value;
        res.write(`data: ${JSON.stringify({ delta: first.value })}\n\n`);
      }
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        if (!next.value) continue;
        full += next.value;
        res.write(`data: ${JSON.stringify({ delta: next.value })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      await this.appendTurns(dto.workbookId, history, dto.message, full);
    } catch (err) {
      this.logger.warn(`출제 채팅 스트림 오류: ${(err as Error).message}`);
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /** workbookId가 요청자 소유인지 확인하고 subjectId의 분류 정보를 반환. */
  private async authorize(userId: string, workbookId: string, subjectId: string) {
    const wb = await this.prisma.workbook.findUnique({
      where: { id: workbookId },
      select: { ownerId: true },
    });
    if (!wb || wb.ownerId !== userId) {
      throw new ForbiddenException('본인 문제집만 편집할 수 있습니다.');
    }
    return this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { name: true, examCategory: true },
    });
  }

  private historyKey(workbookId: string): string {
    return `authoring:${workbookId}`;
  }

  private async loadHistory(workbookId: string): Promise<TutorTurn[]> {
    const raw = await this.redis.get(this.historyKey(workbookId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (t): t is TutorTurn =>
          !!t &&
          (t.role === 'user' || t.role === 'model') &&
          typeof t.text === 'string',
      );
    } catch {
      return [];
    }
  }

  private async appendTurns(
    workbookId: string,
    prior: TutorTurn[],
    userText: string,
    modelText: string,
  ): Promise<void> {
    const next = trimAuthoringTurns([
      ...prior,
      { role: 'user', text: userText },
      { role: 'model', text: modelText },
    ]);
    await this.redis.set(
      this.historyKey(workbookId),
      JSON.stringify(next),
      'EX',
      HISTORY_TTL_SEC,
    );
  }
}
```

> **확인됨:** `Workbook.ownerId`는 `prisma/schema.prisma:551`에 존재. authorize의 select/비교 그대로 사용.

- [ ] **Step 4: 통과 확인**

Run: `npx jest authoring-chat.service`
Expected: PASS (2 tests)

- [ ] **Step 5: 타입 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `No errors found`

- [ ] **Step 6: 커밋**

```bash
git add src/modules/ai-generation/authoring-chat.service.ts src/modules/ai-generation/authoring-chat.service.spec.ts
git commit -m "feat: 출제 채팅 서비스 — SSE 스트림 + Redis 히스토리(tutor 패턴 각색)"
```

---

## Task 4: 엔드포인트 + 모듈 배선

**Files:**
- Modify: `src/modules/ai-generation/ai-generation.controller.ts`
- Modify: `src/modules/ai-generation/ai-generation.module.ts`

**Interfaces:**
- Consumes: `AuthoringChatService.chat` (Task 3), `AuthoringChatDto` (Task 1).
- Produces: `POST /ai-generations/chat` (SSE).

- [ ] **Step 1: 컨트롤러에 라우트 추가**

`ai-generation.controller.ts` 상단 import에 추가:

```ts
import { Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthoringChatService } from './authoring-chat.service';
import { AuthoringChatDto } from './dto/authoring-chat.dto';
```

생성자에 서비스 주입:

```ts
  constructor(
    private readonly service: AiGenerationService,
    private readonly authoringChat: AuthoringChatService,
  ) {}
```

`@Get(':id')` 위에 라우트 추가:

```ts
  @Post('chat')
  @ApiOperation({ summary: '출제 도우미 멀티턴 채팅 (SSE 스트리밍)' })
  chat(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AuthoringChatDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.authoringChat.chat(user.id, dto, res);
  }
```

> **주의:** `@Post('chat')`는 `@Get(':id')`보다 위에 둔다(경로 충돌 방지 습관). `'chat'`은 UUID가 아니므로 실제로는 `:id`와 안 겹치지만 명시적 순서를 유지한다.

- [ ] **Step 2: 모듈에 서비스 등록**

`ai-generation.module.ts` providers 배열에 `AuthoringChatService` 추가:

```ts
import { AuthoringChatService } from './authoring-chat.service';
// ...
  providers: [AiGenerationService, AiGenerationProcessor, GeminiLlmService, AuthoringChatService],
```

- [ ] **Step 3: 타입 확인 + 부팅 스모크**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `No errors found`

Run: `npm run build`
Expected: nest build 성공(에러 없음).

- [ ] **Step 4: 커밋**

```bash
git add src/modules/ai-generation/ai-generation.controller.ts src/modules/ai-generation/ai-generation.module.ts
git commit -m "feat: POST /ai-generations/chat 라우트 + 모듈 배선"
```

---

## Task 5: 프론트 SSE 소비 + 문항 블록 파서

**Files:**
- Create: `web/lib/authoring-chat.ts`
- Test: `web/lib/authoring-chat.test.ts`

**Interfaces:**
- Produces:
  - `parseQuestionBlocks(text: string): ParsedQuestion[]` — ` ```qidea-questions ` 펜스 블록(들)을 파싱해 문항 배열 반환. 블록 없거나 JSON 깨지면 `[]`.
  - `stripQuestionBlocks(text: string): string` — 산문만 남기고 펜스 블록 제거.
  - `streamAuthoringChat(body, { onDelta, onDone, onError }): Promise<void>` — SSE 소비.
  - 타입 `ParsedQuestion { target: string; questionType: '객관식' | '주관식'; stem: string; choices?: string[]; correctIndex?: number; answerText?: string; explanation?: string; passage?: string }`

- [ ] **Step 1: 실패 테스트 작성**

```ts
import { parseQuestionBlocks, stripQuestionBlocks } from './authoring-chat';

const withBlock = [
  '좋아요, 한 문제 만들어볼게요.',
  '```qidea-questions',
  '[{"target":"new","questionType":"객관식","stem":"지구는?","choices":["a","b"],"correctIndex":1}]',
  '```',
].join('\n');

describe('parseQuestionBlocks', () => {
  it('펜스 블록의 문항 배열을 파싱한다', () => {
    const out = parseQuestionBlocks(withBlock);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe('지구는?');
    expect(out[0].correctIndex).toBe(1);
  });

  it('블록이 없으면 빈 배열', () => {
    expect(parseQuestionBlocks('그냥 대화만 합니다.')).toEqual([]);
  });

  it('JSON이 깨지면 빈 배열(크래시 금지)', () => {
    const broken = '```qidea-questions\n[{ broken json\n```';
    expect(parseQuestionBlocks(broken)).toEqual([]);
  });

  it('여러 블록을 모두 모은다', () => {
    const two =
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q1"}]\n```\n' +
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q2"}]\n```';
    expect(parseQuestionBlocks(two)).toHaveLength(2);
  });
});

describe('stripQuestionBlocks', () => {
  it('산문만 남기고 블록을 제거한다', () => {
    expect(stripQuestionBlocks(withBlock).trim()).toBe('좋아요, 한 문제 만들어볼게요.');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd web && npx jest authoring-chat`
Expected: FAIL — `Cannot find module './authoring-chat'`

> web에 jest가 없으면(스크립트 확인): `web/package.json`의 test 스크립트를 확인하고, 없으면 이 파서는 `web/lib/authoring-chat.test.ts`를 루트 jest로 돌리지 말고 프론트 테스트 러너 설정을 먼저 확인한다. 파서 로직 자체는 순수 함수라 검증 방식만 맞추면 된다.

- [ ] **Step 3: 파서 + SSE 소비 구현**

```ts
const BLOCK_RE = /```qidea-questions\s*([\s\S]*?)```/g;

export interface ParsedQuestion {
  target: string; // "new" | "replace:N"
  questionType: '객관식' | '주관식';
  stem: string;
  choices?: string[];
  correctIndex?: number;
  answerText?: string;
  explanation?: string;
  passage?: string;
}

/** qidea-questions 펜스 블록(들)에서 문항 배열을 파싱. 실패 시 빈 배열(크래시 금지). */
export function parseQuestionBlocks(text: string): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  for (const m of text.matchAll(BLOCK_RE)) {
    try {
      const arr = JSON.parse(m[1].trim());
      if (Array.isArray(arr)) {
        for (const q of arr) {
          if (q && typeof q.stem === 'string' && typeof q.questionType === 'string') {
            out.push(q as ParsedQuestion);
          }
        }
      }
    } catch {
      // 깨진 블록은 무시 — 산문은 그대로 살린다.
    }
  }
  return out;
}

/** 펜스 블록을 제거하고 산문만 반환. */
export function stripQuestionBlocks(text: string): string {
  return text.replace(BLOCK_RE, '').trim();
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export interface AuthoringChatBody {
  workbookId: string;
  subjectId: string;
  message: string;
  batchSize?: number;
  currentQuestions?: {
    index: number;
    questionType: string;
    stem: string;
    choices?: string[];
    answer?: string;
    explanation?: string;
  }[];
}

/**
 * SSE 스트림 소비. data 프레임 { delta } 누적, { done } 종료, event: error 처리.
 * 델타를 onDelta로 흘리고 완료 시 누적 전체를 onDone에 넘긴다.
 */
export async function streamAuthoringChat(
  body: AuthoringChatBody,
  handlers: {
    onDelta: (delta: string, full: string) => void;
    onDone: (full: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_BASE}/ai-generations/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    handlers.onError(`요청 실패 (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 프레임은 빈 줄(\n\n)로 구분된다.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const isError = frame.startsWith('event: error');
      const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      let payload: any;
      try {
        payload = JSON.parse(dataLine.slice(6));
      } catch {
        continue;
      }
      if (isError) {
        handlers.onError(payload.message ?? '오류가 발생했습니다.');
        return;
      }
      if (payload.delta) {
        full += payload.delta;
        handlers.onDelta(payload.delta, full);
      }
      if (payload.done) {
        handlers.onDone(full);
        return;
      }
    }
  }
  handlers.onDone(full);
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd web && npx jest authoring-chat`
Expected: PASS (5 tests). (러너 미설정 시 Step 2 주석대로 처리)

- [ ] **Step 5: 커밋**

```bash
git add web/lib/authoring-chat.ts web/lib/authoring-chat.test.ts
git commit -m "feat: 프론트 출제 채팅 SSE 소비 + qidea-questions 파서"
```

---

## Task 6: 캔버스 컨테이너 + `/edit` 라우트

**Files:**
- Create: `web/app/edit/page.tsx`
- Create: `web/components/workbook/AuthoringCanvas.tsx`

**Interfaces:**
- Consumes: `parseQuestionBlocks`/`streamAuthoringChat` (Task 5), 기존 API `createQuestion`/`publishQuestion`/`addQuestionToWorkbook`/`fetchWorkbook` (`web/lib/api.ts`), `buildRichDoc`/`buildRichBlocks`/`extractPlainText` (`web/lib/prosemirror.ts`).
- Produces: `AuthoringCanvas({ workbookId }: { workbookId: string })` — 좌측 카드 상태(`drafts: Draft[]`)를 소유하고 우측 채팅 패널(Task 7)에 add/replace 콜백을 내려준다.

캔버스는 기존 `QuestionEditor`의 `Draft` 타입·카드 렌더·저장 로직을 재사용한다. 이 태스크는 **좌측 카드 목록 + 저장**만 세우고, 채팅 패널은 Task 7에서 붙인다.

- [ ] **Step 1: `/edit` 라우트 진입점**

`web/app/edit/page.tsx`:

```tsx
"use client";
import { useSearchParams } from "next/navigation";
import { AuthoringCanvas } from "@/components/workbook/AuthoringCanvas";

export default function EditPage() {
  const params = useSearchParams();
  const workbookId = params.get("workbookId");
  if (!workbookId) {
    return (
      <main className="p-8 text-sm text-muted-foreground">
        workbookId가 필요합니다. 문제집 만들기에서 다시 시작해주세요.
      </main>
    );
  }
  return <AuthoringCanvas workbookId={workbookId} />;
}
```

- [ ] **Step 2: 캔버스 컨테이너 — 좌측 카드 + 저장**

`web/components/workbook/AuthoringCanvas.tsx` (좌측만; 우측 자리 표시):

```tsx
"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { buildRichDoc, buildRichBlocks, extractPlainText } from "@/lib/prosemirror";
import { createQuestion, publishQuestion, addQuestionToWorkbook } from "@/lib/api";
import type { ParsedQuestion } from "@/lib/authoring-chat";
import { AuthoringChatPanel } from "./AuthoringChatPanel";

/** 좌측 캔버스 카드(경량 Draft — QuestionEditor의 Draft에서 편집에 쓰는 필드만). */
export interface CanvasCard {
  id: string;
  type: "객관식" | "주관식";
  stem: any;
  passage: any | null;
  choices: string[];
  correct: number;
  answerText: string;
  explanation: any;
}

/** ParsedQuestion(평문) → CanvasCard(ProseMirror 조립). */
function toCard(q: ParsedQuestion, id: string): CanvasCard {
  const isObjective = q.questionType === "객관식";
  return {
    id,
    type: q.questionType,
    stem: buildRichDoc(q.stem),
    passage: q.passage ? buildRichDoc(q.passage) : null,
    choices: isObjective ? q.choices ?? [] : [],
    correct: isObjective ? q.correctIndex ?? 0 : -1,
    answerText: q.answerText ?? "",
    explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
  };
}

export function AuthoringCanvas({ workbookId }: { workbookId: string }) {
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // 채팅 제안 → 좌측 반영. target이 replace:N이면 그 자리 교체, 아니면 append.
  const applyQuestion = useCallback((q: ParsedQuestion) => {
    setCards((prev) => {
      const m = /^replace:(\d+)$/.exec(q.target ?? "new");
      const id = `local-${prev.length}-${q.stem.slice(0, 8)}`;
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < prev.length) {
          const copy = [...prev];
          copy[idx] = toCard(q, prev[idx].id);
          return copy;
        }
      }
      return [...prev, toCard(q, id)];
    });
  }, []);

  const handleSave = async () => {
    if (cards.length === 0) {
      toast.error("저장할 문항이 없습니다.");
      return;
    }
    if (!subjectId) {
      toast.error("과목 정보가 없습니다. 채팅에서 과목을 확인해주세요.");
      return;
    }
    setSaving(true);
    try {
      let failed = 0;
      for (const c of cards) {
        if (!extractPlainText(c.stem).trim()) continue;
        try {
          const created = await createQuestion({
            subjectId,
            questionType: c.type,
            stem: c.stem,
            choices:
              c.type === "객관식"
                ? c.choices.map((text, i) => ({
                    id: `c${i + 1}`,
                    content: buildRichDoc(text),
                    isCorrect: i === c.correct,
                  }))
                : undefined,
            correctAnswerText:
              c.type === "주관식" && c.answerText.trim() ? c.answerText.trim() : undefined,
            explanation: extractPlainText(c.explanation).trim()
              ? buildRichBlocks(extractPlainText(c.explanation))
              : undefined,
          } as any);
          await publishQuestion(created.id).catch(() => null);
          await addQuestionToWorkbook(workbookId, { questionId: created.id });
        } catch (e) {
          failed += 1;
          console.error("문항 저장 실패:", e);
        }
      }
      if (failed > 0) toast.error(`${failed}개 문항 저장에 실패했어요.`);
      else toast.success(`${cards.length}개 문항을 문제집에 저장했어요.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 좌: 캔버스 */}
      <section className="flex-1 flex flex-col min-w-0 border-r border-border">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Link href="/workbook/create" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={18} /> 뒤로가기
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            최종 검토
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cards.map((c, i) => (
            <article key={c.id} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
                <span className="font-mono">문제 {i + 1}</span>
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-muted-foreground">{c.type}</span>
              </div>
              <p className="text-sm text-foreground">{extractPlainText(c.stem)}</p>
              {c.type === "객관식" && (
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {c.choices.map((ch, j) => (
                    <li key={j} className={j === c.correct ? "text-primary" : ""}>
                      {j + 1}. {ch}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
          <button
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={() =>
              applyQuestion({ target: "new", questionType: "객관식", stem: "", choices: ["", "", "", ""], correctIndex: 0 })
            }
          >
            <Plus size={16} /> 문항 추가
          </button>
        </div>
      </section>

      {/* 우: 채팅 (Task 7) */}
      <AuthoringChatPanel
        workbookId={workbookId}
        cards={cards}
        onSubjectResolved={setSubjectId}
        onApplyQuestion={applyQuestion}
      />
    </div>
  );
}
```

> **주의:** 이 태스크에서는 `AuthoringChatPanel`이 아직 없으므로 Step 2 커밋 전에 Task 7을 완료하거나, 임시로 `<aside className="w-[420px] border-l border-border" />` 자리표시자를 넣고 Task 7에서 교체한다. 타입 에러를 피하려면 Task 7과 함께 커밋하는 것을 권장.

- [ ] **Step 3: 타입 확인**

Run: `cd web && npx tsc --noEmit`
Expected: `AuthoringChatPanel` 미존재 에러만 남음 → Task 7 완료 후 해소.

---

## Task 7: 멀티턴 채팅 패널

**Files:**
- Create: `web/components/workbook/AuthoringChatPanel.tsx`

**Interfaces:**
- Consumes: `streamAuthoringChat`/`parseQuestionBlocks`/`stripQuestionBlocks`/`ParsedQuestion` (Task 5), `CanvasCard` (Task 6), 기존 `useMe`는 불필요. 과목 목록은 `fetchSubjects`(`web/lib/api.ts`).
- Produces: `AuthoringChatPanel({ workbookId, cards, onSubjectResolved, onApplyQuestion })`.

- [ ] **Step 1: 채팅 패널 구현**

`web/components/workbook/AuthoringChatPanel.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { fetchSubjects } from "@/lib/api";
import {
  streamAuthoringChat,
  parseQuestionBlocks,
  stripQuestionBlocks,
  type ParsedQuestion,
} from "@/lib/authoring-chat";
import type { CanvasCard } from "./AuthoringCanvas";
import { toast } from "sonner";

interface Msg {
  role: "user" | "ai";
  text: string;
  questions?: ParsedQuestion[];
  appliedKeys?: Set<string>; // 이미 적용한 제안 인덱스(멱등)
}

const BATCH_OPTIONS = [1, 3, 5];

export function AuthoringChatPanel({
  workbookId,
  cards,
  onSubjectResolved,
  onApplyQuestion,
}: {
  workbookId: string;
  cards: CanvasCard[];
  onSubjectResolved: (subjectId: string) => void;
  onApplyQuestion: (q: ParsedQuestion) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [input, setInput] = useState("");
  const [batch, setBatch] = useState(1);
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", text: "원하는 주제·난이도·출제 포인트를 알려주세요. 한 문제씩 신중히 만들 수도, 한 번에 여러 개 만들 수도 있어요." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  // 첫 과목을 기본 선택해 subjectId를 캔버스에 올린다(저장에 필요).
  useEffect(() => {
    fetchSubjects()
      .then((list) => {
        const first = list[0];
        if (first) {
          setSubjectId(first.id);
          onSubjectResolved(first.id);
        }
      })
      .catch(() => toast.error("과목 목록을 불러오지 못했습니다."));
  }, [onSubjectResolved]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming || !subjectId) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text: msg }, { role: "ai", text: "" }]);
    setStreaming(true);

    const currentQuestions = cards.map((c, i) => ({
      index: i + 1,
      questionType: c.type,
      stem: typeof c.stem === "string" ? c.stem : "",
    }));

    await streamAuthoringChat(
      { workbookId, subjectId, message: msg, batchSize: batch, currentQuestions },
      {
        onDelta: (_d, full) => {
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = { role: "ai", text: stripQuestionBlocks(full) };
            return copy;
          });
        },
        onDone: (full) => {
          const questions = parseQuestionBlocks(full);
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = {
              role: "ai",
              text: stripQuestionBlocks(full) || "문항을 만들었어요.",
              questions: questions.length ? questions : undefined,
              appliedKeys: new Set(),
            };
            return copy;
          });
          setStreaming(false);
        },
        onError: (m) => {
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = { role: "ai", text: `⚠ ${m}` };
            return copy;
          });
          setStreaming(false);
        },
      },
    );
  };

  const apply = (mi: number, qi: number, q: ParsedQuestion) => {
    onApplyQuestion(q);
    setMessages((p) => {
      const copy = [...p];
      const applied = new Set(copy[mi].appliedKeys);
      applied.add(String(qi));
      copy[mi] = { ...copy[mi], appliedKeys: applied };
      return copy;
    });
  };

  return (
    <aside className="flex w-[440px] flex-none flex-col border-l border-border">
      {/* 헤더 — 배치 크기 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">AI 출제 도우미</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          한번에
          {BATCH_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setBatch(n)}
              className={`rounded px-1.5 py-0.5 ${batch === n ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}
            >
              {n}개
            </button>
          ))}
        </div>
      </div>

      {/* 스레드 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, mi) => (
          <div key={mi} className="space-y-2">
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                m.role === "ai" ? "border border-border bg-surface-raised" : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {m.text || (m.role === "ai" ? "…" : "")}
            </div>
            {m.questions?.map((q, qi) => {
              const applied = m.appliedKeys?.has(String(qi));
              return (
                <div key={qi} className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{q.questionType}</div>
                  <p>{q.stem}</p>
                  {applied ? (
                    <p className="mt-2 text-xs text-primary">✓ 문제집에 추가되었어요</p>
                  ) : (
                    <button
                      onClick={() => apply(mi, qi, q)}
                      className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      {q.target?.startsWith("replace:") ? "이 문항으로 교체하기" : "문제집에 적용하기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* 입력 */}
      <div className="flex items-end gap-2 border-t border-border px-4 py-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="어떤 문제를 추가할까요?"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </aside>
  );
}
```

> **주의:** `currentQuestions[].stem`은 여기서 `c.stem`이 ProseMirror 객체라 평문이 아니다. 정확히 하려면 `extractPlainText(c.stem)`를 쓰되, import 추가 필요. Step 2에서 반영.

- [ ] **Step 2: stem 평문화 보정**

`AuthoringChatPanel.tsx` 상단에 `import { extractPlainText } from "@/lib/prosemirror";` 추가하고 `currentQuestions` 매핑을 다음으로 교체:

```tsx
    const currentQuestions = cards.map((c, i) => ({
      index: i + 1,
      questionType: c.type,
      stem: extractPlainText(c.stem),
    }));
```

- [ ] **Step 3: 타입 확인**

Run: `cd web && npx tsc --noEmit`
Expected: `No errors found` (Task 6의 미존재 에러도 해소).

- [ ] **Step 4: 커밋 (Task 6 + 7 함께)**

```bash
git add web/app/edit/page.tsx web/components/workbook/AuthoringCanvas.tsx web/components/workbook/AuthoringChatPanel.tsx
git commit -m "feat: /edit 대화형 출제 캔버스 — 좌 카드 + 우 멀티턴 채팅"
```

---

## Task 8: `/workbook/create` → `/edit` 진입 연결

**Files:**
- Modify: `web/components/workbook/WorkbookBuilder.tsx`

**Interfaces:**
- Consumes: 기존 `createWorkbook`/`useCreateWorkbook`, `useRouter`.

`WorkbookBuilder`의 Step2(인라인 채팅)를 없애고, 과목 선택 후 문제집 생성되면 `/edit?workbookId=`로 이동한다.

- [ ] **Step 1: handleProceed에서 이동**

`WorkbookBuilder.tsx`의 `handleProceed` 안에서 `setCreatedWorkbookId(wb.id);` 다음 줄에 라우팅 추가:

```tsx
      const wb = await createWorkbook.mutateAsync({ title, visibility: "PRIVATE" });
      router.push(`/edit?workbookId=${wb.id}`);
```

- [ ] **Step 2: 사용 안 하게 된 Step2 블록 제거**

`WorkbookBuilder.tsx`에서 `{createdWorkbookId && ( ... AiGenerationChat ... )}` 섹션(약 L261–297)과 그에만 쓰이는 상태/핸들러(`aiTopic`, `handleAiGenerate`, `AiGenerationChat` import, 폴링 관련)를 제거한다. 과목 선택 + 문제집 생성 후 곧바로 `/edit`로 나가므로 Step2 UI는 이 컴포넌트에 더 필요 없다.

> **주의:** 제거 범위가 넓으므로, 먼저 `router.push`만 추가해 동작을 확인한 뒤(문제집 생성 → /edit 이동), 죽은 코드를 정리하는 순서로 한다. `AiGenerationChat.tsx` 파일 자체는 다른 곳에서 안 쓰면 삭제 가능하나, 이 태스크에서는 남겨두고 후속 정리로 미룬다(YAGNI 역方向 피하려 최소 변경).

- [ ] **Step 3: 타입 확인 + 수동 스모크**

Run: `cd web && npx tsc --noEmit`
Expected: `No errors found`

수동 확인(백엔드+프론트 기동 필요): `/workbook/create`에서 과목 선택 → "다음" → `/edit?workbookId=...`로 이동하고 좌 캔버스+우 채팅이 뜬다.

- [ ] **Step 4: 커밋**

```bash
git add web/components/workbook/WorkbookBuilder.tsx
git commit -m "feat: 과목 선택 후 /edit 캔버스로 이동"
```

---

## Task 9: 엔드투엔드 수동 검증

**Files:** (없음 — 실행 검증)

- [ ] **Step 1: 인프라 기동**

`LOCAL_TEST_GUIDE.md`대로 MySQL/TiDB + Redis 기동, 백엔드 `npm run start:dev`, 프론트 `cd web && npm run dev`(포트 충돌 주의 — 하나는 포트 변경).

- [ ] **Step 2: 흐름 검증**

1. 로그인 → `/workbook/create` → 과목 선택 → "다음" → `/edit?workbookId=` 진입.
2. 채팅에 "지구과학 기초 3문제 만들어줘" + 배치 3 → 산문 스트리밍 + 제안 카드 3개.
3. 각 "문제집에 적용하기" → 좌측 카드 증가, 카드 "✓ 추가되었어요"로 잠김.
4. "2번 문항 더 쉽게" → `replace:2` 제안 → "교체하기" → 좌측 2번 카드 교체.
5. "최종 검토" → `createQuestion`+발행+`addQuestionToWorkbook` → 토스트 성공.
6. `/workbook/mine`에서 해당 문제집에 문항이 담겼는지 확인.

- [ ] **Step 3: 실패 경로 확인**

- Gemini 키 없음/오류 → 채팅 말풍선에 `⚠ …` 에러, 크래시 없음.
- 깨진 블록 방출 → 산문만 표시, 제안 카드 없음, 크래시 없음.

---

## Self-Review (작성자 체크 결과)

- **Spec coverage:** 흐름(create→/edit) T8, 멀티턴 채팅 백엔드 T1–4, SSE/파서 T5, 캔버스+카드 T6, 채팅 패널+배치+적용상태 T7, 저장(기존 workbook 연결) T6, 카드별 ✨AI(채팅 라우팅) — **부분**: T7의 제안 카드 교체로 커버되나 좌측 카드의 ✨ 버튼 자체는 미구현(후속). 스펙의 ✨는 "채팅에 프리필"이므로 필수는 아님 — 후속 태스크로 명시.
- **제외 확인:** 모바일·선택교체·refine 엔드포인트 — 계획에 없음(스펙과 일치).
- **Placeholder scan:** 코드 스텝 모두 실제 구현 포함. `ownerId` 필드명은 구현 시 스키마 확인 주석으로 명시.
- **Type consistency:** `ParsedQuestion`(T5) → `toCard`(T6) → 채팅 apply(T7) 시그니처 일치. `CanvasCard`(T6)를 T7이 소비. `AuthoringChatDto`(T1) → 서비스(T3) → 컨트롤러(T4) 일치.

## 후속(범위 밖, 별도 계획)

- 좌측 카드의 ✨AI 버튼 → 채팅 입력창에 "문제 N 수정: " 프리필.
- 좌측 카드 Tiptap 인라인 편집(기존 `QuestionEditor` 카드 이식).
- 문제집 제목 인라인 편집 + 과목 뱃지.
- 모바일 반응형(별도 스펙).
