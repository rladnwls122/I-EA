import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpsertReviewDto } from './dto/upsert-review.dto';

/** question_reviews — 문제별 수험생 평점/리뷰. 사용자당 문제 1건(upsert). */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 문제별 리뷰 목록 + 평점 요약(평균/개수). */
  async listByQuestion(questionId: string) {
    const [reviews, agg] = await this.prisma.$transaction([
      this.prisma.questionReview.findMany({
        where: { questionId },
        orderBy: { createdAt: 'desc' },
        include: { reviewer: { select: { id: true, nickname: true } } },
      }),
      this.prisma.questionReview.aggregate({
        where: { questionId },
        _avg: { rating: true, perceivedDifficulty: true },
        _count: { _all: true },
      }),
    ]);

    return {
      summary: {
        averageRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
        averagePerceivedDifficulty: agg._avg.perceivedDifficulty
          ? Math.round(agg._avg.perceivedDifficulty * 10) / 10
          : null,
        count: agg._count._all,
      },
      items: reviews,
    };
  }

  /** 내 리뷰 생성 또는 수정. UNIQUE(question, reviewer) 위에서 upsert. */
  async upsert(questionId: string, reviewerId: string, dto: UpsertReviewDto) {
    await this.assertQuestionExists(questionId);

    return this.prisma.questionReview.upsert({
      where: { questionId_reviewerId: { questionId, reviewerId } },
      create: {
        questionId,
        reviewerId,
        rating: dto.rating,
        perceivedDifficulty: dto.perceivedDifficulty ?? null,
        reviewText: dto.reviewText ?? null,
      },
      update: {
        rating: dto.rating,
        perceivedDifficulty: dto.perceivedDifficulty ?? null,
        reviewText: dto.reviewText ?? null,
      },
      select: { id: true, rating: true, perceivedDifficulty: true, updatedAt: true },
    });
  }

  /** 내 리뷰 삭제. */
  async remove(id: string, reviewerId: string) {
    const review = await this.prisma.questionReview.findUnique({
      where: { id },
      select: { reviewerId: true },
    });
    if (!review) throw new NotFoundException('리뷰를 찾을 수 없습니다.');
    if (review.reviewerId !== reviewerId) throw new ForbiddenException('본인 리뷰만 삭제할 수 있습니다.');

    await this.prisma.questionReview.delete({ where: { id } });
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
