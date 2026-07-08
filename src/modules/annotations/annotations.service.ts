import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';
import { UpdateAnnotationDto } from './dto/update-annotation.dto';

// Json 컬럼 쓰기용 국소 캐스팅(생성 클라이언트가 InputJsonValue를 표면화하지 않음).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

/** user_question_annotations — 오답노트 2.0. 텍스트 앵커 주석(본인 전용, 문제당 다행). */
@Injectable()
export class AnnotationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 특정 문항에 대한 내 주석 목록(렌더 시 하이라이트 재적용용). */
  listForQuestion(userId: string, questionId: string) {
    return this.prisma.userQuestionAnnotation.findMany({
      where: { userId, questionId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(userId: string, questionId: string, dto: CreateAnnotationDto) {
    await this.assertQuestionExists(questionId);
    return this.prisma.userQuestionAnnotation.create({
      data: {
        userId,
        questionId,
        target: dto.target ?? 'STEM',
        targetId: dto.targetId ?? null,
        markStyle: dto.markStyle ?? 'HIGHLIGHT',
        color: dto.color ?? 'yellow',
        selectedText: dto.selectedText ?? null,
        selectionRange: (dto.selectionRange ?? undefined) as JsonWritable,
        reasonCode: dto.reasonCode ?? null,
        memoText: dto.memoText ?? null,
      },
      select: { id: true, createdAt: true },
    });
  }

  async update(userId: string, id: string, dto: UpdateAnnotationDto) {
    await this.assertOwner(userId, id);
    return this.prisma.userQuestionAnnotation.update({
      where: { id },
      data: {
        ...(dto.target !== undefined ? { target: dto.target } : {}),
        ...(dto.targetId !== undefined ? { targetId: dto.targetId ?? null } : {}),
        ...(dto.markStyle !== undefined ? { markStyle: dto.markStyle } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.selectedText !== undefined ? { selectedText: dto.selectedText ?? null } : {}),
        ...(dto.selectionRange !== undefined
          ? { selectionRange: (dto.selectionRange ?? undefined) as JsonWritable }
          : {}),
        ...(dto.reasonCode !== undefined ? { reasonCode: dto.reasonCode ?? null } : {}),
        ...(dto.memoText !== undefined ? { memoText: dto.memoText ?? null } : {}),
      },
      select: { id: true, updatedAt: true },
    });
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.userQuestionAnnotation.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertOwner(userId: string, id: string): Promise<void> {
    const a = await this.prisma.userQuestionAnnotation.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!a) throw new NotFoundException('주석을 찾을 수 없습니다.');
    if (a.userId !== userId) throw new ForbiddenException('본인 주석만 수정/삭제할 수 있습니다.');
  }

  private async assertQuestionExists(questionId: string): Promise<void> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
  }
}
