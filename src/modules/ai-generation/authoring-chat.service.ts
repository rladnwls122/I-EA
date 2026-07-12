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
