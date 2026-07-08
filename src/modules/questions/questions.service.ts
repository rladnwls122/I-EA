import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginatedResult } from '@/common/dto/pagination.dto';
import { extractPlainText, PMNode } from '@/common/prosemirror/prosemirror.util';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionDto } from './dto/query-question.dto';

// Prisma 생성 클라이언트가 InputJsonValue를 표면화하지 않으므로 Json 컬럼 쓰기 시 국소 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

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
          subject: { select: { id: true, name: true, examCategory: true } },
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

    return this.prisma.question.update({
      where: { id },
      data: {
        ...(dto.subjectId ? { subjectId: dto.subjectId } : {}),
        ...(dto.passageId !== undefined ? { passageId: dto.passageId ?? null } : {}),
        ...(dto.questionType ? { questionType: dto.questionType } : {}),
        ...(dto.stem !== undefined ? { stem: dto.stem as JsonWritable } : {}),
        ...(dto.choices !== undefined ? { choices: dto.choices as JsonWritable } : {}),
        ...(dto.explanation !== undefined ? { explanation: dto.explanation as JsonWritable } : {}),
        ...(dto.correctAnswerText !== undefined ? { correctAnswerText: dto.correctAnswerText } : {}),
        ...(dto.metadata !== undefined ? { metadata: dto.metadata as JsonWritable } : {}),
        ...(dto.hintContent !== undefined ? { hintContent: dto.hintContent } : {}),
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.points !== undefined ? { points: dto.points } : {}),
        ...(searchText !== undefined ? { searchText } : {}),
        // 태그 전체 교체
        ...(dto.tagIds
          ? { questionTags: { deleteMany: {}, create: dto.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      select: { id: true, updatedAt: true },
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
