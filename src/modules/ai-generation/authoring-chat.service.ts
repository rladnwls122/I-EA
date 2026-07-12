import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import Redis from 'ioredis';
import { PrismaService } from '@/prisma/prisma.service';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { KEYWORD_TAG_CATEGORY } from '@/common/constants/question';
import { GeminiLlmService } from './llm/gemini-llm.service';
import type { TutorTurn } from './llm/llm.types';
import { AuthoringChatDto } from './dto/authoring-chat.dto';
import { buildAuthoringSystemPrompt } from './authoring-chat.prompt';

/** 최근 유지 턴 수 상한(user/model 합산). */
const MAX_TURNS = 20;
/** 히스토리 총 문자 수 상한. 넘으면 오래된 턴부터 버린다(tutor.service.ts와 동일 패턴). */
const MAX_CHARS = 12_000;
const HISTORY_TTL_SEC = 60 * 60 * 6; // 6시간
/** 레이트 리밋: (user, workbook)당 1시간 60회. 배치 출제라 튜터(30)보다 넉넉하게 잡는다. */
const RATE_LIMIT = 60;
const RATE_WINDOW_SEC = 3_600;

/**
 * 레이트 리밋 카운터를 원자적으로 증가시키는 Lua 스크립트.
 * INCR 후 TTL이 없을 때(=창 최초 생성)만 EXPIRE를 건다(tutor.service.ts와 동일).
 */
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * 저장 시점에 히스토리를 자른다.
 * (1) 최근 MAX_TURNS턴만 유지 → (2) 총 문자 수가 MAX_CHARS를 넘으면 오래된 턴부터 버린다.
 */
export function trimAuthoringTurns(turns: TutorTurn[]): TutorTurn[] {
  let result = turns.slice(-MAX_TURNS);
  const totalChars = (): number => result.reduce((sum, t) => sum + t.text.length, 0);
  while (result.length > 1 && totalChars() > MAX_CHARS) {
    result = result.slice(1);
  }
  return result;
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
    // 2) 레이트 리밋 — 역시 헤더 전송 전에.
    await this.enforceRateLimit(userId, dto.workbookId);

    // 3) 컨텍스트 + 히스토리
    const system = buildAuthoringSystemPrompt({
      subjectName: subject?.name,
      examCategory: subject?.examCategory,
      batchSize: dto.batchSize ?? 1,
      questionType: dto.questionType,
      ox: dto.ox,
      difficulty: dto.difficulty,
      currentQuestions: dto.currentQuestions,
      existingKeywords: await this.fetchExistingKeywords(),
    });
    const history = await this.loadHistory(dto.workbookId);

    // 4) 첫 델타를 헤더 전송 전에 당겨온다.
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
      if (!full) {
        // 델타가 하나도 없이 끝난 스트림 — 안전 차단·업스트림 중단 등. done으로
        // 조용히 끝내면 클라이언트가 "빈 응답"의 원인을 알 수 없으므로 error로 알린다.
        // (원인 상세는 GeminiLlmService가 blockReason/finishReason을 서버 로그에 남긴다)
        this.logger.warn('출제 채팅 스트림이 델타 없이 종료됨 — Gemini 로그를 확인하세요.');
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'AI 응답이 비어 있어요. 잠시 후 다시 시도해주세요.' })}\n\n`,
        );
        return;
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

  /**
   * (user, workbook)당 1시간 60회. INCR 후 1이면 EXPIRE.
   * 60을 넘으면(61번째) 429. 헤더 전송 전에 검사한다(tutor.service.ts와 동일 패턴).
   */
  private async enforceRateLimit(userId: string, workbookId: string): Promise<void> {
    const key = `authoring:rate:${userId}:${workbookId}`;
    const count = Number(
      await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(RATE_WINDOW_SEC)),
    );
    if (count > RATE_LIMIT) {
      throw new HttpException(
        '출제 채팅 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * 기존 #키워드 풀(태그명) — 상한 60개. 프롬프트에 실어 LLM이 같은 개념엔
   * 같은 키워드를 재사용하게 유도한다(오답노트 개념별 통계가 모이도록).
   */
  private async fetchExistingKeywords(): Promise<string[]> {
    const tags = await this.prisma.tag.findMany({
      where: { category: KEYWORD_TAG_CATEGORY },
      orderBy: { name: 'asc' },
      take: 60,
      select: { name: true },
    });
    return tags.map((t) => t.name);
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
