# 응시 중 AI 힌트 즉석 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 응시 도중 "힌트" 버튼을 누르면, 출제자 작성 힌트가 없을 때 Gemini가 정답을 노출하지 않는 넛지 힌트를 즉석(동기)으로 생성해 반환한다.

**Architecture:** 기존 동기 인라인 LLM 경로(`GeminiLlmService.regenerateChoices`)를 미러링해 `generateHint`를 추가한다. `ExamSessionsService.revealHint`가 static `hintContent` 우선, 없으면 `generateHint` 폴백으로 힌트를 만든다(DB에 힌트는 저장 안 함, 사용 기록 `isHintUsed`만 유지). 프론트는 실패 시 버튼을 숨기던 동작을 에러 메시지 표시로 바꾼다.

**Tech Stack:** NestJS 10, Prisma/MySQL, Gemini REST, Jest, Next.js 14 / React (web).

## Global Constraints

- 주석·사용자 대면 메시지는 **한국어**.
- 모든 요청 바디는 DTO 필요(전역 `ValidationPipe` whitelist+forbidNonWhitelisted) — 단, 이 기능의 힌트 엔드포인트는 바디가 없으므로 DTO 불필요.
- `stem`/`choices[].content`/`explanation`은 ProseMirror JSON — LLM에 넘기기 전 `extractPlainText`로 평문화(`src/common/prosemirror/prosemirror.util.ts`).
- 힌트는 **휘발**(DB 미저장). 스키마 변경 0.
- LLM은 Gemini만. `GeminiLlmService` 재사용(새 provider 금지).
- 정답·선지 번호·정답 문자열을 힌트에 노출하지 않도록 프롬프트로 억제.
- 백엔드 명령은 저장소 루트에서 실행. 단일 스펙 실행: `npm test -- <파일조각>`.

---

### Task 1: `GeminiLlmService.generateHint` + 힌트 타입/프롬프트

**Files:**
- Modify: `src/modules/ai-generation/llm/llm.types.ts` (타입 2종 추가)
- Modify: `src/modules/ai-generation/llm/gemini-llm.service.ts` (메서드 + 프롬프트 + 파서 추가)
- Test: `src/modules/ai-generation/llm/gemini-llm-hint.service.spec.ts` (신규)

**Interfaces:**
- Produces:
  - `LlmHintContext` = `{ examType?: string; examCategory?: string; subjectName?: string; difficulty?: number; questionType: '객관식' | '주관식'; stemText: string; choices?: { content: string; isCorrect: boolean }[]; correctAnswerText?: string; explanationText?: string }`
  - `LlmHintResult` = `{ hint: string }`
  - `GeminiLlmService.generateHint(ctx: LlmHintContext): Promise<LlmHintResult>`

- [ ] **Step 1: 타입 추가**

`src/modules/ai-generation/llm/llm.types.ts` 끝(파일 마지막 `}` 뒤)에 추가:

```typescript

/**
 * 응시 중 힌트 즉석 생성 컨텍스트 (동기 호출).
 * 정답 정보(정답 선지/정답 텍스트)를 모델에 주되, 시스템 프롬프트에서
 * "정답을 힌트에 노출하지 말라"고 지시한다 — 좋은 넛지를 만들기 위한 근거일 뿐이다.
 */
export interface LlmHintContext {
  questionType: QuestionKind; // "객관식" | "주관식"
  /** 발문 평문 */
  stemText: string;
  /** 객관식 선지(평문 + 정답 여부). 주관식이면 생략. */
  choices?: { content: string; isCorrect: boolean }[];
  /** 주관식 단답 정답(평문, 있으면). */
  correctAnswerText?: string;
  /** 전체 해설 평문(있으면 힌트 근거로 활용). */
  explanationText?: string;
  difficulty?: number;
  subjectName?: string;
  examCategory?: string;
  examType?: string;
}

/** 힌트 생성 결과 — 산문 한 덩어리를 JSON으로 감싸 받는다. */
export interface LlmHintResult {
  hint: string;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/modules/ai-generation/llm/gemini-llm-hint.service.spec.ts` 생성:

```typescript
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmHintContext } from './llm.types';

/**
 * generateHint는 callGemini(private)를 통해 Gemini를 부른다.
 * 네트워크를 태우지 않도록 callGemini를 스파이로 갈아끼워, 파싱/검증만 격리 검증한다.
 * ConfigService는 키가 있는 것처럼 스텁해 keyPool.hasKeys=true로 만든다.
 */
describe('GeminiLlmService.generateHint', () => {
  let service: GeminiLlmService;

  const ctx: LlmHintContext = {
    questionType: '객관식',
    stemText: '다음 중 옳은 것은?',
    choices: [
      { content: '가', isCorrect: false },
      { content: '나', isCorrect: true },
    ],
    difficulty: 3,
    subjectName: '문학',
    examCategory: '국어',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiLlmService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
      ],
    }).compile();
    service = module.get(GeminiLlmService);
  });

  it('모델 JSON에서 hint 문자열을 뽑아 반환한다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('{"hint":"정답을 직접 말하지 않는 접근 힌트"}');

    const res = await service.generateHint(ctx);
    expect(res).toEqual({ hint: '정답을 직접 말하지 않는 접근 힌트' });
  });

  it('hint가 비면 예외를 던진다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('{"hint":"   "}');

    await expect(service.generateHint(ctx)).rejects.toThrow();
  });

  it('JSON이 아니면 예외를 던진다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('힌트: 그냥 산문');

    await expect(service.generateHint(ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- gemini-llm-hint`
Expected: FAIL — `service.generateHint is not a function`

- [ ] **Step 4: 최소 구현**

`src/modules/ai-generation/llm/gemini-llm.service.ts`:

(a) import에 새 타입 추가 — 상단 `from './llm.types'` 블록에 `LlmHintContext`, `LlmHintResult` 추가:

```typescript
import {
  LlmGenerationContext,
  LlmGenerationResult,
  LlmRegenerateChoicesContext,
  LlmRegenerateChoicesResult,
  LlmHintContext,
  LlmHintResult,
  TutorTurn,
} from './llm.types';
```

(b) `regenerateChoices` 메서드 바로 뒤(닫는 `}` 다음)에 메서드 추가:

```typescript
  /**
   * 응시 중 풀이 힌트 즉석 생성 (동기 인라인 UX).
   *
   * regenerateChoices와 동일한 동기 정책: 짧은 타임아웃 + 일시 장애 자체 재시도 + thinking off.
   * DB에 쓰지 않는다(휘발). 정답을 모델에 주되 프롬프트로 노출을 억제한다.
   */
  async generateHint(ctx: LlmHintContext): Promise<LlmHintResult> {
    const raw = await this.callGemini(
      this.buildHintSystemPrompt(),
      this.buildHintUserPrompt(ctx),
      { timeoutMs: REGENERATE_TIMEOUT_MS, attempts: REGENERATE_ATTEMPTS, disableThinking: true },
    );
    return this.parseHintResult(raw);
  }
```

(c) `parseChoicesResult` 뒤에 파서 추가:

```typescript
  /** 힌트 응답 파싱. hint가 비면 예외 — 프론트에 빈 힌트가 표시되지 않게 한다. */
  private parseHintResult(raw: string): LlmHintResult {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException('모델 응답에서 JSON을 찾지 못했습니다.');
    }
    let parsed: LlmHintResult;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new ServiceUnavailableException('모델 응답 JSON 파싱에 실패했습니다.');
    }
    if (typeof parsed.hint !== 'string' || !parsed.hint.trim()) {
      throw new ServiceUnavailableException('모델이 빈 힌트를 반환했습니다.');
    }
    return { hint: parsed.hint.trim() };
  }
```

(d) `buildChoicesSystemPrompt` 근처(프롬프트 빌더들 사이)에 프롬프트 빌더 2개 추가:

```typescript
  private buildHintSystemPrompt(): string {
    return [
      '너는 한국 시험 문항의 풀이 코치다. 학생이 스스로 답을 찾도록 방향만 제시하는',
      '짧은 힌트를 만든다. 아래 JSON 스키마를 "그대로" 따르는 JSON 하나만 출력한다.',
      '서두/설명/코드펜스 금지.',
      '',
      '{ "hint": string }',
      '',
      '규칙:',
      '- hint는 1~2문장, 한국어.',
      '- 정답 선지 번호, 정답 텍스트, 정답을 곧바로 유추하게 하는 문구를 절대 쓰지 않는다.',
      '- 접근 방법·주의할 함정·떠올려야 할 개념/공식만 짚는다.',
      '- 수식은 순수 텍스트로만(예: x^2 - 2x = 0). LaTeX/KaTeX 금지.',
      '- JSON 외 문자는 절대 출력하지 않는다.',
    ].join('\n');
  }

  private buildHintUserPrompt(ctx: LlmHintContext): string {
    const lines = [
      `시험: ${ctx.examType ?? '(미지정)'}`,
      `대분류: ${ctx.examCategory ?? '(미지정)'}`,
      `소분류: ${ctx.subjectName ?? '(미지정)'}`,
      `난이도: ${ctx.difficulty ?? 3} (1 쉬움 ~ 5 어려움)`,
      `유형: ${ctx.questionType}`,
      '',
      '발문:',
      ctx.stemText,
    ];
    if (ctx.choices?.length) {
      lines.push('', '선지(정답 표시는 힌트에 노출 금지):');
      ctx.choices.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.content}${c.isCorrect ? '  [정답]' : ''}`);
      });
    }
    if (ctx.correctAnswerText) lines.push('', `정답(노출 금지): ${ctx.correctAnswerText}`);
    if (ctx.explanationText) lines.push('', `해설(힌트 근거용): ${ctx.explanationText}`);
    lines.push('', '위 문항에 대해, 정답을 노출하지 않는 풀이 힌트를 만들어라.');
    return lines.join('\n');
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- gemini-llm-hint`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/modules/ai-generation/llm/llm.types.ts src/modules/ai-generation/llm/gemini-llm.service.ts src/modules/ai-generation/llm/gemini-llm-hint.service.spec.ts
git commit -m "feat: GeminiLlmService.generateHint — 응시 중 정답 비노출 힌트 동기 생성"
```

---

### Task 2: `revealHint` AI 폴백 + 모듈 배선

**Files:**
- Modify: `src/modules/exam-sessions/exam-sessions.service.ts` (생성자 주입 + `revealHint` 교체)
- Modify: `src/modules/exam-sessions/exam-sessions.module.ts` (`imports: [AiGenerationModule]`)
- Test: `src/modules/exam-sessions/exam-sessions-hint.service.spec.ts` (신규)

**Interfaces:**
- Consumes: `GeminiLlmService.generateHint(ctx: LlmHintContext): Promise<LlmHintResult>` (Task 1), `extractPlainText` (기존)
- Produces: `revealHint(sessionQuestionId, userId)` 반환 계약 불변 — `{ sessionQuestionId, hint: string, isHintUsed: true, hintUsedAt }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/modules/exam-sessions/exam-sessions-hint.service.spec.ts` 생성:

```typescript
import { Test } from '@nestjs/testing';
import { ExamSessionsService } from './exam-sessions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';

/**
 * revealHint 힌트 소스 분기:
 *  - static hintContent 있으면 그 값 반환 + LLM 미호출
 *  - 없으면 generateHint 결과 반환
 *  - 두 경로 모두 isHintUsed=false였다면 기록 update
 */
describe('ExamSessionsService.revealHint — 힌트 소스', () => {
  let service: ExamSessionsService;
  let prisma: {
    examSessionQuestion: { findUnique: jest.Mock; update: jest.Mock };
  };
  let gemini: { generateHint: jest.Mock };

  const baseSq = {
    id: 'sq1',
    isHintUsed: false,
    hintUsedAt: null,
    examSession: { userId: 'u1', status: 'IN_PROGRESS' },
    question: {
      hintContent: null,
      questionType: '객관식',
      stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '발문' }] }] },
      choices: [
        { content: [{ type: 'paragraph', content: [{ type: 'text', text: '가' }] }], isCorrect: false },
        { content: [{ type: 'paragraph', content: [{ type: 'text', text: '나' }] }], isCorrect: true },
      ],
      correctAnswerText: null,
      explanation: null,
      subject: { name: '문학', examCategory: '국어', examType: '수능' },
    },
  };

  beforeEach(async () => {
    prisma = {
      examSessionQuestion: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    gemini = { generateHint: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ExamSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiLlmService, useValue: gemini },
      ],
    }).compile();
    service = module.get(ExamSessionsService);
  });

  it('static hintContent가 있으면 그 값을 반환하고 LLM을 부르지 않는다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      question: { ...baseSq.question, hintContent: '출제자 힌트' },
    });

    const res = await service.revealHint('sq1', 'u1');

    expect(res.hint).toBe('출제자 힌트');
    expect(gemini.generateHint).not.toHaveBeenCalled();
    expect(prisma.examSessionQuestion.update).toHaveBeenCalledTimes(1); // isHintUsed 기록
  });

  it('static 힌트가 없으면 generateHint 결과를 반환한다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue(baseSq);
    gemini.generateHint.mockResolvedValue({ hint: 'AI 넛지 힌트' });

    const res = await service.revealHint('sq1', 'u1');

    expect(res.hint).toBe('AI 넛지 힌트');
    expect(gemini.generateHint).toHaveBeenCalledTimes(1);
    // 평문화된 발문·선지가 컨텍스트로 전달됐는지 확인
    const passed = gemini.generateHint.mock.calls[0][0];
    expect(passed.stemText).toBe('발문');
    expect(passed.choices).toEqual([
      { content: '가', isCorrect: false },
      { content: '나', isCorrect: true },
    ]);
    expect(passed.subjectName).toBe('문학');
  });

  it('이미 열람한 문항이면 update를 다시 하지 않는다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      isHintUsed: true,
      hintUsedAt: new Date(2026, 6, 1),
      question: { ...baseSq.question, hintContent: '출제자 힌트' },
    });

    await service.revealHint('sq1', 'u1');
    expect(prisma.examSessionQuestion.update).not.toHaveBeenCalled();
  });

  it('다른 사람 세션이면 ForbiddenException', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      examSession: { userId: 'other', status: 'IN_PROGRESS' },
    });
    await expect(service.revealHint('sq1', 'u1')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- exam-sessions-hint`
Expected: FAIL — 생성자 인자 수 불일치(또는 `generateHint` 미호출로 assertion 실패)

- [ ] **Step 3: 구현 — 생성자 주입 + import**

`src/modules/exam-sessions/exam-sessions.service.ts`:

(a) import 추가(파일 상단 import 블록):

```typescript
import { extractPlainText, PMNode } from '@/common/prosemirror/prosemirror.util';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { LlmHintContext } from '@/modules/ai-generation/llm/llm.types';
```

(b) 생성자에 주입 추가:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiLlm: GeminiLlmService,
  ) {}
```

- [ ] **Step 4: 구현 — `revealHint` 교체**

`src/modules/exam-sessions/exam-sessions.service.ts`의 `revealHint` 전체를 아래로 교체:

```typescript
  async revealHint(sessionQuestionId: string, userId: string) {
    const sq = await this.prisma.examSessionQuestion.findUnique({
      where: { id: sessionQuestionId },
      select: {
        id: true,
        isHintUsed: true,
        hintUsedAt: true,
        question: {
          select: {
            hintContent: true,
            questionType: true,
            stem: true,
            choices: true,
            correctAnswerText: true,
            explanation: true,
            difficulty: true,
            subject: { select: { name: true, examCategory: true, examType: true } },
          },
        },
        examSession: { select: { userId: true, status: true } },
      },
    });
    if (!sq) throw new NotFoundException('세션 문항을 찾을 수 없습니다.');
    if (sq.examSession.userId !== userId) throw new ForbiddenException('본인 세션만 응시할 수 있습니다.');
    if (sq.examSession.status !== 'IN_PROGRESS') {
      throw new BadRequestException('이미 제출된 세션입니다.');
    }

    // 출제자 작성 힌트가 있으면 그대로(빠른 경로), 없으면 AI로 즉석 생성(휘발).
    let hint: string;
    if (sq.question.hintContent) {
      hint = sq.question.hintContent;
    } else {
      hint = (await this.geminiLlm.generateHint(this.buildHintContext(sq.question))).hint;
    }

    // 최초 열람 시각만 남긴다(이미 열람했으면 기존 값 유지).
    const hintUsedAt = sq.hintUsedAt ?? new Date();
    if (!sq.isHintUsed) {
      await this.prisma.examSessionQuestion.update({
        where: { id: sessionQuestionId },
        data: { isHintUsed: true, hintUsedAt },
      });
    }

    return { sessionQuestionId, hint, isHintUsed: true, hintUsedAt };
  }

  /**
   * 라이브 question(스냅샷 아님 — 힌트는 채점 근거가 아니다)에서 힌트 생성 컨텍스트를 만든다.
   * ProseMirror JSON(stem/choices[].content)은 extractPlainText로 평문화한다.
   */
  private buildHintContext(q: {
    questionType: string;
    stem: unknown;
    choices: unknown;
    correctAnswerText: string | null;
    explanation: unknown;
    difficulty: number;
    subject: { name: string; examCategory: string; examType: string };
  }): LlmHintContext {
    const rawChoices = Array.isArray(q.choices) ? (q.choices as Array<Record<string, unknown>>) : [];
    const choices = rawChoices.map((c) => ({
      content: extractPlainText(c.content as PMNode | PMNode[] | null | undefined),
      isCorrect: c.isCorrect === true,
    }));
    return {
      questionType: q.questionType as QuestionKind,
      stemText: extractPlainText(q.stem as PMNode | PMNode[] | null | undefined),
      choices: choices.length ? choices : undefined,
      correctAnswerText: q.correctAnswerText ?? undefined,
      explanationText: extractPlainText(q.explanation as PMNode | PMNode[] | null | undefined) || undefined,
      difficulty: q.difficulty,
      subjectName: q.subject.name,
      examCategory: q.subject.examCategory,
      examType: q.subject.examType,
    };
  }
```

- [ ] **Step 5: 구현 — 모듈 배선**

`src/modules/exam-sessions/exam-sessions.module.ts`를 아래로 교체:

```typescript
import { Module } from '@nestjs/common';
import { ExamSessionsController } from './exam-sessions.controller';
import { ExamSessionsService } from './exam-sessions.service';
import { AiGenerationModule } from '@/modules/ai-generation/ai-generation.module';

@Module({
  imports: [AiGenerationModule], // GeminiLlmService 주입(AiGenerationModule이 export)
  controllers: [ExamSessionsController],
  providers: [ExamSessionsService],
  // WorkbooksModule의 "문제집 바로 풀기"(POST /workbooks/:id/start)가 주입해 쓴다.
  exports: [ExamSessionsService],
})
export class ExamSessionsModule {}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npm test -- exam-sessions-hint`
Expected: PASS (4 tests)

- [ ] **Step 7: 회귀 + 빌드 확인**

Run: `npm test -- exam-sessions` (기존 spec 회귀)
Expected: PASS
Run: `npm run build`
Expected: 컴파일 성공(순환 참조 없음 — AiGeneration은 ExamSessions를 import하지 않음)

- [ ] **Step 8: 커밋**

```bash
git add src/modules/exam-sessions/exam-sessions.service.ts src/modules/exam-sessions/exam-sessions.module.ts src/modules/exam-sessions/exam-sessions-hint.service.spec.ts
git commit -m "feat: revealHint에 AI 힌트 폴백 — hintContent 없으면 Gemini 즉석 생성"
```

---

### Task 3: 프론트 — 힌트 실패 시 버튼 숨김 → 에러 메시지

**Files:**
- Modify: `web/components/exam-session/SolveQuestionCard.tsx`

**Interfaces:**
- Consumes: `useRevealHint()` (기존, 변경 없음) — `mutate(sessionQuestionId, { onSuccess, onError })`, `res.hint: string`

- [ ] **Step 1: 힌트 상태·핸들러 교체**

`web/components/exam-session/SolveQuestionCard.tsx`의 힌트 블록(현재 `// ── 힌트 ──` ~ `openHint` 정의)을 아래로 교체:

```tsx
  // ── 힌트 ──
  // 한 번 받은 힌트는 hintText에 남겨 재클릭 시 재호출하지 않는다(문항당 1회, 비용 절약).
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);
  const openHint = () => {
    if (hintText) return; // 이미 받은 힌트 있으면 재호출 안 함
    setHintError(null);
    revealHint.mutate(item.sessionQuestionId, {
      onSuccess: (res) => setHintText(res.hint),
      onError: (e: unknown) =>
        setHintError(e instanceof Error ? e.message : "힌트를 불러오지 못했어요. 다시 시도해 주세요."),
    });
  };
```

- [ ] **Step 2: 버튼 렌더 — 항상 표시(숨김 조건 제거)**

같은 파일에서 `{!hintUnavailable && (` 로 감싼 버튼 블록의 조건 래퍼를 제거한다.
`{!hintUnavailable && (` 줄과 대응하는 닫는 `)}` 를 없애 버튼이 항상 렌더되게 한다. 버튼 자체(`<button ...>힌트</button>`)는 그대로 둔다.

- [ ] **Step 3: 힌트/에러 표시부 교체**

같은 파일 하단, `{hintText && (` 표시 블록을 아래로 교체(에러 표시 추가):

```tsx
      {hintText && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Lightbulb size={13} className="mt-0.5 flex-none text-primary" aria-hidden="true" />
          <p>{hintText}</p>
        </div>
      )}
      {hintError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {hintError}
        </p>
      )}
```

- [ ] **Step 4: 린트·타입 확인**

Run: `cd web && npm run lint`
Expected: 통과(미사용 `hintUnavailable` 잔재 없음 — Step 1에서 제거됨)

- [ ] **Step 5: 수동 검증**

백엔드(`npm run start:dev`) + 웹(`cd web && npm run dev`, 포트 충돌 주의) 띄우고 응시 화면에서:
1. hintContent 없는 문항 → "힌트" 클릭 → 스피너 후 AI 힌트 표시(정답 미노출 확인).
2. 같은 버튼 재클릭 → 재호출 없이 기존 힌트 유지.
3. (선택) 백엔드 LLM 키를 비워 재시작 → 클릭 시 버튼 유지 + 에러 메시지 표시.

- [ ] **Step 6: 커밋**

```bash
git add web/components/exam-session/SolveQuestionCard.tsx
git commit -m "feat: 힌트 실패 시 버튼 숨김 대신 에러 표시 + 재클릭 가드"
```

---

## Self-Review

**Spec coverage:**
- 휘발/동기/static 우선/문항당 1회 → Task 1(생성)·Task 2(폴백)·Task 3(세션 메모리) 모두 반영. ✓
- `generateHint` regenerateChoices 미러 → Task 1. ✓
- 모듈 배선(imports) → Task 2 Step 5. ✓
- 프론트 버튼 숨김 → 메시지 → Task 3. ✓
- 정답 노출 억제 프롬프트 → Task 1 buildHintSystemPrompt. ✓
- 스키마 변경 0 → 어떤 Task도 schema.prisma 수정 안 함. ✓

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TODO/TBD 없음. ✓

**Type consistency:** `LlmHintContext`/`LlmHintResult`/`generateHint` 시그니처가 Task 1 정의 == Task 2 사용. `buildHintContext`가 만드는 필드가 `LlmHintContext`와 일치(questionType/stemText/choices/correctAnswerText/explanationText/difficulty/subjectName/examCategory/examType). `res.hint: string` == 프론트 사용. ✓

**주의:** `PMNode`는 `prosemirror.util.ts`에서 export됨(Task 2 import에 포함). `QuestionKind`는 exam-sessions.service.ts에 이미 import되어 있음(기존 코드).
