import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { CreateVariantDto } from './dto/create-variant.dto';

/** question_variants — 원본↔변형 문제 관계 추적. */
@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 특정 문제와 연결된 변형 관계를 양방향으로 반환한다.
   * - derived: 이 문제를 원본으로 하는 변형들
   * - origins: 이 문제가 변형 결과인 원본들
   */
  async listForQuestion(questionId: string) {
    await this.assertQuestionExists(questionId);

    const [derived, origins] = await this.prisma.$transaction([
      this.prisma.questionVariant.findMany({
        where: { sourceQuestionId: questionId },
        orderBy: { createdAt: 'desc' },
        include: {
          variantQuestion: { select: { id: true, questionType: true, status: true, difficulty: true } },
        },
      }),
      this.prisma.questionVariant.findMany({
        where: { variantQuestionId: questionId },
        orderBy: { createdAt: 'desc' },
        include: {
          sourceQuestion: { select: { id: true, questionType: true, status: true, difficulty: true } },
        },
      }),
    ]);

    return { derived, origins };
  }

  /** 원본(source) → 변형(variant) 관계를 생성한다. */
  async create(sourceQuestionId: string, user: CurrentUserPayload, dto: CreateVariantDto) {
    if (sourceQuestionId === dto.variantQuestionId) {
      throw new BadRequestException('원본과 변형 문제가 같을 수 없습니다.');
    }
    await this.assertQuestionExists(sourceQuestionId);
    await this.assertQuestionExists(dto.variantQuestionId);

    try {
      return await this.prisma.questionVariant.create({
        data: {
          sourceQuestionId,
          variantQuestionId: dto.variantQuestionId,
          generationId: dto.generationId ?? null,
          requestedBy: user.id,
        },
        select: { id: true, createdAt: true },
      });
    } catch (err) {
      // UNIQUE(source, variant) 위반 → 이미 기록된 관계.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('이미 등록된 변형 관계입니다.');
      }
      throw err;
    }
  }

  /** 변형 관계 삭제 — 관계를 요청했던 사용자 또는 ADMIN만. */
  async remove(id: string, user: CurrentUserPayload) {
    const variant = await this.prisma.questionVariant.findUnique({
      where: { id },
      select: { requestedBy: true },
    });
    if (!variant) throw new NotFoundException('변형 관계를 찾을 수 없습니다.');
    if (variant.requestedBy !== user.id && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('이 변형 관계를 삭제할 권한이 없습니다.');
    }
    await this.prisma.questionVariant.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertQuestionExists(questionId: string): Promise<void> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
  }
}
