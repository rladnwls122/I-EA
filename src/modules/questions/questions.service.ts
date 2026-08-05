import {
  BadRequestException,
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
import { maskQuestionAnswers } from './answer-masking';

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
      ...(query.subjectIds?.length
        ? { subjectId: { in: query.subjectIds } }
        : query.subjectId
          ? { subjectId: query.subjectId }
          : {}),
      // 상태 미지정이면 PUBLISHED만 — 이 라우트는 @Public()이라 지정 안 하면
      // 남의 DRAFT(작성 중인 문항)까지 전부 노출되는 사고가 난다(실측 확인).
      status: query.status ?? 'PUBLISHED',
      ...(query.questionType ? { questionType: query.questionType } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      // 키워드 검색 — 본문(search_text) 또는 태그명 매칭. 태그(#키워드)로도 찾을 수 있다.
      ...(query.q
        ? {
            OR: [
              { searchText: { contains: query.q } },
              { questionTags: { some: { tag: { name: { contains: query.q } } } } },
            ],
          }
        : {}),
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
          // 목록 카드 미리보기용 — 발문과 과목명(선지/해설은 상세 조회로).
          stem: true,
          subject: { select: { id: true, name: true } },
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
  async getById(id: string, userId: string) {
    // 조회수 캐시를 증가시키면서 증가된 레코드를 그대로 받아온다(단일 쿼리).
    const question = await this.prisma.question
      .update({
        where: { id },
        data: { viewCount: { increment: 1 } },
        include: {
          subject: { select: { id: true, name: true, examCategory: true, examType: true } },
          // setId가 있으면 이 문항은 함께 읽어야 하는 지문 묶음의 일부다(#43).
          passage: {
            select: { id: true, status: true, content: true, setId: true, label: true },
          },
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

    // 채점결과(정답/해설) 탭 게이팅용 — 이 유저가 이 문항을 제출된 세션에서 실제로 풀었는지.
    const solvedCount = await this.prisma.examSessionAnswer.count({
      where: {
        examSessionQuestion: {
          questionId: id,
          examSession: { userId, status: 'SUBMITTED' },
        },
      },
    });

    // 응시 중 정답 마스킹 우회 차단 — 자세한 배경은 answer-masking.ts 주석 참고.
    // 출제자 본인은 어차피 정답을 아는 사람이고 편집 UI가 원본을 필요로 하므로 예외.
    const inActiveSession =
      question.creatorId !== userId && (await this.hasActiveSessionFor(id, userId));

    // 지문 세트 전체(#43). 수능 (가)(나)·토익 Part 7 double은 문항이 두세 지문을
    // 교차 참조해야 풀리는데, Question.passageId는 근거 지문 하나만 문다.
    // 상세 화면에서 나머지 지문이 안 보이면 문항을 읽을 수 없다.
    const passages = question.passage?.setId
      ? await this.prisma.passage.findMany({
          where: { setId: question.passage.setId },
          select: { id: true, status: true, content: true, label: true },
          orderBy: { setOrder: 'asc' },
        })
      : question.passage
        ? [{ ...question.passage, label: question.passage.label }]
        : [];

    const payload = {
      ...question,
      passages,
      tags: question.questionTags.map((qt) => qt.tag),
      correctRatePercent: correctRate,
      solvedByMe: solvedCount > 0,
    };

    return inActiveSession
      ? { ...maskQuestionAnswers(payload), maskedForActiveSession: true as const }
      : payload;
  }

  /** 요청자가 이 문항을 품은 진행 중(IN_PROGRESS) 세션을 갖고 있는지. */
  private async hasActiveSessionFor(questionId: string, userId: string): Promise<boolean> {
    const active = await this.prisma.examSessionQuestion.findFirst({
      where: { questionId, examSession: { userId, status: 'IN_PROGRESS' } },
      select: { id: true },
    });
    return active !== null;
  }

  /**
   * 채점기준표를 가질 수 있는 문항인지 — **저장 후 갖게 될 모습**으로 판정한다.
   *
   * DTO 혼자서는 못 하는 검사다: PATCH는 questionType 없이 rubric만 올 수 있어서
   * 기존 행과 병합해야 실제 유형을 안다. 그래서 검증을 여기 저장 직전에 둔다.
   *
   * 막는 이유는 둘 다 "이 rubric이 절대 쓰이지 않는다"는 것이다 — 죽은 데이터가 저장되면
   * 출제자는 기준을 적어 놓고도 화면에서 부분점수 채점을 못 보게 되고, 화면은 어느 채점 UI를
   * 띄울지 모호해진다.
   *   - 객관식: 정답 선지로 자동채점된다. 자기채점 자체가 없다.
   *   - 단답 정답(correctAnswerText)이 있는 주관식: 문자열 비교로 자동채점된다(grade()).
   * 빈 배열/미지정은 "기준 없음"이라 언제나 허용한다.
   */
  private assertRubricAllowed(effective: {
    questionType: string;
    correctAnswerText?: string | null;
    rubric?: unknown;
  }): void {
    if (!Array.isArray(effective.rubric) || effective.rubric.length === 0) return;

    if (effective.questionType === '객관식') {
      throw new BadRequestException(
        '객관식에는 채점기준표를 쓸 수 없습니다(정답 선지로 자동채점됩니다).',
      );
    }
    if (effective.correctAnswerText?.trim()) {
      throw new BadRequestException(
        '단답 정답이 있는 문항은 자동채점됩니다 — 채점기준표는 정답 텍스트를 비운 서술형에만 쓸 수 있습니다.',
      );
    }
  }

  /** 문항 직접 생성(DRAFT). tagIds가 있으면 question_tags도 함께 매핑한다. */
  async create(creatorId: string, dto: CreateQuestionDto) {
    await this.assertSubjectExists(dto.subjectId);
    this.assertRubricAllowed(dto);

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
        // 빈 배열은 "기준 없음"이라 컬럼에 넣지 않는다 — 읽는 쪽(readRubric)이 null과
        // []를 똑같이 "정오 2지선다 자기채점"으로 다루게 하려면 저장 형태를 하나로 모아야 한다.
        ...(dto.rubric?.length ? { rubric: dto.rubric as JsonWritable } : {}),
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

    // 채점기준표 허용 여부는 "이번 수정을 반영한 뒤의 모습"으로 본다 — 유형만 객관식으로
    // 바꾸는 요청도, rubric만 넣는 요청도 같은 규칙에 걸려야 한다.
    this.assertRubricAllowed({
      questionType: dto.questionType ?? existing.questionType,
      correctAnswerText:
        dto.correctAnswerText !== undefined ? dto.correctAnswerText : existing.correctAnswerText,
      rubric: dto.rubric !== undefined ? dto.rubric : existing.rubric,
    });

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
          // 빈 배열은 "기준 전부 삭제" — 편집기가 삭제를 표현할 수 있는 유일한 형태다
          // (필드를 생략하면 PATCH 규약상 "안 건드림"이라 마지막 기준을 지울 방법이 없다).
          ...(dto.rubric !== undefined
            ? { rubric: dto.rubric.length ? (dto.rubric as JsonWritable) : Prisma.DbNull }
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
  async getStats(id: string, userId: string | null) {
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

    // 이 라우트는 인증 없이도 열리므로(@Public), 예전에는 isCorrect를 무조건 실어
    // 보내 **로그인조차 없이 정답 키 전체를 덤프**할 수 있었다. 분포(선택 수)는
    // 공개 가치가 있으니 그대로 두고, 정답 여부만 자격을 확인해 노출한다.
    //   - 비로그인: 노출하지 않는다.
    //   - 로그인 + 해당 문항을 품은 IN_PROGRESS 세션 보유: 노출하지 않는다(응시 중 커닝 차단).
    //   - 그 외 로그인 사용자: 기존대로 노출.
    const revealCorrect =
      userId !== null && !(await this.hasActiveSessionFor(id, userId));

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
        // 자격이 없으면 필드 자체를 null로 준다(false로 주면 "이건 오답"이라는
        // 정보가 되어 소거법으로 정답이 역산된다).
        isCorrect: revealCorrect ? c.isCorrect === true : null,
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
        // 채점기준표 허용 규칙(assertRubricAllowed)이 "수정 후의 모습"을 보려면
        // 이번 요청에 안 실린 쪽의 현재 값이 필요하다.
        questionType: true,
        rubric: true,
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
