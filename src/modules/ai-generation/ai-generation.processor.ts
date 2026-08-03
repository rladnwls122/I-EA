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
import { KEYWORD_TAG_CATEGORY, QuestionKind } from '@/common/constants/question';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { LlmGenerationContext, LlmQuestion } from './llm/llm.types';
import { OutputLanguage, resolveOutputLanguage } from './exam-format';
import { getTemplate, resolveTemplateFormat } from './format-templates';
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
        subject: { select: { name: true, examCategory: true, examType: true } },
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
    // 출제 형식 템플릿 해석(#43) — 템플릿이 선지 개수·언어·지문 여부·유형의 기본값을 깔고,
    // 요청에서 명시한 개별 파라미터(null이 아닌 값)가 항상 우선한다.
    const templateId = params.templateId ? String(params.templateId) : undefined;
    const template = templateId ? getTemplate(templateId) : undefined;
    if (templateId && !template) {
      // 스냅샷의 템플릿이 레지스트리에서 사라진 경우(id 변경·제거) — FAILED는 과하다.
      // 무템플릿으로 진행해 재생성 가능성을 유지하되, 형식 지시가 빠졌음을 로그로 남긴다.
      this.logger.warn(
        `생성 작업 ${generationId}: 알 수 없는 템플릿 ID '${templateId}' — 템플릿 없이 진행합니다.`,
      );
    }
    const format = resolveTemplateFormat(template, {
      choiceCount: params.choiceCount != null ? Number(params.choiceCount) : undefined,
      language: (params.language as OutputLanguage | null) ?? undefined,
      includePassage: params.includePassage != null ? Boolean(params.includePassage) : undefined,
      questionType: (params.questionType as QuestionKind | null) ?? undefined,
    });
    const ctx: LlmGenerationContext = {
      prompt: String(params.prompt ?? ''),
      difficulty: Number(params.difficulty ?? 3),
      questionCount: Number(params.questionCount ?? 1),
      includePassage: format.includePassage,
      questionType: format.questionType,
      ox: Boolean(params.ox ?? false),
      // 템플릿·요청 어느 쪽에도 없으면 undefined — 시험별 관행은 프롬프트 지시로만 유도하고
      // 개수 검증은 걸지 않는다(모델이 하나 어긋났다고 배치 전체를 FAILED로 떨구지 않기 위함).
      choiceCount: format.choiceCount,
      // 템플릿·요청 어느 쪽에도 없으면 시험/대분류로 추정한다(토익 → 영어, 영어 대분류 → 지문 영어 + 발문 한국어).
      language:
        format.language ??
        resolveOutputLanguage(generation.subject?.examType, generation.subject?.examCategory),
      // 복수정답 모드(#43 gap 4)와 템플릿 형식 지시 — 프롬프트 조립·검증 완화에 쓰인다.
      answerMode: format.answerMode,
      templateHints: format.promptHints,
      subjectName: generation.subject?.name,
      examCategory: generation.subject?.examCategory,
      examType: generation.subject?.examType,
      existingKeywords: await this.fetchExistingKeywords(generation.subjectId),
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

        // 이 생성 배치 안에서 같은 키워드가 여러 문항에 걸치면 한 번만 만들어 재사용한다.
        const tagIdByName = new Map<string, string>();

        for (const q of result.questions) {
          const kind = this.normalizeType(q.questionType);
          const choices = this.buildChoices(q, kind);
          const tagIds = await this.resolveKeywordTagIds(tx, tagIdByName, q.keywords ?? []);
          // 주관식 단답 정답(있으면 자동채점 근거). 서술형이면 null → 자기채점.
          const correctAnswerText =
            kind === '주관식' && q.answerText?.trim() ? q.answerText.trim() : null;
          // OX 힌트를 요청했고 실제로 2지선다로 나온 객관식만 OX 스타일로 태깅한다.
          // questionType 저장값(QUESTION_KINDS)은 그대로 두고 metadata에만 표시 —
          // 새 타입을 도입하지 않고도 에디터/문제은행이 OX 뱃지를 구분해 보여줄 수 있다.
          const isOxStyle = ctx.ox && kind === '객관식' && choices?.length === 2;
          await tx.question.create({
            data: {
              creatorId: generation.creatorId,
              generationId: generation.id,
              subjectId: generation.subjectId,
              passageId,
              questionType: kind,
              stem: this.buildStem(q) as JsonWritable,
              // nullable Json은 값이 없으면 필드를 생략 → 컬럼 NULL로 저장
              ...(choices ? { choices: choices as JsonWritable } : {}),
              ...(correctAnswerText ? { correctAnswerText } : {}),
              ...(isOxStyle ? { metadata: { style: 'OX' } as JsonWritable } : {}),
              ...(q.explanationText
                ? { explanation: buildRichBlocks(q.explanationText) as JsonWritable }
                : {}),
              ...(tagIds.length ? { questionTags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
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
    return buildRichDoc(q.stemText);
  }

  private buildChoices(q: LlmQuestion, kind: QuestionKind) {
    if (kind !== '객관식' || !q.choices?.length) return undefined;

    return q.choices.map((c, i) => ({
      id: `c${i + 1}`,
      isCorrect: !!c.isCorrect,
      content: buildRichBlocks(c.content),
      ...(c.explanation ? { explanation: buildRichBlocks(c.explanation) } : {}),
    }));
  }

  /** search_text: 발문/선지/해설/주관식 정답/지문 텍스트를 합쳐 검색 매칭용으로 캐싱. */
  private buildSearchText(q: LlmQuestion, passageBody?: string): string {
    const parts: string[] = [extractPlainText(this.buildStem(q))];
    for (const c of q.choices ?? []) parts.push(extractPlainText(buildRichBlocks(c.content)));
    if (q.answerText) parts.push(q.answerText);
    if (q.explanationText) parts.push(q.explanationText);
    if (q.keywords?.length) parts.push(q.keywords.join(' '));
    if (passageBody) parts.push(passageBody);
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  }

  /**
   * 기존 #키워드 풀(태그명) — 상한 60개. 프롬프트에 실어 LLM이 같은 개념엔
   * 같은 키워드를 재사용하게 유도한다(개념별 통계가 모이도록).
   *
   * 반드시 "같은 과목(subjectId)의 문항에 실제로 붙은" 키워드만 넘긴다.
   * 전역 풀을 그대로 넘기면 무관한 이전 생성물의 주제/키워드가 새 요청에
   * 섞여 나오는 오염(이전 세션 키워드 누출)이 발생한다.
   */
  private async fetchExistingKeywords(subjectId?: string | null): Promise<string[]> {
    if (!subjectId) return [];
    const tags = await this.prisma.tag.findMany({
      where: {
        category: KEYWORD_TAG_CATEGORY,
        questionTags: { some: { question: { subjectId } } },
      },
      orderBy: { name: 'asc' },
      take: 60,
      select: { name: true },
    });
    return tags.map((t) => t.name);
  }

  /**
   * 키워드 문자열 배열 → "키워드" 카테고리 태그 ID 배열(upsert).
   * cache는 이 생성 배치(트랜잭션) 안에서 같은 이름을 재조회하지 않게 막는다.
   * tags는 (category, name)이 유니크라 upsert가 멱등하다 —
   * find-then-create는 동시 요청에서 둘 다 조회를 미스해 한쪽이 P2002로 터진다
   * (catalog.service.createTag도 같은 이유로 upsert를 쓴다).
   */
  private async resolveKeywordTagIds(
    tx: Prisma.TransactionClient,
    cache: Map<string, string>,
    keywords: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const raw of keywords) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let id = cache.get(key);
      if (!id) {
        const tag = await tx.tag.upsert({
          where: { category_name: { category: KEYWORD_TAG_CATEGORY, name } },
          update: {},
          create: { name, category: KEYWORD_TAG_CATEGORY },
          select: { id: true },
        });
        id = tag.id;
        cache.set(key, id);
      }
      ids.push(id);
    }
    return ids;
  }

  private normalizeType(t: string): QuestionKind {
    return t === '주관식' ? '주관식' : '객관식';
  }

  private clampDifficulty(d: number): number {
    if (Number.isNaN(d)) return 3;
    return Math.min(5, Math.max(1, Math.round(d)));
  }
}
