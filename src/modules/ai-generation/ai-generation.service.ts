import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { AI_GENERATION_JOB, AI_GENERATION_QUEUE, isAudioSubject } from './ai-generation.constants';
import { getTemplate, listTemplates } from './format-templates';

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: GeminiLlmService,
    @InjectQueue(AI_GENERATION_QUEUE) private readonly queue: Queue,
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
        },
      },
      select: { id: true, status: true, createdAt: true },
    });

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

    return generation;
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
