import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AI_CREDIT_ITEM_KEY,
  AI_FREE_PER_DAY,
  resolveAiCreditQuota,
} from '@/common/constants/shop';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { TutorTurn } from '@/modules/ai-generation/llm/llm.types';
import { QuestionSnapshot } from '@/modules/exam-sessions/grading.util';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { ReviewTutorChatDto, ReviewTutorHistoryQueryDto } from './dto/tutor-chat.dto';
import { buildReviewTutorSystemPrompt, ReviewAttempt } from './tutor-review.prompt';

/** 히스토리 TTL: 24시간. 쓸 때마다 갱신한다. */
const HISTORY_TTL_SEC = 86_400;
/** 최근 유지 턴 수 상한(user/model 합산). */
const MAX_TURNS = 20;
/** 히스토리 총 문자 수 상한. 넘으면 오래된 턴부터 버린다. */
const MAX_CHARS = 8_000;
/** 레이트 리밋: (user, question)당 1시간 30회. */
const RATE_LIMIT = 30;
const RATE_WINDOW_SEC = 3_600;

/**
 * 레이트 리밋 카운터를 원자적으로 증가시키는 Lua 스크립트.
 * INCR 후 TTL이 없을 때(=창 최초 생성)만 EXPIRE를 건다.
 * - 원자성: INCR과 EXPIRE 사이에 프로세스가 죽어도 TTL 없는 영구 키가 생기지 않는다.
 * - 고정 창: 이미 TTL이 있으면 건드리지 않아 매 호출마다 창이 연장(슬라이딩)되지 않는다.
 * 버전 무관하게 안전하다(EXPIRE ... NX는 Redis 7.0+ 전용이라 쓰지 않는다).
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * 토큰 폭주를 막기 위해 저장 시점에 히스토리를 자른다.
 * (1) 최근 20턴만 유지 → (2) 총 문자 수가 8000자를 넘으면 오래된 턴부터 버린다.
 */
export function trimTurns(turns: TutorTurn[]): TutorTurn[] {
  let result = turns.slice(-MAX_TURNS);
  const totalChars = (): number => result.reduce((sum, t) => sum + t.text.length, 0);
  while (result.length > 1 && totalChars() > MAX_CHARS) {
    result = result.slice(1);
  }
  return result;
}

@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiLlmService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // --- 오답 복습 튜터 (#40) -------------------------------------------

  /**
   * 채점이 끝난 문항을 놓고 하는 복습 코치 채팅.
   *
   * 풀이 중 튜터(정답 발설 금지)는 계획이 무효화돼 2026-08-04에 제거됐다.
   * 그래서 "응시 중에는 정답을 숨긴다"는 경계가 이제 이 인가 하나에 걸려 있다 —
   * `authorizeReview`의 진행 중 세션 차단을 빼면 복습이 곧 커닝 경로가 된다.
   */
  async reviewChat(userId: string, dto: ReviewTutorChatDto, res: Response): Promise<void> {
    const ctx = await this.authorizeReview(userId, dto.questionId);
    await this.enforceRateLimit(userId, dto.questionId);
    // 잔량이 없으면 LLM을 부르기 전에 끊는다. 실제 차감은 아래에서 다시 판정한다.
    await this.assertAiCreditAvailable(userId);

    const system = buildReviewTutorSystemPrompt(ctx.snapshot, ctx.attempt);
    const history = await this.loadHistoryAt(this.reviewHistoryKey(userId, dto.questionId));

    const iterator = this.gemini
      .streamChat(system, history, dto.message, { userId, feature: 'TUTOR' })
      [Symbol.asyncIterator]();
    // 차감은 이 await **이후**다. LLM이 아예 응답하지 않으면 여기서 예외가 나고,
    // 헤더도 안 나간 상태라 일반 HTTP 에러로 끝난다 — 크레딧은 그대로 남는다.
    const first = await iterator.next();
    await this.consumeAiCredit(userId);

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
      await this.appendTurnsAt(
        this.reviewHistoryKey(userId, dto.questionId),
        history,
        dto.message,
        full,
      );
    } catch (err) {
      this.logger.warn(`복습 튜터 스트림 처리 중 오류: ${(err as Error).message}`);
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  // --- AI 크레딧 (폐기된 HINT_TOKEN의 후신) ---------------------------
  //
  // 무료분을 먼저 태우고, 떨어지면 보유 크레딧을 쓴다. 두 단계로 나눈 이유:
  //   1) `assertAiCreditAvailable` — LLM을 부르기 **전** 사전 차단. 잔량이 없는데
  //      Gemini를 호출하면 돈만 쓰고 402를 준다.
  //   2) `consumeAiCredit` — 첫 토큰이 온 **뒤** 실제 차감. 트랜잭션 안에서 다시
  //      판정하므로 (1)의 결과를 믿지 않는다. 사전 차단은 최적화일 뿐 권위가 아니다.

  /** 잔량 사전 확인. 여기서 통과해도 실제 차감은 다시 판정한다. */
  private async assertAiCreditAvailable(userId: string): Promise<void> {
    const [user, inv] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiFreeDate: true, aiFreeUsed: true },
      }),
      this.prisma.userInventory.findUnique({
        where: { userId_itemKey: { userId, itemKey: AI_CREDIT_ITEM_KEY } },
        select: { quantity: true },
      }),
    ]);
    const quota = resolveAiCreditQuota(
      user.aiFreeDate,
      user.aiFreeUsed,
      inv?.quantity ?? 0,
      new Date(),
    );
    if (!quota.allow) throw this.outOfCredit();
  }

  /** 한 턴 차감. 무료분 우선, 없으면 크레딧 1개. */
  private async consumeAiCredit(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { aiFreeDate: true, aiFreeUsed: true },
      });
      const inv = await tx.userInventory.findUnique({
        where: { userId_itemKey: { userId, itemKey: AI_CREDIT_ITEM_KEY } },
        select: { quantity: true },
      });
      const quota = resolveAiCreditQuota(user.aiFreeDate, user.aiFreeUsed, inv?.quantity ?? 0, now);
      if (!quota.allow) throw this.outOfCredit();

      if (quota.useCredit) {
        // 조건부 UPDATE로 원자적으로 깎는다. 위에서 읽은 quantity를 믿고 무조건
        // decrement하면 동시 요청이 잔량을 음수로 만든다.
        const hit = await tx.userInventory.updateMany({
          where: { userId, itemKey: AI_CREDIT_ITEM_KEY, quantity: { gt: 0 } },
          data: { quantity: { decrement: 1 } },
        });
        if (hit.count === 0) throw this.outOfCredit();
        return;
      }

      // 무료분도 compare-and-set. 경합에 지면 카운트를 올리지 않고 그냥 통과시킨다 —
      // 이 경우 최악이 "무료 1턴을 덤으로 줬다"이고, 그게 산 크레딧을 잘못 태우거나
      // 대화 중에 에러를 띄우는 것보다 싸다.
      const hit = await tx.user.updateMany({
        where: { id: userId, aiFreeDate: user.aiFreeDate, aiFreeUsed: user.aiFreeUsed },
        data: { aiFreeDate: now, aiFreeUsed: quota.newFreeUsed },
      });
      if (hit.count === 0) {
        this.logger.debug(`AI 크레딧 무료분 경합 — 차감 생략 (user=${userId})`);
      }
    });
  }

  private outOfCredit(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        message: `오늘 무료 ${AI_FREE_PER_DAY}턴을 다 썼고 AI 크레딧도 없습니다. 상점에서 충전해주세요.`,
        error: 'AI_CREDIT_EXHAUSTED',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /** 복습 튜터 히스토리 조회. 인가는 채팅과 동일하다. */
  async getReviewHistory(userId: string, query: ReviewTutorHistoryQueryDto) {
    await this.authorizeReview(userId, query.questionId);
    const turns = await this.loadHistoryAt(this.reviewHistoryKey(userId, query.questionId));
    return { turns: turns.map((t) => ({ role: t.role, text: t.text })) };
  }

  /**
   * 복습 튜터 인가. 두 가지를 동시에 만족해야 한다.
   *
   * 1. **본인이 제출한 세션에서 실제로 푼 문항**이어야 한다. 답안이 있어야 컨텍스트
   *    ("네가 고른 답이 왜 틀렸나")가 성립하고, 제출된 세션이어야 정답이 이미
   *    학습자에게 정당하게 공개된 상태다.
   * 2. **그 문항이 지금 진행 중인 다른 세션에 들어 있으면 안 된다.** 같은 문항이
   *    제출된 세션과 진행 중 세션에 동시에 있을 수 있는데, 그때 복습 코치를 열어 주면
   *    응시 중 정답 마스킹(answer-masking.ts)을 우회하는 새 구멍이 된다.
   *    복습이 커닝 경로가 되지 않게 여기서 막는다.
   */
  private async authorizeReview(
    userId: string,
    questionId: string,
  ): Promise<{ snapshot: QuestionSnapshot; attempt: ReviewAttempt }> {
    const answered = await this.prisma.examSessionAnswer.findFirst({
      where: {
        examSessionQuestion: {
          questionId,
          examSession: { userId, status: 'SUBMITTED' },
        },
      },
      // 같은 문항을 여러 번 풀었을 수 있다(복습 세션). 가장 최근 응답을 기준으로 삼는다.
      orderBy: { answeredAt: 'desc' },
      select: {
        isCorrect: true,
        selectedChoiceIds: true,
        answerText: true,
        examSessionQuestion: { select: { snapshot: true } },
      },
    });
    if (!answered) {
      throw new ForbiddenException('제출한 시험에서 직접 푼 문항만 복습할 수 있습니다.');
    }

    // 같은 문항이 진행 중 세션에도 있으면 거절 — 복습을 통한 정답 열람 우회 차단.
    const active = await this.prisma.examSessionQuestion.findFirst({
      where: { questionId, examSession: { userId, status: 'IN_PROGRESS' } },
      select: { id: true },
    });
    if (active) {
      throw new ForbiddenException(
        '이 문항이 포함된 시험을 응시 중입니다. 제출한 뒤에 복습할 수 있습니다.',
      );
    }

    const snapshot = answered.examSessionQuestion.snapshot as unknown as QuestionSnapshot;

    // 학습자가 이 문항에 남긴 오답 원인·메모 — 자가 진단을 대화의 출발점으로 쓴다.
    const annotations = await this.prisma.userQuestionAnnotation.findMany({
      where: { userId, questionId },
      select: { reasonCode: true, memoText: true },
      take: 20,
    });

    return {
      snapshot,
      attempt: {
        selectedChoiceNumbers: toChoiceNumbers(snapshot, answered.selectedChoiceIds),
        answerText: answered.answerText,
        isCorrect: answered.isCorrect,
        reasonCodes: uniqueStrings(annotations.map((a) => a.reasonCode)),
        memos: uniqueStrings(annotations.map((a) => a.memoText)),
      },
    };
  }

  /**
   * 히스토리 키에 **userId를 넣는다.** 복습은 문항 단위라 userId가 없으면
   * 같은 문항을 복습하는 모든 사용자가 한 대화를 공유하게 된다.
   */
  private reviewHistoryKey(userId: string, questionId: string): string {
    return `tutor:review:${userId}:${questionId}`;
  }

  // --- 레이트 리밋 ----------------------------------------------------

  /**
   * (user, question)당 1시간 30회. INCR 후 TTL이 없을 때만 EXPIRE.
   * 30을 넘으면(31번째) 429. 헤더 전송 전에 검사한다.
   */
  private async enforceRateLimit(userId: string, questionId: string): Promise<void> {
    const key = `tutor:review:rate:${userId}:${questionId}`;
    // INCR과 EXPIRE를 Lua로 원자적으로 묶는다. INCR 직후 프로세스가 죽어도
    // 카운터가 TTL 없이 영구히 남는 창(→ 영구 차단)이 생기지 않게 한다.
    // 고정 창(fixed window) 유지: TTL이 없을 때만 EXPIRE를 걸어 매 호출마다 창을 연장하지 않는다.
    // EXPIRE ... NX는 Redis 7.0+ 전용이라 Railway/Aiven 버전을 보장할 수 없으므로 TTL<0 분기로 대체한다.
    const count = Number(
      await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(RATE_WINDOW_SEC)),
    );
    if (count > RATE_LIMIT) {
      throw new HttpException(
        '복습 코치 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // --- 히스토리 -------------------------------------------------------

  /** 키를 직접 받는 로더. */
  private async loadHistoryAt(key: string): Promise<TutorTurn[]> {
    const raw = await this.redis.get(key);
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

  /**
   * 이번 턴(사용자 발화 + 모델 응답)을 히스토리에 덧붙여 저장한다.
   * 저장 시점에 상한(20턴 / 8000자)으로 자르고 TTL을 갱신한다.
   */
  /** 상한(20턴/8000자)을 적용하고 TTL을 갱신해 저장한다. */
  private async appendTurnsAt(
    key: string,
    prior: TutorTurn[],
    userText: string,
    modelText: string,
  ): Promise<void> {
    const next = trimTurns([
      ...prior,
      { role: 'user', text: userText },
      { role: 'model', text: modelText },
    ]);
    await this.redis.set(key, JSON.stringify(next), 'EX', HISTORY_TTL_SEC);
  }
}

/** 저장된 선지 id 배열 → 사용자에게 보이는 1-기반 번호. 스냅샷 순서가 기준이다. */
function toChoiceNumbers(snapshot: QuestionSnapshot, selected: unknown): number[] {
  const ids = Array.isArray(selected) ? selected : [];
  const choices = Array.isArray(snapshot.choices) ? snapshot.choices : [];
  return ids
    .map((id) => choices.findIndex((c) => c?.id === id))
    .filter((i) => i >= 0)
    .map((i) => i + 1)
    .sort((a, b) => a - b);
}

/** null·빈 문자열을 걸러 중복 없는 문자열 배열로. */
function uniqueStrings(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))];
}
