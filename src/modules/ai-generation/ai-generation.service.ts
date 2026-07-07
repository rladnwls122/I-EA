import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { AI_GENERATION_JOB, AI_GENERATION_QUEUE } from './ai-generation.constants';

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
    // primary_unit_id가 NOT NULL이므로 단원 존재를 먼저 확정한다.
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException('단원을 찾을 수 없습니다.');

    const generation = await this.prisma.aiGeneration.create({
      data: {
        creatorId,
        subjectId: dto.subjectId ?? null,
        unitId: dto.unitId,
        model: this.llm.model,
        status: 'PENDING',
        // input_params: 재생성 시 그대로 재사용할 수 있도록 요청 전체를 스냅샷
        inputParams: {
          prompt: dto.prompt,
          difficulty: dto.difficulty,
          questionCount: dto.questionCount,
          includePassage: dto.includePassage ?? false,
          questionType: dto.questionType ?? null,
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

  /** 상태 폴링 + 완료 시 산출물(지문/문항 ID) 조회 */
  async getGeneration(id: string) {
    const generation = await this.prisma.aiGeneration.findUnique({
      where: { id },
      include: {
        passages: { select: { id: true } },
        questions: { select: { id: true, questionType: true, status: true } },
      },
    });
    if (!generation) throw new NotFoundException('생성 작업을 찾을 수 없습니다.');

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
