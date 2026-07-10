import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { TutorTurn } from '@/modules/ai-generation/llm/llm.types';
import { QuestionSnapshot } from '@/modules/exam-sessions/grading.util';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { buildTutorSystemPrompt } from './tutor.prompt';
import { TutorChatDto, TutorHistoryQueryDto } from './dto/tutor-chat.dto';

/** 히스토리 TTL: 24시간. 쓸 때마다 갱신한다. */
const HISTORY_TTL_SEC = 86_400;
/** 최근 유지 턴 수 상한(user/model 합산). */
const MAX_TURNS = 20;
/** 히스토리 총 문자 수 상한. 넘으면 오래된 턴부터 버린다. */
const MAX_CHARS = 8_000;
/** 레이트 리밋: (user, session, question)당 1시간 30회. */
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

  /**
   * 문제 풀이 중 튜터 채팅. @Res()로 응답 객체를 직접 잡아 SSE로 흘려보낸다.
   *
   * 인가·레이트 리밋은 **헤더 전송 전에** 끝낸다. 헤더를 보낸 뒤에는 상태 코드를
   * 바꿀 수 없으므로, 그 전에는 평범한 예외를 던져 Nest 예외 필터가 처리하게 한다.
   */
  async chat(userId: string, dto: TutorChatDto, res: Response): Promise<void> {
    // 1) 인가 — 정답이 새는 유일한 경로다. 반드시 헤더 전송 전에.
    const snapshot = await this.authorize(userId, dto.examSessionId, dto.questionId);
    // 2) 레이트 리밋 — 역시 헤더 전송 전에.
    await this.enforceRateLimit(userId, dto.examSessionId, dto.questionId);

    // 3) 컨텍스트 조립 + 히스토리 로드.
    const system = buildTutorSystemPrompt(snapshot);
    const history = await this.loadHistory(dto.examSessionId, dto.questionId);

    // 4) 첫 델타를 헤더 전송 전에 당겨온다.
    //    첫 바이트 전 실패는 아직 헤더가 없으므로 평범한 예외로 던져 올바른 상태 코드를 준다.
    //    스트림이 시작된 뒤(첫 델타 수신 후)의 실패는 SSE error 프레임으로만 알린다.
    const iterator = this.gemini.streamChat(system, history, dto.message)[Symbol.asyncIterator]();
    const first = await iterator.next();

    // 여기서부터 헤더 전송. 이후로는 상태 코드를 못 바꾼다.
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
      // 완결된 응답만 히스토리에 저장한다.
      await this.appendTurns(dto.examSessionId, dto.questionId, history, dto.message, full);
    } catch (err) {
      this.logger.warn(`튜터 스트림 처리 중 오류: ${(err as Error).message}`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: '응답 생성 중 오류가 발생했습니다.' })}\n\n`);
    } finally {
      // @Res()를 쓰면 Nest가 자동으로 닫지 않으므로 직접 스트림을 닫는다.
      res.end();
    }
  }

  /**
   * 튜터 대화 히스토리 조회. 인가는 채팅과 동일한 순서로 검사한다.
   */
  async getHistory(userId: string, query: TutorHistoryQueryDto) {
    await this.authorize(userId, query.examSessionId, query.questionId);
    const turns = await this.loadHistory(query.examSessionId, query.questionId);
    return { turns: turns.map((t) => ({ role: t.role, text: t.text })) };
  }

  // --- 인가 -----------------------------------------------------------

  /**
   * 정답이 새는 유일한 경로. 순서대로 검사한다:
   * 1. examSessionId의 소유자가 요청자인가 → 아니면 Forbidden
   * 2. 세션이 IN_PROGRESS인가 → 아니면 Forbidden
   * 3. questionId가 그 세션의 문항인가 → 아니면 NotFound
   *
   * 통과하면 exam_session_questions.snapshot을 **마스킹 없이** 반환한다.
   * (튜터 LLM은 정답/해설을 봐야 설명이 틀리지 않는다. 단, 이 값은 HTTP 응답에 절대 싣지 않는다.)
   */
  private async authorize(
    userId: string,
    examSessionId: string,
    questionId: string,
  ): Promise<QuestionSnapshot> {
    const session = await this.prisma.examSession.findUnique({
      where: { id: examSessionId },
      select: { userId: true, status: true },
    });
    // 세션이 없거나 남의 것이면 존재 여부를 흘리지 않고 Forbidden.
    if (!session || session.userId !== userId) {
      throw new ForbiddenException('본인 세션만 이용할 수 있습니다.');
    }
    if (session.status !== 'IN_PROGRESS') {
      throw new ForbiddenException('진행 중인 세션에서만 튜터를 사용할 수 있습니다.');
    }

    const sq = await this.prisma.examSessionQuestion.findFirst({
      where: { examSessionId, questionId },
      select: { snapshot: true },
    });
    if (!sq) throw new NotFoundException('세션에 포함되지 않은 문항입니다.');

    return sq.snapshot as unknown as QuestionSnapshot;
  }

  // --- 레이트 리밋 ----------------------------------------------------

  /**
   * (user, session, question)당 1시간 30회. INCR 후 1이면 EXPIRE.
   * 30을 넘으면(31번째) 429. 헤더 전송 전에 검사한다.
   */
  private async enforceRateLimit(
    userId: string,
    examSessionId: string,
    questionId: string,
  ): Promise<void> {
    const key = `tutor:rate:${userId}:${examSessionId}:${questionId}`;
    // INCR과 EXPIRE를 Lua로 원자적으로 묶는다. INCR 직후 프로세스가 죽어도
    // 카운터가 TTL 없이 영구히 남는 창(→ 영구 차단)이 생기지 않게 한다.
    // 고정 창(fixed window) 유지: TTL이 없을 때만 EXPIRE를 걸어 매 호출마다 창을 연장하지 않는다.
    // EXPIRE ... NX는 Redis 7.0+ 전용이라 Railway/Aiven 버전을 보장할 수 없으므로 TTL<0 분기로 대체한다.
    const count = Number(
      await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(RATE_WINDOW_SEC)),
    );
    if (count > RATE_LIMIT) {
      throw new HttpException(
        '튜터 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // --- 히스토리 -------------------------------------------------------

  private historyKey(examSessionId: string, questionId: string): string {
    return `tutor:${examSessionId}:${questionId}`;
  }

  private async loadHistory(examSessionId: string, questionId: string): Promise<TutorTurn[]> {
    const raw = await this.redis.get(this.historyKey(examSessionId, questionId));
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
  private async appendTurns(
    examSessionId: string,
    questionId: string,
    prior: TutorTurn[],
    userText: string,
    modelText: string,
  ): Promise<void> {
    const next = trimTurns([
      ...prior,
      { role: 'user', text: userText },
      { role: 'model', text: modelText },
    ]);
    await this.redis.set(
      this.historyKey(examSessionId, questionId),
      JSON.stringify(next),
      'EX',
      HISTORY_TTL_SEC,
    );
  }
}
