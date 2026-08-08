import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

// 이 프로젝트의 생성된 Prisma 클라이언트는 Prisma.InputJsonValue 를 표면화하지 않으므로,
// Json 컬럼에 쓰는 구조화 객체는 이 별칭으로 국소 캐스팅한다(런타임 동작엔 영향 없음).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;
import {
  blankMarker,
  buildRichBlocks,
  buildRichDoc,
  extractPlainText,
  normalizeBlankMarkers,
  PMNode,
} from '@/common/prosemirror/prosemirror.util';
import { QuestionKind } from '@/common/constants/question';
import { KEYWORD_TAG_CATEGORY } from '@/common/constants/tag';
import { GeminiLlmService } from './llm/gemini-llm.service';
import {
  LlmGenerationContext,
  LlmGenerationResult,
  LlmQuestion,
  LlmSourceQuestion,
  ReviewAxis,
} from './llm/llm.types';
import { OutputLanguage, resolveOutputLanguage } from './exam-format';
import { getTemplate, resolveTemplateFormat } from './format-templates';
import { AI_GENERATION_QUEUE } from './ai-generation.constants';
import { readReviewVerdict } from '@/modules/questions/question-metadata';

interface GenerationJobData {
  generationId: string;
}

/**
 * questions.metadata에 남기는 자기검증 기록(#34 후속).
 * 스키마 컬럼을 늘리지 않는다 — metadata는 이미 OX 스타일 표시가 쓰는 자리다.
 * verdict='ERROR'는 "판정을 못 했다"는 뜻이다(통과와 구분해서 남긴다).
 */
interface ReviewNote {
  model: string;
  at: string;
  verdict: 'PASS' | 'REVISE' | 'ERROR';
  axes?: ReviewAxis[];
  issues?: string[];
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
    // 유사(변형) 생성 — 원본은 스냅샷이 아니라 **실행 시점에** 로드한다(수정됐다면 최신을 변형).
    // 없으면 조용히 무관한 문항을 만드는 대신 잡을 실패시킨다 — 변형 요청에 변형이 아닌
    // 결과를 돌려주는 것이 이 저장소가 피해 온 "조용한 소실"이다.
    const sourceQuestion = params.sourceQuestionId
      ? await this.loadSourceQuestion(String(params.sourceQuestionId))
      : undefined;
    const ctx: LlmGenerationContext = {
      prompt: String(params.prompt ?? ''),
      difficulty: Number(params.difficulty ?? 3),
      questionCount: Number(params.questionCount ?? 1),
      // 원본에 지문이 있으면(명시·템플릿 지정이 없을 때) 변형도 지문을 갖는 쪽이 기본이다 —
      // 지문 근거 문항의 변형이 무지문으로 나오면 같은 유형이라 할 수 없다.
      includePassage:
        format.includePassage ||
        (!template && params.includePassage == null && !!sourceQuestion?.passageText),
      // 지문 수(0~3). 2 이상이면 다중지문 세트 모드(gap 3) — LLM 계약이 passages[]로 바뀐다.
      passageCount: format.passageCount,
      passageLabels: format.passageLabels,
      // 변형은 정의상 원본과 같은 유형이다 — 명시·템플릿이 없으면 원본을 따른다.
      questionType: format.questionType ?? sourceQuestion?.questionType,
      ox: Boolean(params.ox ?? false),
      // 템플릿·요청 어느 쪽에도 없으면 undefined — 시험별 관행은 프롬프트 지시로만 유도하고
      // 개수 검증은 걸지 않는다(모델이 하나 어긋났다고 배치 전체를 FAILED로 떨구지 않기 위함).
      // 단, 변형 생성은 원본의 선지 개수를 기본으로 강제한다(5지 문항의 변형이 4지로 나오지 않게).
      choiceCount: format.choiceCount ?? this.sourceChoiceCount(sourceQuestion),
      // 템플릿·요청 어느 쪽에도 없으면 시험/대분류로 추정한다(토익 → 영어, 영어 대분류 → 지문 영어 + 발문 한국어).
      language:
        format.language ??
        resolveOutputLanguage(generation.subject?.examType, generation.subject?.examCategory),
      // 복수정답 모드(#43 gap 4)와 템플릿 형식 지시 — 프롬프트 조립·검증 완화에 쓰인다.
      answerMode: format.answerMode,
      // 지문 내장 빈칸(#43 gap 9) — 지문 평문의 `[[n]]` 마커 + 문항별 blankIndex 계약으로 바뀐다.
      blanksInPassage: format.blanksInPassage,
      templateHints: format.promptHints,
      subjectName: generation.subject?.name,
      examCategory: generation.subject?.examCategory,
      examType: generation.subject?.examType,
      existingKeywords: await this.fetchExistingKeywords(generation.subjectId),
      sourceQuestion,
    };

    try {
      const generated = await this.llm.generate(ctx);
      // 지문 내장 빈칸(gap 9): LLM 입력 문법 `[[n]]`을 저장·표시 정본 `___(n)___`으로 한 번만 정규화한다.
      // 빈칸 모드가 아니면 결과 객체를 손대지 않는다 — 기존 전 경로의 출력은 바이트 단위로 동일하다.
      const result = ctx.blanksInPassage ? this.normalizeBlanks(generated) : generated;
      // LLM 자기검증(#34 후속) — 옵트인. 꺼져 있으면 호출도, 지연도, 비용도 종전 그대로다.
      const reviews = await this.selfReview(ctx, result, generationId);

      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // 다중지문 세트(gap 3): passages[]를 각각 Passage 행으로 만들고(스키마는 원래 1:N)
        // 문항이 passageIndex로 자기 지문을 문다. 단일 지문은 종전 경로 그대로.
        const multiPassageIds: string[] = [];
        let singlePassageId: string | null = null;

        if ((ctx.passageCount ?? 0) >= 2 && result.passages?.length) {
          // 세트 핸들(#43). 이 지문들은 **함께 읽어야** 풀리므로 묶어 둔다 —
          // 문항이 무는 건 근거 지문 하나지만, 풀이 화면은 세트 전체를 보여준다.
          const setId = randomUUID();
          const labels = ctx.passageLabels ?? [];
          for (const [index, bodyText] of result.passages.entries()) {
            const passage = await tx.passage.create({
              data: {
                creatorId: generation.creatorId,
                generationId: generation.id,
                content: buildRichDoc(bodyText) as JsonWritable,
                status: 'DRAFT',
                setId,
                setOrder: index,
                label: labels[index] ?? `지문 ${index + 1}`,
              },
              select: { id: true },
            });
            multiPassageIds.push(passage.id);
          }
        } else if (ctx.includePassage && result.passage?.bodyText) {
          const passage = await tx.passage.create({
            data: {
              creatorId: generation.creatorId,
              generationId: generation.id,
              content: this.buildPassageContent(result.passage) as JsonWritable,
              status: 'DRAFT',
            },
            select: { id: true },
          });
          singlePassageId = passage.id;
        }

        // 이 생성 배치 안에서 같은 키워드가 여러 문항에 걸치면 한 번만 만들어 재사용한다.
        const tagIdByName = new Map<string, string>();

        for (const [qIndex, q] of result.questions.entries()) {
          // 다중지문이면 문항별 근거 지문(passageIndex — 파서가 범위를 검증했다), 아니면 단일 지문.
          const passageId = multiPassageIds.length
            ? (multiPassageIds[q.passageIndex ?? 0] ?? null)
            : singlePassageId;
          const passageBody = multiPassageIds.length
            ? result.passages?.[q.passageIndex ?? 0]
            : result.passage?.bodyText;
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
          // metadata는 "스키마 컬럼을 늘리지 않고 문항에 붙이는 부가 정보"의 자리다(OX 뱃지가 선례).
          // 빈칸 번호(gap 9)와 자기검증 판정(#34)도 여기 얹는다 — 둘 다 마이그레이션이 필요 없다.
          // ⚠ 응시 스냅샷(exam_session_questions.snapshot)은 metadata를 싣지 않는다.
          //    그래서 학습자에게 보이는 "몇 번 빈칸인가"는 metadata가 아니라 발문 속 마커가 나른다.
          const metadata = {
            ...(isOxStyle ? { style: 'OX' } : {}),
            ...(ctx.blanksInPassage && q.blankIndex ? { blankIndex: q.blankIndex } : {}),
            ...(reviews?.[qIndex] ? { review: reviews[qIndex] } : {}),
          };
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
              ...(Object.keys(metadata).length ? { metadata: metadata as JsonWritable } : {}),
              // 판정의 집계용 사본(#33 잔여 1). metadata.review와 **같은 쓰기**에서 채운다 —
              // 갈라지면 컬럼만 비어 있는 문항이 생기고 품질 지표가 조용히 거짓말을 한다.
              reviewVerdict: readReviewVerdict(metadata),
              ...(q.explanationText
                ? { explanation: buildRichBlocks(q.explanationText) as JsonWritable }
                : {}),
              ...(tagIds.length ? { questionTags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
              difficulty: this.clampDifficulty(q.difficulty ?? ctx.difficulty),
              status: 'DRAFT',
              searchText: this.buildSearchText(q, passageBody),
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

  // --- 지문 내장 빈칸(#43 gap 9) ----------------------------------------

  /**
   * 빈칸 마커를 정본 형태로 정규화한 결과 사본을 만든다.
   *
   * 발문에 자기 마커가 없으면 **앞에 붙여 준다**. 파서에서 막지 않는 이유:
   * "몇 번 빈칸인지"는 blankIndex가 이미 확정했고, 발문에 표기가 빠진 건 우리가 조립으로
   * 메울 수 있는 표기 문제라 배치 전체를 FAILED로 떨굴 사유가 아니다(어긋난 번호는 파서가 막는다).
   * 이 표기가 곧 응시 화면에서 학습자가 보는 유일한 연결 고리다.
   */
  private normalizeBlanks(result: LlmGenerationResult): LlmGenerationResult {
    return {
      ...result,
      ...(result.passage
        ? {
            passage: {
              ...result.passage,
              bodyText: normalizeBlankMarkers(result.passage.bodyText),
            },
          }
        : {}),
      questions: result.questions.map((q) => {
        const stemText = normalizeBlankMarkers(q.stemText);
        const marker = q.blankIndex ? blankMarker(q.blankIndex) : '';
        return {
          ...q,
          stemText: marker && !stemText.includes(marker) ? `${marker} ${stemText}` : stemText,
        };
      }),
    };
  }

  // --- LLM 자기검증(#34 후속) -------------------------------------------

  /**
   * 생성 결과를 2차 호출로 판정한다. **옵트인이 아니면 호출하지 않는다** — 이 기능이 유예됐던
   * 이유가 "비용 배가"라, 꺼진 경로의 호출 횟수·지연·과금이 종전과 완전히 같아야 한다.
   *
   * 판정 결과로 **문항을 버리거나 재생성하지 않는다.** 재생성은 비용을 한 번 더 배가시키고,
   * 조용히 버리는 건 이 저장소가 일관되게 피하는 실패 모드다(AuthoringCanvas의 검증 실패 표시,
   * prosemirror.util의 "안전한 강등"과 같은 정신). 판정은 문항 metadata.review에 기록하고
   * REVISE는 로그로 띄워, 어차피 DRAFT로 검수 대기 중인 문항에 근거를 붙여 준다.
   *
   * 반환값은 문항 인덱스와 정렬된 배열(꺼져 있으면 null).
   */
  private async selfReview(
    ctx: LlmGenerationContext,
    result: LlmGenerationResult,
    generationId: string,
  ): Promise<ReviewNote[] | null> {
    if (!this.llm.isSelfReviewEnabled) return null;

    const at = new Date().toISOString();
    const model = this.llm.selfReviewModel;
    try {
      const { verdicts } = await this.llm.reviewGeneration(ctx, result);
      const byIndex = new Map(verdicts.map((v) => [v.index, v]));
      return result.questions.map((_, i) => {
        const v = byIndex.get(i);
        // 판정이 빠진 문항(파서가 막지만 방어) — "판정됐다"고 기록하지 않는다.
        if (!v) return { model, at, verdict: 'ERROR' as const, issues: ['판정 결과에 이 문항이 없습니다.'] };
        if (v.verdict === 'REVISE') {
          this.logger.warn(
            `자기검증 REVISE — 생성 ${generationId} ${i + 1}번 문항 [${v.axes.join(', ')}]: ${v.issues.join(' / ')}`,
          );
        }
        return { model, at, verdict: v.verdict, axes: v.axes, issues: v.issues };
      });
    } catch (err) {
      // 부가 판정이 본 생성을 깨뜨리면 안 된다 — 옵션을 켠 것만으로 배치가 FAILED가 된다.
      // 대신 "판정을 못 했다"는 사실을 문항마다 남긴다(통과했다고 기록하지 않는다).
      const reason = (err as Error).message;
      this.logger.warn(`생성 작업 ${generationId} 자기검증 실패 — 문항은 그대로 저장합니다: ${reason}`);
      return result.questions.map(() => ({ model, at, verdict: 'ERROR' as const, issues: [reason] }));
    }
  }

  // --- 유사(변형) 문항 생성 ---------------------------------------------

  /**
   * 변형 생성의 원본 문항을 평문화해 로드한다. 저장은 ProseMirror JSON이지만
   * LLM 입출력은 평문이라는 대전제(prosemirror.util)를 지키기 위해 여기서 걷어낸다.
   * 원본이 삭제됐으면 예외 → 재시도 소진 후 FAILED. 접근 권한은 요청 진입점
   * (ai-generation.service)이 이미 검증했다 — 큐 뒤에는 요청자 컨텍스트가 없다.
   */
  private async loadSourceQuestion(questionId: string): Promise<LlmSourceQuestion> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { passage: { select: { content: true } } },
    });
    if (!q) {
      throw new Error(`유사 문항 생성의 원본 문항(${questionId})을 찾을 수 없습니다.`);
    }
    const choices = Array.isArray(q.choices)
      ? (q.choices as { content?: unknown; isCorrect?: unknown }[]).map((c) => ({
          content: extractPlainText(c?.content as PMNode | PMNode[] | null | undefined),
          isCorrect: c?.isCorrect === true,
        }))
      : undefined;
    const passageText = q.passage ? extractPlainText(q.passage.content as PMNode).trim() : '';
    const explanationText = q.explanation
      ? extractPlainText(q.explanation as PMNode | PMNode[]).trim()
      : '';
    return {
      questionType: this.normalizeType(q.questionType),
      stemText: extractPlainText(q.stem as PMNode),
      ...(choices?.length ? { choices } : {}),
      ...(q.correctAnswerText ? { answerText: q.correctAnswerText } : {}),
      ...(explanationText ? { explanationText } : {}),
      ...(passageText ? { passageText } : {}),
      ...(q.difficulty != null ? { difficulty: q.difficulty } : {}),
    };
  }

  /** 원본 선지 개수(2~8 범위일 때만). 범위 밖이면 강제하지 않는다 — 검증이 배치를 떨군다. */
  private sourceChoiceCount(source?: LlmSourceQuestion): number | undefined {
    const n = source?.choices?.length;
    return n && n >= 2 && n <= 8 ? n : undefined;
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
