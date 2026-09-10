import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { waitUntil } from '@vercel/functions';
import { PrismaService } from '@/prisma/prisma.service';
import { MailService } from '@/common/mail/mail.service';
import { extractPlainText } from '@/common/prosemirror/prosemirror.util';
import { buildCommentMail, resolveCommentRecipient } from './comment-notification';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

/** question_comments — Q&A 커뮤니티. 1-depth 대댓글 트리. (핀 고정은 MVP에서 제거) */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);
  /** 메일 링크의 프런트 주소. APP_URL이 없으면 ALLOWED_ORIGINS 첫 항목으로 떨어진다. */
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.appUrl = (
      config.get<string>('APP_URL') ||
      config.get<string>('ALLOWED_ORIGINS')?.split(',')[0]?.trim() ||
      'http://localhost:3001'
    ).replace(/\/$/, '');
  }

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

    const created = await this.prisma.questionComment.create({
      data: {
        questionId,
        authorId: userId,
        parentCommentId: dto.parentCommentId ?? null,
        content: dto.content,
      },
      select: { id: true, createdAt: true },
    });

    // 알림 메일은 응답을 막지 않는다. Vercel에선 함수가 응답 뒤 얼려지므로 waitUntil로 붙잡는다
    // (ai-generation과 같은 패턴). 실패는 로그만 — 댓글은 이미 저장됐다.
    if (this.mail.enabled) {
      waitUntil(this.notifyByEmail(created.id).catch((e) => this.logger.error('댓글 알림 메일 실패', e)));
    }
    return created;
  }

  /** 답글이면 부모 댓글 작성자, 최상위 댓글이면 출제자에게 — 옵트인한 사람에게만. */
  private async notifyByEmail(commentId: string): Promise<void> {
    const c = await this.prisma.questionComment.findUnique({
      where: { id: commentId },
      select: {
        content: true,
        authorId: true,
        author: { select: { nickname: true } },
        parent: { select: { author: { select: { id: true, email: true, notifyCommentEmail: true } } } },
        question: {
          select: { id: true, stem: true, creator: { select: { id: true, email: true, notifyCommentEmail: true } } },
        },
      },
    });
    if (!c) return;
    const recipient = resolveCommentRecipient({
      authorId: c.authorId,
      parentAuthor: c.parent?.author ?? null,
      questionCreator: c.question.creator ?? null,
    });
    if (!recipient) return;
    const mail = buildCommentMail({
      kind: recipient.kind,
      authorNickname: c.author.nickname,
      questionTitle: extractPlainText(c.question.stem as never) || '(제목 없음)',
      content: c.content,
      questionUrl: `${this.appUrl}/questions/${c.question.id}`,
      settingsUrl: `${this.appUrl}/me`,
    });
    await this.mail.send({ to: recipient.email, ...mail });
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
