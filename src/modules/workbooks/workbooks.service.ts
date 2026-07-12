import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';
import { PaginatedResult } from '@/common/dto/pagination.dto';
import {
  AUTHOR_PUBLISH_REWARD,
  resolveAuthorRewardQuota,
  rollForkCoins,
} from '@/common/constants/shop';
import { levelForXp, XP_REASON } from '@/common/constants/xp';
import {
  AddQuestionDto,
  CreateWorkbookDto,
  QueryWorkbookDto,
  UpdateWorkbookDto,
} from './dto/workbook.dto';

/** 카드 목록에 싣는 소유자 정보(민감 정보 제외). */
const OWNER_SELECT = { id: true, nickname: true } as const;

/** 평균 점수 캐시(합계/횟수)를 카드용 평균값으로 환산한다. 표본 0이면 null. */
function toAvgScorePercent(attemptCount: number, scoreSumPercent: Prisma.Decimal): number | null {
  if (attemptCount <= 0) return null;
  return Math.round((scoreSumPercent.toNumber() / attemptCount) * 10) / 10;
}

/** 원시 캐시 컬럼을 감추고 파생값만 노출한다(프론트가 나눗셈하지 않도록). */
function withAvgScore<T extends { attemptCount: number; scoreSumPercent: Prisma.Decimal }>(
  workbook: T,
): Omit<T, 'scoreSumPercent'> & { avgScorePercent: number | null } {
  const { scoreSumPercent, ...rest } = workbook;
  return { ...rest, avgScorePercent: toAvgScorePercent(workbook.attemptCount, scoreSumPercent) };
}

/** workbookTags(M:N 조인 행) → tag 배열. questions.service의 questionTags 매핑과 같은 패턴. */
function withTags<T extends { workbookTags: { tag: unknown }[] }>(
  workbook: T,
): Omit<T, 'workbookTags'> & { tags: unknown[] } {
  const { workbookTags, ...rest } = workbook;
  return { ...rest, tags: workbookTags.map((wt) => wt.tag) };
}

/**
 * workbooks — 문제집 탐색 / Pick & Mix / 포킹.
 *
 * 포킹은 2종이다:
 *   - 통째 복제 : workbooks.forkedFromId
 *   - 문항 단위 : workbookQuestions.sourceWorkbookId
 *
 * 담기(Pick)는 문항을 "참조"한다(복사 아님). 원저자의 수정이 전파되지만,
 * 응시는 exam_session_questions.snapshot이 조립 시점에 복사하므로 안전하다.
 */
@Injectable()
export class WorkbooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly examSessions: ExamSessionsService,
  ) {}

  // --- 탐색 -----------------------------------------------------------

  /**
   * 문제집 목록. 공개(PUBLIC) + 내 문제집만 보인다.
   * 3단 분류 필터는 "그 분류의 문항을 하나라도 포함하는 문제집"으로 해석한다
   * (문제집은 여러 소분류를 섞을 수 있으므로 문제집 자체에는 분류가 없다).
   */
  async list(dto: QueryWorkbookDto, userId: string | null): Promise<PaginatedResult<unknown>> {
    const subjectFilter = this.buildSubjectFilter(dto);

    const base: Prisma.WorkbookWhereInput = {
      ...(dto.q ? { title: { contains: dto.q } } : {}),
      ...(subjectFilter
        ? { questions: { some: { question: { subject: subjectFilter } } } }
        : {}),
    };

    // mine=true — "내 문제집" 페이지: 공개 여부 무관하게 내 것만.
    // mine=false — "탐색" 페이지: 소유자 무관하게 공개(PUBLIC)만. 예전엔 내 비공개
    // 문제집까지 탐색 목록에 섞여 나와 "탐색"과 "내 문제집"의 목적이 불분명했다.
    const where: Prisma.WorkbookWhereInput = dto.mine
      ? { ...base, ownerId: userId ?? '__none__' }
      : { ...base, visibility: 'PUBLIC' };

    const orderBy: Prisma.WorkbookOrderByWithRelationInput =
      dto.sort === 'recent' ? { createdAt: 'desc' } : { viewCount: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workbook.findMany({
        where,
        orderBy,
        skip: dto.skip,
        take: dto.limit,
        include: { owner: { select: OWNER_SELECT } },
      }),
      this.prisma.workbook.count({ where }),
    ]);

    return { items: items.map(withAvgScore), total, page: dto.page, limit: dto.limit };
  }

  /** 문제집 상세 + 문항 리스트(순서 보존). 조회수는 여기서 증가한다. */
  async findOne(id: string, userId: string) {
    const workbook = await this.prisma.workbook.findUnique({
      where: { id },
      include: {
        owner: { select: OWNER_SELECT },
        workbookTags: { include: { tag: { select: { id: true, name: true, category: true } } } },
        questions: {
          orderBy: { displayOrder: 'asc' },
          include: {
            question: {
              select: {
                id: true,
                questionType: true,
                stem: true,
                difficulty: true,
                status: true,
                totalSolvedCount: true,
                correctSolvedCount: true,
                subject: { select: { id: true, name: true, examCategory: true, examType: true } },
              },
            },
          },
        },
      },
    });
    if (!workbook) throw new NotFoundException('문제집을 찾을 수 없습니다.');
    this.assertCanRead(workbook, userId);

    // 소유자가 자기 문제집을 여는 건 조회로 세지 않는다.
    // (편집하며 여러 번 열면 인기순 정렬이 자기 문제집으로 오염된다.)
    if (workbook.ownerId === userId) return withAvgScore(withTags(workbook));

    const { viewCount } = await this.prisma.workbook.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    // 증가된 값을 응답에 반영한다(별도 update라 위 스냅샷은 1 뒤처져 있다).
    return withAvgScore(withTags({ ...workbook, viewCount }));
  }

  // --- 생성 / 수정 / 삭제 ----------------------------------------------

  /** 문제집 생성. questionIds가 오면 장바구니를 한 번에 담는다(순서 보존). */
  async create(dto: CreateWorkbookDto, ownerId: string) {
    const questionIds = dto.questionIds ?? [];
    if (questionIds.length) await this.assertQuestionsPublished(questionIds);

    const created = await this.prisma.workbook.create({
      data: {
        ownerId,
        title: dto.title,
        description: dto.description ?? null,
        coverImageUrl: dto.coverImageUrl ?? null,
        visibility: dto.visibility ?? 'PRIVATE',
        questionCount: questionIds.length,
        questions: {
          create: questionIds.map((questionId, i) => ({ questionId, displayOrder: i })),
        },
        ...(dto.tagIds?.length
          ? { workbookTags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: {
        owner: { select: OWNER_SELECT },
        workbookTags: { include: { tag: { select: { id: true, name: true, category: true } } } },
      },
    });
    return withAvgScore(withTags(created));
  }

  async update(id: string, dto: UpdateWorkbookDto, userId: string) {
    await this.assertOwner(id, userId);

    // PRIVATE → PUBLIC 전환 시점을 발행으로 본다(최초 1회만 기록).
    const current = await this.prisma.workbook.findUniqueOrThrow({
      where: { id },
      select: { visibility: true, publishedAt: true },
    });
    const becomingPublic =
      dto.visibility === 'PUBLIC' && current.visibility !== 'PUBLIC' && !current.publishedAt;

    // becomingPublic이면 문항 저자 보상 지급까지 한 트랜잭션으로 묶어야 원자적이다
    // (문제집은 공개됐는데 보상만 누락되는 상황을 막는다).
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.workbook.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl } : {}),
          ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
          ...(becomingPublic ? { publishedAt: new Date() } : {}),
          // tagIds가 오면 전체 교체(문항 tagIds와 같은 규약) — 부분 추가/제거가 아니다.
          ...(dto.tagIds !== undefined
            ? { workbookTags: { deleteMany: {}, create: dto.tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        include: {
          workbookTags: { include: { tag: { select: { id: true, name: true, category: true } } } },
        },
      });

      // PRIVATE → PUBLIC 최초 전환: 안의 모든 문항 저자에게 발행 보상(캡 초과분은 헬퍼가 알아서 무보상).
      if (becomingPublic) {
        const questions = await tx.workbookQuestion.findMany({
          where: { workbookId: id },
          select: { question: { select: { creatorId: true } } },
        });
        const now = new Date();
        for (const wq of questions) {
          await this.awardPublishReward(tx, wq.question.creatorId, id, now);
        }
      }

      return result;
    });
    return withTags(updated);
  }

  /**
   * relationMode="prisma"(TiDB용 — DB가 FK를 못 만들어 앱단에서 참조 무결성을 관리한다)라서
   * 이 문제집을 참조하는 행들을 DB가 자동으로 지우거나 null로 비워주지 않는다.
   * 예전 FK CASCADE/SET NULL과 같은 효과를 트랜잭션으로 직접 흉내낸다.
   */
  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);
    await this.prisma.$transaction([
      this.prisma.workbookQuestion.deleteMany({ where: { workbookId: id } }),
      this.prisma.workbookTag.deleteMany({ where: { workbookId: id } }),
      this.prisma.workbookQuestion.updateMany({
        where: { sourceWorkbookId: id },
        data: { sourceWorkbookId: null },
      }),
      this.prisma.workbook.updateMany({
        where: { forkedFromId: id },
        data: { forkedFromId: null },
      }),
      this.prisma.examSession.updateMany({
        where: { workbookId: id },
        data: { workbookId: null },
      }),
      this.prisma.workbook.delete({ where: { id } }),
    ]);
    return { id, deleted: true };
  }

  // --- Pick & Mix ------------------------------------------------------

  /** 문항 담기. displayOrder 생략 시 맨 뒤에 붙인다. */
  async addQuestion(workbookId: string, dto: AddQuestionDto, userId: string) {
    const workbook = await this.assertOwner(workbookId, userId);
    await this.assertQuestionsPublished([dto.questionId]);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let displayOrder: number;

        if (dto.displayOrder === undefined) {
          // 맨 뒤에 붙인다. 비어 있으면 0.
          const max = (
            await tx.workbookQuestion.aggregate({
              where: { workbookId },
              _max: { displayOrder: true },
            })
          )._max.displayOrder;
          displayOrder = (max ?? -1) + 1;
        } else {
          // 중간 삽입: 그 자리 이후를 한 칸씩 밀어내야 순서가 중복되지 않는다.
          displayOrder = dto.displayOrder;
          await tx.workbookQuestion.updateMany({
            where: { workbookId, displayOrder: { gte: displayOrder } },
            data: { displayOrder: { increment: 1 } },
          });
        }

        const row = await tx.workbookQuestion.create({
          data: {
            workbookId,
            questionId: dto.questionId,
            displayOrder,
            sourceWorkbookId: dto.sourceWorkbookId ?? null,
          },
        });
        await tx.workbook.update({
          where: { id: workbookId },
          data: { questionCount: { increment: 1 } },
        });

        // 대상 문제집이 이미 공개 상태면, 담기는 그 즉시 "발행"과 같다 — 문항 저자에게 보상.
        if (workbook.visibility === 'PUBLIC') {
          const question = await tx.question.findUnique({
            where: { id: dto.questionId },
            select: { creatorId: true },
          });
          if (question) {
            await this.awardPublishReward(tx, question.creatorId, workbookId, new Date());
          }
        }

        return row;
      });
    } catch (e) {
      // 복합 PK(workbookId, questionId) 위반 — 이미 담긴 문항.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('이미 담긴 문항입니다.');
      }
      throw e;
    }
  }

  async removeQuestion(workbookId: string, questionId: string, userId: string) {
    await this.assertOwner(workbookId, userId);

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.workbookQuestion.deleteMany({
        where: { workbookId, questionId },
      });
      if (count === 0) throw new NotFoundException('문제집에 없는 문항입니다.');

      await tx.workbook.update({
        where: { id: workbookId },
        data: { questionCount: { decrement: count } },
      });
      return { workbookId, questionId, deleted: true };
    });
  }

  /**
   * 문항 순서 재배열. 전체 순서를 통째로 받는다.
   *
   * 넘어온 집합이 현재 문제집의 문항 집합과 정확히 일치해야 한다.
   * 빠진 문항이 있으면 그 문항의 순서가 미정이 되고, 없는 문항이 있으면
   * 조용히 무시되므로 — 둘 다 400으로 거부한다.
   */
  async reorderQuestions(workbookId: string, questionIds: string[], userId: string) {
    await this.assertOwner(workbookId, userId);

    const current = await this.prisma.workbookQuestion.findMany({
      where: { workbookId },
      select: { questionId: true },
    });
    const currentIds = new Set(current.map((r) => r.questionId));
    const nextIds = new Set(questionIds);

    if (nextIds.size !== questionIds.length) {
      throw new BadRequestException('중복된 문항 ID가 있습니다.');
    }
    const missing = [...currentIds].filter((id) => !nextIds.has(id));
    const unknown = questionIds.filter((id) => !currentIds.has(id));
    if (missing.length || unknown.length) {
      throw new BadRequestException(
        '문제집의 전체 문항 순서를 빠짐없이 보내야 합니다. ' +
          `누락: [${missing.join(', ')}] / 문제집에 없음: [${unknown.join(', ')}]`,
      );
    }

    await this.prisma.$transaction(
      questionIds.map((questionId, displayOrder) =>
        this.prisma.workbookQuestion.update({
          where: { workbookId_questionId: { workbookId, questionId } },
          data: { displayOrder },
        }),
      ),
    );

    return { workbookId, questionIds };
  }

  /**
   * 문제집 바로 풀기. 문항을 displayOrder 순서로 세션에 실어 보낸다.
   *
   * 담기는 "참조"라 원저자가 문항을 ARCHIVED 처리하면 문제집에 죽은 문항이 남는다.
   * 그렇다고 세션 조립을 통째로 막으면 문제집 하나가 통으로 못 풀리게 된다.
   * → 발행된 문항으로만 세션을 만들되, **제외된 문항을 응답에 명시**한다.
   *   (조용히 버리지 않는다 — 사용자가 짧아진 시험의 이유를 알 수 있어야 한다.)
   */
  async startSession(workbookId: string, userId: string) {
    const workbook = await this.prisma.workbook.findUnique({
      where: { id: workbookId },
      select: {
        ownerId: true,
        visibility: true,
        questions: {
          orderBy: { displayOrder: 'asc' },
          select: { questionId: true, question: { select: { status: true } } },
        },
      },
    });
    if (!workbook) throw new NotFoundException('문제집을 찾을 수 없습니다.');
    this.assertCanRead(workbook, userId);

    const playable: string[] = [];
    const skippedQuestionIds: string[] = [];
    for (const wq of workbook.questions) {
      (wq.question.status === 'PUBLISHED' ? playable : skippedQuestionIds).push(wq.questionId);
    }

    if (playable.length === 0) {
      throw new BadRequestException('풀 수 있는(발행된) 문항이 없습니다.');
    }

    const session = await this.examSessions.create(userId, {
      questionIds: playable,
      workbookId,
    });

    return { ...session, skippedQuestionIds };
  }

  // --- 포킹 (통째 복제) --------------------------------------------------

  /**
   * 문제집을 통째로 내 것으로 복제한다.
   * 문항은 복사하지 않고 참조만 옮긴다. 각 행의 sourceWorkbookId는 원본을 가리킨다.
   * 사본은 항상 PRIVATE로 시작한다.
   */
  async fork(id: string, userId: string) {
    const source = await this.prisma.workbook.findUnique({
      where: { id },
      include: { questions: { orderBy: { displayOrder: 'asc' } } },
    });
    if (!source) throw new NotFoundException('문제집을 찾을 수 없습니다.');
    this.assertCanRead(source, userId);

    return this.prisma.$transaction(async (tx) => {
      const copy = await tx.workbook.create({
        data: {
          ownerId: userId,
          title: `${source.title} (사본)`,
          description: source.description,
          coverImageUrl: source.coverImageUrl,
          visibility: 'PRIVATE',
          forkedFromId: source.id,
          questionCount: source.questions.length,
          questions: {
            create: source.questions.map((q, i) => ({
              questionId: q.questionId,
              displayOrder: i,
              sourceWorkbookId: source.id,
            })),
          },
        },
        include: { owner: { select: OWNER_SELECT } },
      });

      await tx.workbook.update({
        where: { id: source.id },
        data: { forkCount: { increment: 1 } },
      });

      // 원작자에게 포크 보상. 본인 문제집을 본인이 포크한 경우(셀프 포크)는 무지급.
      if (source.ownerId !== userId) {
        await this.awardForkReward(tx, source.ownerId, copy.id);
      }

      // 사본은 attemptCount/scoreSumPercent 기본값 0에서 시작한다 —
      // 원본의 응시 성적을 물려받지 않는다.
      return withAvgScore(copy);
    });
  }

  // --- 내부 헬퍼 --------------------------------------------------------

  /** 3단 분류 필터. 셋 다 없으면 undefined(필터 미적용). */
  private buildSubjectFilter(dto: QueryWorkbookDto): Prisma.SubjectWhereInput | undefined {
    if (dto.subjectIds?.length) return { id: { in: dto.subjectIds } };
    if (dto.subjectId) return { id: dto.subjectId };
    if (!dto.examType && !dto.examCategory) return undefined;
    return {
      ...(dto.examType ? { examType: dto.examType } : {}),
      ...(dto.examCategory ? { examCategory: dto.examCategory } : {}),
    };
  }

  /** PUBLIC이거나 내 것이어야 읽을 수 있다. */
  private assertCanRead(workbook: { visibility: string; ownerId: string }, userId: string): void {
    if (workbook.visibility !== 'PUBLIC' && workbook.ownerId !== userId) {
      throw new ForbiddenException('비공개 문제집입니다.');
    }
  }

  /**
   * 소유자 검증. visibility도 함께 돌려준다 — addQuestion이 "이미 공개된 문제집에
   * 담기 = 즉시 발행"을 판정할 때 별도 조회 없이 재사용한다(다른 호출부는 반환값을 무시해도 무방).
   */
  private async assertOwner(id: string, userId: string): Promise<{ ownerId: string; visibility: string }> {
    const workbook = await this.prisma.workbook.findUnique({
      where: { id },
      select: { ownerId: true, visibility: true },
    });
    if (!workbook) throw new NotFoundException('문제집을 찾을 수 없습니다.');
    if (workbook.ownerId !== userId) {
      throw new ForbiddenException('본인 문제집만 수정할 수 있습니다.');
    }
    return workbook;
  }

  /**
   * 공개 문제집에 문항이 포함되는 순간(=발행) 문항 저자에게 +20 EXP·+20 코인.
   * 하루 캡(AUTHOR_PUBLISH_DAILY_CAP)을 넘기면 아무것도 하지 않는다.
   *
   * EXP 지급은 exam-sessions.service.ts의 awardXp/awardForSubmit과 동일한 메커니즘을 재사용한다:
   *   xp를 증가시키고 xp에서 level을 다시 계산해 저장(User.level은 파생값이지만 캐시 컬럼),
   *   xp_history에 원장 1행을 남긴다. 단, 그 메서드들이 함께 하는 마일스톤(milestone_achievements)
   *   재계산은 여기서는 하지 않는다 — 저자 보상은 세션 제출/자기채점과 달리 스트릭·콤보 문맥이 없어
   *   묶어서 재사용하기보다 최소 구현으로 남기고, 필요해지면 별도로 붙인다.
   */
  private async awardPublishReward(
    tx: Prisma.TransactionClient,
    authorUserId: string,
    referenceId: string,
    now: Date,
  ): Promise<{ rewarded: boolean }> {
    const user = await tx.user.findUnique({
      where: { id: authorUserId },
      select: { coins: true, xp: true, authorRewardDate: true, authorRewardCount: true },
    });
    if (!user) return { rewarded: false };

    const quota = resolveAuthorRewardQuota(user.authorRewardDate, user.authorRewardCount, now);
    if (!quota.allow) return { rewarded: false };

    const nextXp = (user.xp ?? 0) + AUTHOR_PUBLISH_REWARD.exp;
    const updatedUser = await tx.user.update({
      where: { id: authorUserId },
      data: {
        coins: { increment: AUTHOR_PUBLISH_REWARD.coins },
        xp: { increment: AUTHOR_PUBLISH_REWARD.exp },
        level: levelForXp(nextXp),
        authorRewardDate: now,
        authorRewardCount: quota.newCount,
      },
      select: { coins: true, xp: true },
    });

    await tx.coinHistory.create({
      data: {
        userId: authorUserId,
        amount: AUTHOR_PUBLISH_REWARD.coins,
        reason: 'AUTHOR_PUBLISH',
        referenceId,
        balanceAfter: updatedUser.coins,
      },
    });
    await tx.xpHistory.create({
      data: {
        userId: authorUserId,
        amount: AUTHOR_PUBLISH_REWARD.exp,
        reason: XP_REASON.AUTHOR_PUBLISH,
        balanceAfter: updatedUser.xp,
      },
    });

    return { rewarded: true };
  }

  /**
   * 문제집이 포크될 때 원본 소유자에게 +5~10 코인.
   * awardPublishReward와 달리 하루 캡·EXP는 없다(단순 코인 보상).
   */
  private async awardForkReward(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
    forkWorkbookId: string,
    rng: () => number = Math.random,
  ): Promise<void> {
    const amount = rollForkCoins(rng);
    const updatedUser = await tx.user.update({
      where: { id: ownerUserId },
      data: { coins: { increment: amount } },
      select: { coins: true },
    });

    await tx.coinHistory.create({
      data: {
        userId: ownerUserId,
        amount,
        reason: 'WORKBOOK_FORK',
        referenceId: forkWorkbookId,
        balanceAfter: updatedUser.coins,
      },
    });
  }

  /** 담기 대상은 발행된 문항이어야 한다. 존재하지 않거나 미발행이면 거부. */
  private async assertQuestionsPublished(questionIds: string[]): Promise<void> {
    const found = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (found.length !== new Set(questionIds).size) {
      throw new NotFoundException('발행되지 않았거나 존재하지 않는 문항이 포함되어 있습니다.');
    }
  }
}
