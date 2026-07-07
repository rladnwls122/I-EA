import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// 이 프로젝트의 생성된 Prisma 클라이언트는 Prisma.InputJsonValue 를 표면화하지 않으므로,
// Json 컬럼에 쓰는 구조화 객체는 이 별칭으로 국소 캐스팅한다(런타임 동작엔 영향 없음).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;
import { buildRichBlocks, buildRichDoc, extractPlainText } from '@/common/prosemirror/prosemirror.util';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { LlmGenerationContext, LlmQuestion } from './llm/llm.types';
import { AI_GENERATION_QUEUE } from './ai-generation.constants';

interface GenerationJobData {
  generationId: string;
}

@Processor(AI_GENERATION_QUEUE)
export class AiGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(AiGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: GeminiLlmService,
  ) {
    super();
  }

  async process(job: Job<GenerationJobData>): Promise<void> {
    const { generationId } = job.data;

    const generation = await this.prisma.aiGeneration.findUnique({
      where: { id: generationId },
      include: {
        subject: { select: { name: true } },
        unit: { select: { name: true } },
      },
    });
    if (!generation) {
      this.logger.warn(`생성 작업 ${generationId} 없음 — 스킵`);
      return;
    }
    // 재시도/중복 실행 시 이미 처리된 건은 건너뛴다(멱등).
    if (generation.status !== 'PENDING') {
      this.logger.log(`생성 작업 ${generationId} 상태=${generation.status} — 스킵`);
      return;
    }

    const params = generation.inputParams as Record<string, unknown>;
    const ctx: LlmGenerationContext = {
      prompt: String(params.prompt ?? ''),
      difficulty: Number(params.difficulty ?? 3),
      questionCount: Number(params.questionCount ?? 1),
      includePassage: Boolean(params.includePassage ?? false),
      questionType: (params.questionType as string) ?? undefined,
      subjectName: generation.subject?.name,
      unitName: generation.unit?.name,
    };

    try {
      const result = await this.llm.generate(ctx);

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        let passageId: string | null = null;

        if (ctx.includePassage && result.passage?.bodyText) {
          const passage = await tx.passage.create({
            data: {
              creatorId: generation.creatorId,
              generationId: generation.id,
              content: this.buildPassageContent(result.passage) as JsonWritable,
              status: 'DRAFT',
            },
            select: { id: true },
          });
          passageId = passage.id;
        }

        for (const q of result.questions) {
          const choices = this.buildChoices(q);
          await tx.question.create({
            data: {
              creatorId: generation.creatorId,
              generationId: generation.id,
              primaryUnitId: generation.unitId!, // 생성 요청에서 unitId 필수
              passageId,
              questionType: this.normalizeType(q.questionType),
              stem: this.buildStem(q) as JsonWritable,
              // nullable Json은 값이 없으면 필드를 생략 → 컬럼 NULL로 저장
              ...(choices ? { choices: choices as JsonWritable } : {}),
              ...(q.explanationText
                ? { explanation: buildRichBlocks(q.explanationText) as JsonWritable }
                : {}),
              difficulty: this.clampDifficulty(q.difficulty ?? ctx.difficulty),
              status: 'DRAFT',
              searchText: this.buildSearchText(q, result.passage?.bodyText),
            },
          });
        }

        await tx.aiGeneration.update({
          where: { id: generation.id },
          data: { status: 'COMPLETED' },
        });
      });

      this.logger.log(`생성 작업 ${generationId} 완료 (문항 ${result.questions.length}건)`);
    } catch (err) {
      // 마지막 시도까지 실패하면 FAILED로 확정. 재시도가 남아있으면 예외를 다시 던져
      // BullMQ가 백오프 후 재시도하게 한다.
      const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      this.logger.error(
        `생성 작업 ${generationId} 실패(attempt ${job.attemptsMade + 1}): ${(err as Error).message}`,
      );
      if (!willRetry) {
        await this.prisma.aiGeneration.update({
          where: { id: generation.id },
          data: { status: 'FAILED' },
        });
      }
      throw err;
    }
  }

  // --- 노드 조립 헬퍼 ---------------------------------------------------

  private buildPassageContent(passage: { title?: string; bodyText: string }) {
    const body = buildRichDoc(passage.bodyText);
    if (passage.title) {
      body.content = [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: passage.title }] },
        ...(body.content ?? []),
      ];
    }
    return body;
  }

  private buildStem(q: LlmQuestion) {
    // SHORT_ANSWER만 빈칸 정답을 stem에 심는다(3.6.0 정답 출처 매트릭스).
    const answers = q.questionType === 'SHORT_ANSWER' ? q.shortAnswers ?? [] : [];
    return buildRichDoc(q.stemText, answers);
  }

  private buildChoices(q: LlmQuestion) {
    const isChoiceType =
      q.questionType === 'SINGLE_CHOICE' ||
      q.questionType === 'MULTI_CHOICE' ||
      q.questionType === 'OX';
    if (!isChoiceType || !q.choices?.length) return undefined;

    return q.choices.map((c, i) => ({
      id: `c${i + 1}`,
      isCorrect: !!c.isCorrect,
      content: buildRichBlocks(c.content),
      ...(c.explanation ? { explanation: buildRichBlocks(c.explanation) } : {}),
    }));
  }

  /** search_text: 발문/선지/해설/지문 텍스트를 합쳐 검색 매칭용으로 캐싱(3.6.1). */
  private buildSearchText(q: LlmQuestion, passageBody?: string): string {
    const parts: string[] = [extractPlainText(this.buildStem(q))];
    for (const c of q.choices ?? []) parts.push(extractPlainText(buildRichBlocks(c.content)));
    if (q.explanationText) parts.push(q.explanationText);
    if (passageBody) parts.push(passageBody);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }

  private normalizeType(t: string): LlmQuestion['questionType'] {
    const allowed: LlmQuestion['questionType'][] = [
      'SINGLE_CHOICE',
      'MULTI_CHOICE',
      'OX',
      'SHORT_ANSWER',
      'ESSAY',
    ];
    return allowed.includes(t as LlmQuestion['questionType'])
      ? (t as LlmQuestion['questionType'])
      : 'SINGLE_CHOICE';
  }

  private clampDifficulty(d: number): number {
    if (Number.isNaN(d)) return 3;
    return Math.min(5, Math.max(1, Math.round(d)));
  }
}
