import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationQueryDto, PaginatedResult } from '@/common/dto/pagination.dto';
import { UpsertMemoDto } from './dto/upsert-memo.dto';

// Json 컬럼 쓰기용 국소 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

/** user_question_memos — 개인 비공개 메모. 모든 조회/변경은 본인 것으로만 스코프된다. */
@Injectable()
export class MemosService {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 메모 목록 — 최근 수정순. 문제 요약을 함께 반환한다. */
  async listMine(userId: string, query: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userQuestionMemo.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          question: { select: { id: true, questionType: true, primaryUnitId: true } },
        },
      }),
      this.prisma.userQuestionMemo.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  /** 특정 문제에 대한 내 메모(없으면 null). */
  async getForQuestion(userId: string, questionId: string) {
    return this.prisma.userQuestionMemo.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
  }

  /** 내 메모 저장/수정(upsert). */
  async upsert(userId: string, questionId: string, dto: UpsertMemoDto) {
    await this.assertQuestionExists(questionId);
    return this.prisma.userQuestionMemo.upsert({
      where: { userId_questionId: { userId, questionId } },
      create: {
        userId,
        questionId,
        content: dto.content ?? null,
        canvas: (dto.canvas ?? undefined) as JsonWritable,
      },
      update: {
        content: dto.content ?? null,
        canvas: (dto.canvas ?? undefined) as JsonWritable,
      },
      select: { id: true, updatedAt: true },
    });
  }

  /** 내 메모 삭제. */
  async remove(userId: string, questionId: string) {
    const memo = await this.prisma.userQuestionMemo.findUnique({
      where: { userId_questionId: { userId, questionId } },
      select: { id: true },
    });
    if (!memo) throw new NotFoundException('메모를 찾을 수 없습니다.');
    await this.prisma.userQuestionMemo.delete({
      where: { userId_questionId: { userId, questionId } },
    });
    return { questionId, deleted: true };
  }

  private async assertQuestionExists(questionId: string): Promise<void> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
  }
}
