import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { waitUntil } from '@vercel/functions';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { AiGenerationProcessor } from './ai-generation.processor';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { AI_GENERATION_JOB, AI_GENERATION_QUEUE, isAudioSubject } from './ai-generation.constants';
import { getTemplate, listTemplates } from './format-templates';
import { foldReviewRows, REVIEW_STATS_ROW_CAP } from './review-stats';

/**
 * 이 시간이 지나도 PENDING이면 죽은 잡으로 보고 마감한다.
 * 서버리스 함수 maxDuration(60s)보다 넉넉히 크게 잡아, 아직 도는 잡을 죽이지 않는다.
 */
const STALE_PENDING_MS = 5 * 60 * 1000;

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: GeminiLlmService,
    @InjectQueue(AI_GENERATION_QUEUE) private readonly queue: Queue,
    private readonly processor: AiGenerationProcessor,
  ) {}

  /**
   * 1) ai_generations에 PENDING으로 기록(input_params/model 스냅샷)
   * 2) BullMQ에 잡 적재 → 즉시 202 응답. 실제 생성은 프로세서가 비동기로 수행.
   * 요청 스레드에서 LLM 호출을 기다리지 않으므로, 다건/장시간 생성에도 API가 막히지 않는다.
   */
  async createGeneration(creatorId: string, dto: CreateGenerationDto) {
    // subject_id가 NOT NULL이므로 세부과목 존재를 먼저 확정한다.
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      select: { id: true, name: true, examCategory: true, examType: true },
    });
    if (!subject) throw new NotFoundException('세부과목을 찾을 수 없습니다.');

    // 듣기(오디오) 소분류는 생성 대상이 아니다 — 오디오 파이프라인이 없다(#36 gap 7).
    if (isAudioSubject(subject)) {
      throw new BadRequestException('듣기(오디오) 과목은 AI 생성을 지원하지 않습니다.');
    }

    // 템플릿은 시험(examType)별 관행이다 — 과목의 시험과 안 맞으면 형식이 어긋난 문항이 나온다.
    if (dto.templateId) {
      const template = getTemplate(dto.templateId);
      // DTO @IsIn이 먼저 거르지만, 레지스트리와 어긋나는 경로를 방어한다.
      if (!template) throw new BadRequestException('알 수 없는 출제 형식 템플릿입니다.');
      if (!template.examTypes.includes(subject.examType)) {
        throw new BadRequestException(
          `선택한 템플릿(${template.label})은 '${subject.examType}' 시험에서 쓸 수 없습니다.`,
        );
      }
      // OX는 O/X 2지선다 단일정답이 정의라 복수정답 템플릿과 구조적으로 모순된다.
      if (dto.ox && template.structure.answerMode === 'multiple') {
        throw new BadRequestException('OX 형식은 복수정답 템플릿과 함께 쓸 수 없습니다.');
      }
    }

    // 유사(변형) 문항 생성 — 원본 접근 검증은 진입점에서 끝낸다. 프로세서는 큐 뒤에서
    // 요청자 컨텍스트 없이 돌므로, 여기서 안 막으면 남의 DRAFT를 시드로 쓰는 경로가 열린다.
    if (dto.sourceQuestionId) {
      await this.assertVariantSource(creatorId, dto);
    }

    const generation = await this.prisma.aiGeneration.create({
      data: {
        creatorId,
        subjectId: dto.subjectId,
        model: this.llm.model,
        status: 'PENDING',
        // input_params: 재생성 시 그대로 재사용할 수 있도록 요청 전체를 스냅샷
        inputParams: {
          prompt: dto.prompt,
          difficulty: dto.difficulty,
          questionCount: dto.questionCount,
          // 지정 안 하면 null — 명시 false와 구분해, 템플릿 기본값(지문 세트형)이 깔릴 수 있게 한다(#43).
          includePassage: dto.includePassage ?? null,
          questionType: dto.questionType ?? null,
          ox: dto.ox ?? false,
          // 지정 안 하면 null — 프로세서가 시험별 관행을 프롬프트 지시로만 흘려보낸다(#36 gap 1).
          choiceCount: dto.choiceCount ?? null,
          // 지정 안 하면 null — 프로세서가 시험/대분류로 추정한다(#36 gap 2).
          language: dto.language ?? null,
          // 출제 형식 템플릿(#43). 프로세서가 기본값 해석에 쓰고, 재생성 시 그대로 재사용된다.
          templateId: dto.templateId ?? null,
          // 유사(변형) 생성의 원본 문항. 프로세서가 실행 시점에 로드한다 — 본문을 스냅샷하지
          // 않는 이유는 원본이 그 사이 수정됐다면 최신 내용을 변형하는 쪽이 맞기 때문.
          sourceQuestionId: dto.sourceQuestionId ?? null,
        },
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Vercel 서버리스에는 상주 프로세스가 없다 — BullMQ 워커가 큐를 소비하지 못하므로
    // 잡을 넣어봐야 영원히 PENDING으로 남는다. 대신 응답을 먼저 보낸 뒤 같은 인보케이션이
    // 살아 있는 동안 생성을 끝내도록 waitUntil에 넘긴다(클라이언트 폴링 계약은 그대로).
    // 상주 워커가 있는 환경(로컬/컨테이너)에서는 기존대로 큐에 적재해 재시도까지 받는다.
    if (process.env.VERCEL) {
      waitUntil(this.processor.runNow(generation.id));
    } else {
      await this.queue.add(
        AI_GENERATION_JOB,
        { generationId: generation.id },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );
    }

    return generation;
  }

  /**
   * 유사(변형) 문항 생성의 원본 접근 검증.
   *
   * - 본인 문항이거나 PUBLISHED여야 한다. 남의 DRAFT는 존재 여부까지 감춰 404
   *   (getGeneration의 IDOR 규칙과 같은 이유).
   * - subjectId가 원본과 다르면 400 — 변형은 정의상 같은 세부과목이고, 어긋난 분류로
   *   저장되면 오답노트·복습 통계가 엉뚱한 축에 쌓인다.
   * - 요청자가 원본을 품은 진행 중 세션을 갖고 있으면 400. 변형 프롬프트에 원본
   *   정답·해설이 실리므로, 응시 중 마스킹(answer-masking)의 우회로가 된다.
   */
  private async assertVariantSource(creatorId: string, dto: CreateGenerationDto) {
    const source = await this.prisma.question.findUnique({
      where: { id: dto.sourceQuestionId },
      select: { id: true, creatorId: true, subjectId: true, status: true },
    });
    if (!source || (source.creatorId !== creatorId && source.status !== 'PUBLISHED')) {
      throw new NotFoundException('원본 문항을 찾을 수 없습니다.');
    }
    if (source.subjectId !== dto.subjectId) {
      throw new BadRequestException('유사 문항은 원본 문항과 같은 세부과목이어야 합니다.');
    }
    const active = await this.prisma.examSessionQuestion.findFirst({
      where: { questionId: source.id, examSession: { userId: creatorId, status: 'IN_PROGRESS' } },
      select: { id: true },
    });
    if (active) {
      throw new BadRequestException('응시 중인 문항으로는 유사 문항을 생성할 수 없습니다.');
    }
  }

  /** 출제 형식 템플릿 목록(#43). examType을 주면 그 시험에 노출되는 것만 필터한다. */
  listFormatTemplates(examType?: string) {
    return listTemplates(examType).map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      examTypes: t.examTypes,
      structure: t.structure,
    }));
  }

  /**
   * 자기검증 판정 집계 (#33 잔여 1) — **요청자 본인이 만든 문항만**.
   *
   * 남의 품질 수치를 볼 이유가 없다. ADMIN 전역 집계가 필요해지면 그때 파라미터를 연다.
   *
   * 집계 대상은 `ai_generations`가 아니라 `questions`다. 자기검증은 출제 채팅(SSE)에 붙어
   * 있고 그 경로는 생성 잡 행을 만들지 않는다 — 실사용 판정이 남는 자리는 문항뿐이다.
   */
  async getReviewStats(userId: string) {
    const where = { creatorId: userId, reviewVerdict: { not: null } };

    // 헤드라인은 DB가 센다 — 상한 밖에서 정확해야 하는 숫자다(컬럼을 꺼낸 이유).
    const grouped = await this.prisma.question.groupBy({
      by: ['reviewVerdict'],
      where,
      _count: { _all: true },
    });

    const counts = { PASS: 0, REVISE: 0, ERROR: 0 };
    for (const g of grouped) {
      const key = g.reviewVerdict as keyof typeof counts;
      if (key in counts) counts[key] = g._count._all;
    }
    const reviewed = counts.PASS + counts.REVISE + counts.ERROR;
    // 판정된 것 중 REVISE 비율. ERROR는 "판정 못 함"이라 분모에서 뺀다 —
    // 넣으면 모델이 자주 실패한 날이 품질이 좋아진 날로 읽힌다.
    const judged = counts.PASS + counts.REVISE;

    // 축·일자 분해는 상한을 건 표본에서 접는다(축이 Json 안이라 SQL로 못 묶는다).
    const rows = await this.prisma.question.findMany({
      where,
      select: { createdAt: true, reviewVerdict: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: REVIEW_STATS_ROW_CAP,
    });

    return {
      reviewed,
      counts,
      reviseRatio: judged > 0 ? counts.REVISE / judged : null,
      ...foldReviewRows(rows),
    };
  }

  /** 상태 폴링 + 완료 시 산출물(지문/문항 ID) 조회 */
  async getGeneration(id: string, userId: string) {
    const generation = await this.prisma.aiGeneration.findUnique({
      where: { id },
      include: {
        passages: { select: { id: true } },
        questions: { select: { id: true, questionType: true, status: true } },
      },
    });
    if (!generation) throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    // 소유자 검사(IDOR 방지). 예전에는 이 검사가 없어서 로그인만 하면 UUID로
    // 남의 생성 잡(프롬프트 스냅샷·산출 문항 ID)을 읽을 수 있었다.
    // 존재 여부까지 감추도록 403이 아니라 위와 같은 404 메시지를 쓴다.
    if (generation.creatorId !== userId) {
      throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    }

    // 서버리스 경로(waitUntil)에는 재시도가 없다. 함수가 생성 도중 죽으면(타임아웃·크래시)
    // 행이 PENDING으로 남아 클라이언트가 영원히 폴링한다. 별도 워커/크론을 두는 대신,
    // 어차피 들어오는 폴링에서 오래된 PENDING을 FAILED로 마감한다.
    // updateMany + status 조건이라 방금 완료된 건을 덮어쓰지 않는다(경합 안전).
    if (
      generation.status === 'PENDING' &&
      Date.now() - generation.createdAt.getTime() > STALE_PENDING_MS
    ) {
      const { count } = await this.prisma.aiGeneration.updateMany({
        where: { id: generation.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      if (count > 0) generation.status = 'FAILED';
    }

    return {
      id: generation.id,
      status: generation.status,
      model: generation.model,
      createdAt: generation.createdAt,
      passageIds: generation.passages.map((p: { id: string }) => p.id),
      questions: generation.questions,
    };
  }
}
