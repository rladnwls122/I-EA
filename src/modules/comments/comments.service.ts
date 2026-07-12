import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

/** question_comments — Q&A 커뮤니티. 1-depth 대댓글 트리. (핀 고정은 MVP에서 제거) */
@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 문제별 댓글 목록. 최신순으로 최상위 댓글을 뽑고,
   * 각 댓글의 답글을 오래된 순으로 중첩한다.
   */
  async listByQuestion(questionId: string) {
    const roots = await this.prisma.questionComment.findMany({
      where: { questionId, parentCommentId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, nickname: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, nickname: true } } },
        },
      },
    });
    return roots;
  }

  async create(questionId: string, userId: string, dto: CreateCommentDto) {
    await this.assertQuestionExists(questionId);

    // 대댓글은 같은 문제의 최상위 댓글에만 달 수 있다(2-depth 이상 금지).
    if (dto.parentCommentId) {
      const parent = await this.prisma.questionComment.findUnique({
        where: { id: dto.parentCommentId },
        select: { questionId: true, parentCommentId: true },
      });
      if (!parent || parent.questionId !== questionId) {
        throw new NotFoundException('부모 댓글을 찾을 수 없습니다.');
      }
      if (parent.parentCommentId) {
        throw new ForbiddenException('답글에는 다시 답글을 달 수 없습니다.');
      }
    }

    return this.prisma.questionComment.create({
      data: {
        questionId,
        authorId: userId,
        parentCommentId: dto.parentCommentId ?? null,
        content: dto.content,
      },
      select: { id: true, createdAt: true },
    });
  }

  async update(id: string, userId: string, dto: UpdateCommentDto) {
    await this.assertAuthor(id, userId);
    return this.prisma.questionComment.update({
      where: { id },
      data: { content: dto.content },
      select: { id: true, updatedAt: true },
    });
  }

  async remove(id: string, userId: string) {
    await this.assertAuthor(id, userId);
    // relationMode="prisma"(TiDB — FK 미지원)라 자기참조 캐스케이드를 DB가 못 해준다.
    // 1-depth 트리라 직접 답글부터 지우면 된다(과거 onDelete:Cascade와 동일 효과).
    await this.prisma.$transaction([
      this.prisma.questionComment.deleteMany({ where: { parentCommentId: id } }),
      this.prisma.questionComment.delete({ where: { id } }),
    ]);
    return { id, deleted: true };
  }

  // --- 헬퍼 -----------------------------------------------------------

  private async assertQuestionExists(questionId: string): Promise<void> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
  }

  private async assertAuthor(id: string, userId: string): Promise<void> {
    const comment = await this.prisma.questionComment.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');
    if (comment.authorId !== userId) throw new ForbiddenException('본인 댓글만 수정/삭제할 수 있습니다.');
  }
}
