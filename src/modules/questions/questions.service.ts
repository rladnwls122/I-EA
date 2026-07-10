import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginatedResult } from '@/common/dto/pagination.dto';
import { STATS_MIN_SAMPLE } from '@/common/constants/question';
import { extractPlainText, PMNode } from '@/common/prosemirror/prosemirror.util';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionDto } from './dto/query-question.dto';
import { RegenerateChoicesDto } from './dto/regenerate-choices.dto';

// Prisma 생성 클라이언트가 InputJsonValue를 표면화하지 않으므로 Json 컬럼 쓰기 시 국소 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: GeminiLlmService,
  ) {}

  /** 문제 은행 목록 — 단원/상태/유형/난이도/태그/검색어 필터 + 페이지네이션. */
  async list(query: QueryQuestionDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.QuestionWhereInput = {
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.questionType ? { questionType: query.questionType } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.q ? { searchText: { contains: query.q } } : {}),
      // 태그 AND 매칭: 지정한 모든 태그를 가진 문제만.
      ...(query.tagIds?.length
        ? { AND: query.tagIds.map((tagId) => ({ questionTags: { some: { tagId } } })) }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.question.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        // 인기순(popular) = 누적 조회수 내림차순, 기본(latest) = 최신순.
        orderBy: query.sort === 'popular' ? { viewCount: 'desc' } : { createdAt: 'desc' },
        select: {
          id: true,
          questionType: true,
          difficulty: true,
          points: true,
          status: true,
          subjectId: true,
          totalSolvedCount: true,
          correctSolvedCount: true,
          viewCount: true,
          createdAt: true,
          publishedAt: true,
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  /** 단건 상세 — 콘텐츠 전체 + 태그 + 지문 + 평점 요약. 조회 시 view_count를 1 증가시킨다. */
  async getById(id: string) {
    // 조회수 캐시를 증가시키면서 증가된 레코드를 그대로 받아온다(단일 쿼리).
    const question = await this.prisma.question
      .update({
        where: { id },
        data: { viewCount: { increment: 1 } },
        include: {
          subject: { select: { id: true, name: true, examCategory: true, examType: true } },
          passage: { select: { id: true, status: true } },
          questionTags: { include: { tag: { select: { id: true, name: true, category: true } } } },
          mediaAssets: { select: { id: true, assetType: true, storageUrl: true } },
          _count: { select: { reviews: true, comments: true } },
        },
      })
      .catch((e: unknown) => {
        // 존재하지 않는 ID면 P2025 → 404로 변환, 그 외 에러는 그대로 전파.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null;
        throw e;
      });
    if (!question) throw new NotFoundException('문제를 찾을 수 없습니다.');

    const correctRate =
      question.totalSolvedCount > 0
        ? Math.round((question.correctSolvedCount / question.totalSolvedCount) * 1000) / 10
        : null;

    return {
      ...question,
      tags: question.questionTags.map((qt) => qt.tag),
      correctRatePercent: correctRate,
    };
  }

  /** 문항 직접 생성(DRAFT). tagIds가 있으면 question_tags도 함께 매핑한다. */
  async create(creatorId: string, dto: CreateQuestionDto) {
    await this.assertSubjectExists(dto.subjectId);

    return this.prisma.question.create({
      data: {
        creatorId,
        subjectId: dto.subjectId,
        passageId: dto.passageId ?? null,
        questionType: dto.questionType,
        stem: dto.stem as JsonWritable,
        ...(dto.choices ? { choices: dto.choices as JsonWritable } : {}),
        ...(dto.explanation ? { explanation: dto.explanation as JsonWritable } : {}),
        ...(dto.correctAnswerText !== undefined ? { correctAnswerText: dto.correctAnswerText } : {}),
        ...(dto.metadata ? { metadata: dto.metadata as JsonWritable } : {}),
        ...(dto.hintContent !== undefined ? { hintContent: dto.hintContent } : {}),
        difficulty: dto.difficulty ?? 3,
        points: dto.points ?? 1,
        status: 'DRAFT',
        searchText: this.buildSearchText(dto),
        ...(dto.tagIds?.length
          ? { questionTags: { create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      select: { id: true, status: true, createdAt: true },
    });
  }

  /** 부분 수정 — 작성자 본인만. 태그가 오면 전체 교체(set) 방식. */
  async update(id: string, userId: string, dto: UpdateQuestionDto) {
    const existing = await this.assertOwner(id, userId);

    // 콘텐츠가 바뀌면 search_text도 다시 계산(부분 필드만 온 경우 기존 값과 병합).
    const contentChanged =
      dto.stem !== undefined ||
      dto.choices !== undefined ||
      dto.explanation !== undefined ||
      dto.correctAnswerText !== undefined;
    const searchText = contentChanged
      ? this.buildSearchText({
          stem: (dto.stem ?? existing.stem) as Record<string, unknown>,
          choices: (dto.choices ?? existing.choices) as Array<Record<string, unknown>> | undefined,
          explanation: (dto.explanation ?? existing.explanation) as
            | Array<Record<string, unknown>>
            | undefined,
          correctAnswerText: dto.correctAnswerText ?? existing.correctAnswerText,
        })
      : undefined;

    // 선지를 건드리면 누적 통계가 오염된다(선지 id는 문항 로컬 문자열이라
    // 재배열/교체 시 "3번에 낚였다"가 다른 선지를 가리키게 된다).
    // 규칙: choices가 본문에 오면 집계 캐시를 전부 리셋한다.
    // 발문/해설만 바꾸는 수정은 통계를 보존한다.
    const resetStats = dto.choices !== undefined;

    return this.prisma.$transaction(async (tx) => {
      if (resetStats) {
        await tx.questionChoiceStat.deleteMany({ where: { questionId: id } });
      }

      return tx.question.update({
        where: { id },
        data: {
          ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
          ...(dto.passageId !== undefined ? { passageId: dto.passageId ?? null } : {}),
          ...(dto.questionType ? { questionType: dto.questionType } : {}),
          ...(dto.stem !== undefined ? { stem: dto.stem as JsonWritable } : {}),
          ...(dto.choices !== undefined ? { choices: dto.choices as JsonWritable } : {}),
          ...(dto.explanation !== undefined ? { explanation: dto.explanation as JsonWritable } : {}),
          ...(dto.correctAnswerText !== undefined
            ? { correctAnswerText: dto.correctAnswerText }
            : {}),
          ...(dto.metadata !== undefined ? { metadata: dto.metadata as JsonWritable } : {}),
          ...(dto.hintContent !== undefined ? { hintContent: dto.hintContent } : {}),
          ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
          ...(dto.points !== undefined ? { points: dto.points } : {}),
          ...(searchText !== undefined ? { searchText } : {}),
          // 집계 캐시만 0으로. exam_session_answers 원본 응답과
          // exam_session_questions.snapshot은 건드리지 않으므로 과거 응시 기록은 그대로다.
          ...(resetStats
            ? {
                totalSolvedCount: 0,
                correctSolvedCount: 0,
                totalTimeSpentSec: 0,
                timedSolvedCount: 0,
              }
            : {}),
          // 태그 전체 교체
          ...(dto.tagIds
            ? { questionTags: { deleteMany: {}, create: dto.tagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        select: { id: true, updatedAt: true },
      });
    });
  }

  /** DRAFT/IN_REVIEW → PUBLISHED. 발행 시각을 기록한다. */
  async publish(id: string, userId: string) {
    const q = await this.assertOwner(id, userId);
    if (q.status === QuestionStatus.PUBLISHED) return { id, status: q.status };

    return this.prisma.question.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      select: { id: true, status: true, publishedAt: true },
    });
  }

  /** ARCHIVED 처리(소프트 삭제). 실제 행 삭제는 참조 무결성 때문에 지양. */
  async archive(id: string, userId: string) {
    await this.assertOwner(id, userId);
    return this.prisma.question.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      select: { id: true, status: true },
    });
  }

  /**
   * 문항 통계 — 오답노트 우측 위젯 2종(선지별 분포 차트 / 풀이 시간 뱃지)의 데이터원.
   *
   * 전부 캐시 컬럼에서 읽는다. exam_session_answers를 실시간 집계하지 않는다
   * (selectedChoiceIds가 Json이라 앱단 풀스캔이 되고, TiDB 호환 때문에
   *  MySQL JSON 함수를 쓸 수 없다 — 제출 시점에 카운터를 갱신해 둔다).
   */
  async getStats(id: string) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: {
        choices: true,
        totalSolvedCount: true,
        correctSolvedCount: true,
        totalTimeSpentSec: true,
        timedSolvedCount: true,
        choiceStats: { select: { choiceId: true, count: true } },
      },
    });
    if (!question) throw new NotFoundException('문제를 찾을 수 없습니다.');

    // 표본이 적으면 비율을 숨긴다. 분포(개별 응답 수)는 그대로 노출한다.
    const correctRate =
      question.totalSolvedCount >= STATS_MIN_SAMPLE
        ? Math.round((question.correctSolvedCount / question.totalSolvedCount) * 1000) / 10
        : null;

    const avgTimeSpentSec =
      question.timedSolvedCount >= STATS_MIN_SAMPLE
        ? Math.round(question.totalTimeSpentSec / question.timedSolvedCount)
        : null;

    // 선지 순서·정답 여부는 questions.choices(Json)가 단일 출처다.
    // 통계 테이블은 choiceId만 알고 있으므로 여기서 조인한다.
    const countByChoiceId = new Map(question.choiceStats.map((s) => [s.choiceId, s.count]));
    const choices = Array.isArray(question.choices) ? question.choices : [];
    const choiceDistribution = choices.map((raw, index) => {
      const c = (raw ?? {}) as { id?: unknown; isCorrect?: unknown };
      const choiceId = typeof c.id === 'string' ? c.id : '';
      return {
        index, // 0-based. 프론트가 "N번 선지"로 표시할 때 +1 한다.
        choiceId,
        count: countByChoiceId.get(choiceId) ?? 0,
        isCorrect: c.isCorrect === true,
      };
    });

    return {
      totalSolved: question.totalSolvedCount,
      correctRate,
      avgTimeSpentSec,
      timedSampleCount: question.timedSolvedCount,
      choiceDistribution,
    };
  }

  /**
   * 인라인 선지 재생성 (Task B2). 출제자 본인만.
   *
   * ⚠️ **DB에 쓰지 않는다.** 정답 선지까지 새로 만들기 때문에, 저장하면 출제자가 쓴
   * 정답이 말없이 사라진다. 후보만 반환하고 저장은 출제자가 PATCH로 확정한다.
   * (PATCH가 choices를 받으면 §4.2 규칙대로 누적 통계가 리셋된다.)
   *
   * LLM은 평문만 반환한다(CLAUDE.md 규칙). ProseMirror 조립은 저장 시점에 한다.
   */
  async regenerateChoices(id: string, userId: string, dto: RegenerateChoicesDto) {
    await this.assertOwner(id, userId);

    const question = await this.prisma.question.findUniqueOrThrow({
      where: { id },
      select: {
        difficulty: true,
        subject: { select: { name: true, examCategory: true, examType: true } },
      },
    });

    const result = await this.llm.regenerateChoices({
      stemText: dto.stemText,
      choiceCount: dto.choiceCount,
      difficulty: dto.difficulty ?? question.difficulty,
      subjectName: question.subject?.name,
      examCategory: question.subject?.examCategory,
      examType: question.subject?.examType,
    });

    // 저장하지 않았음을 응답으로도 알린다.
    return { ...result, persisted: false };
  }

  // --- 내부 헬퍼 -------------------------------------------------------

  private async assertSubjectExists(subjectId: string): Promise<void> {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('세부과목을 찾을 수 없습니다.');
  }

  /** 존재 + 소유권 확인. 통과 시 콘텐츠 필드를 반환한다. */
  private async assertOwner(id: string, userId: string) {
    const q = await this.prisma.question.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        status: true,
        stem: true,
        choices: true,
        explanation: true,
        correctAnswerText: true,
      },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
    if (q.creatorId !== userId) throw new ForbiddenException('본인이 작성한 문제만 수정할 수 있습니다.');
    return q;
  }

  /** 발문/선지/해설/주관식 정답 텍스트를 합쳐 검색 캐시(search_text)를 만든다. */
  private buildSearchText(content: {
    stem: Record<string, unknown> | null;
    choices?: Array<Record<string, unknown>> | null;
    explanation?: Array<Record<string, unknown>> | null;
    correctAnswerText?: string | null;
  }): string {
    const parts: string[] = [extractPlainText(content.stem as PMNode)];
    for (const c of content.choices ?? []) {
      if (c && typeof c === 'object' && 'content' in c) {
        parts.push(extractPlainText(c.content as PMNode | PMNode[]));
      }
    }
    if (content.explanation) parts.push(extractPlainText(content.explanation as PMNode[]));
    if (content.correctAnswerText) parts.push(content.correctAnswerText);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }
}
