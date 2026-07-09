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
  async list(dto: QueryWorkbookDto, userId: string): Promise<PaginatedResult<unknown>> {
    const subjectFilter = this.buildSubjectFilter(dto);

    const where: Prisma.WorkbookWhereInput = {
      OR: [{ visibility: 'PUBLIC' }, { ownerId: userId }],
      ...(dto.q ? { title: { contains: dto.q } } : {}),
      ...(subjectFilter
        ? { questions: { some: { question: { subject: subjectFilter } } } }
        : {}),
    };

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
    if (workbook.ownerId === userId) return withAvgScore(workbook);

    const { viewCount } = await this.prisma.workbook.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    // 증가된 값을 응답에 반영한다(별도 update라 위 스냅샷은 1 뒤처져 있다).
    return withAvgScore({ ...workbook, viewCount });
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
      },
      include: { owner: { select: OWNER_SELECT } },
    });
    return withAvgScore(created);
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

    return this.prisma.workbook.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.coverImageUrl !== undefined ? { coverImageUrl: dto.coverImageUrl } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
        ...(becomingPublic ? { publishedAt: new Date() } : {}),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.assertOwner(id, userId);
    await this.prisma.workbook.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- Pick & Mix ------------------------------------------------------

  /** 문항 담기. displayOrder 생략 시 맨 뒤에 붙인다. */
  async addQuestion(workbookId: string, dto: AddQuestionDto, userId: string) {
    await this.assertOwner(workbookId, userId);
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
      // 사본은 attemptCount/scoreSumPercent 기본값 0에서 시작한다 —
      // 원본의 응시 성적을 물려받지 않는다.
      return withAvgScore(copy);
    });
  }

  // --- 내부 헬퍼 --------------------------------------------------------

  /** 3단 분류 필터. 셋 다 없으면 undefined(필터 미적용). */
  private buildSubjectFilter(dto: QueryWorkbookDto): Prisma.SubjectWhereInput | undefined {
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

  private async assertOwner(id: string, userId: string): Promise<void> {
    const workbook = await this.prisma.workbook.findUnique({
      where: { id },
      select: { ownerId: true },
    });
    if (!workbook) throw new NotFoundException('문제집을 찾을 수 없습니다.');
    if (workbook.ownerId !== userId) {
      throw new ForbiddenException('본인 문제집만 수정할 수 있습니다.');
    }
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
