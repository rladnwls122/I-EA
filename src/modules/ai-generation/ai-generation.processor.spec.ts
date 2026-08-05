import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { AiGenerationProcessor } from './ai-generation.processor';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';

/**
 * AI 자동 키워드 태깅 — keywords 문자열 배열을 "키워드" 카테고리 태그로 upsert한다.
 * tags는 (category, name)이 유니크라 upsert가 멱등하다. 같은 생성 배치(트랜잭션)
 * 안에서는 캐시로 재조회까지 막는다(catalog.service.createTag와 같은 패턴).
 */
describe('AiGenerationProcessor.resolveKeywordTagIds', () => {
  async function setup() {
    const module = await Test.createTestingModule({
      providers: [
        AiGenerationProcessor,
        { provide: PrismaService, useValue: {} },
        { provide: GeminiLlmService, useValue: {} },
      ],
    }).compile();
    const processor = module.get(AiGenerationProcessor);
    const resolve = (
      tx: Prisma.TransactionClient,
      cache: Map<string, string>,
      keywords: string[],
    ) =>
      (
        processor as unknown as {
          resolveKeywordTagIds(
            tx: Prisma.TransactionClient,
            cache: Map<string, string>,
            keywords: string[],
          ): Promise<string[]>;
        }
      ).resolveKeywordTagIds(tx, cache, keywords);
    return { resolve };
  }

  /** upsert 한 번으로 기존 재사용/신규 생성이 모두 처리되므로 목도 하나면 된다. */
  const txWith = (id: string) =>
    ({
      tag: { upsert: jest.fn().mockResolvedValue({ id }) },
    }) as unknown as Prisma.TransactionClient;

  it('기존 태그가 있으면 그 id를 그대로 쓴다', async () => {
    const { resolve } = await setup();
    const tx = txWith('existing-tag');

    const ids = await resolve(tx, new Map(), ['이차방정식']);

    expect(ids).toEqual(['existing-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledTimes(1);
  });

  it('"키워드" 카테고리 복합 유니크 키로 upsert한다 — 중복 행이 생기지 않는다', async () => {
    const { resolve } = await setup();
    const tx = txWith('new-tag');

    const ids = await resolve(tx, new Map(), ['인과관계 오류']);

    expect(ids).toEqual(['new-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category_name: { category: '키워드', name: '인과관계 오류' } },
        update: {},
        create: { name: '인과관계 오류', category: '키워드' },
      }),
    );
  });

  it('같은 배치 안에서 같은 키워드는 캐시로 재사용 — DB를 다시 건드리지 않는다', async () => {
    const { resolve } = await setup();
    const tx = txWith('new-tag');
    const cache = new Map<string, string>();

    const first = await resolve(tx, cache, ['미적분']);
    const second = await resolve(tx, cache, ['미적분']);

    expect(first).toEqual(['new-tag']);
    expect(second).toEqual(['new-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledTimes(1);
  });

  it('빈 문자열/공백만 있는 키워드는 건너뛴다', async () => {
    const { resolve } = await setup();
    const tx = txWith('unused');

    const ids = await resolve(tx, new Map(), ['  ', '']);

    expect(ids).toEqual([]);
    expect(tx.tag.upsert).not.toHaveBeenCalled();
  });
});

// #43 템플릿 해석 — input_params 스냅샷의 templateId가 LLM 컨텍스트로 풀리는 경로.
describe('AiGenerationProcessor.process — 템플릿 해석', () => {
  const makeJob = () =>
    ({ data: { generationId: 'gen-1' }, attemptsMade: 0, opts: { attempts: 2 } }) as unknown as Job<{
      generationId: string;
    }>;

  const DEFAULT_RESULT = {
    questions: [
      {
        questionType: '객관식',
        stemText: '다음 중 옳은 것은?',
        choices: [
          { content: '선지1', isCorrect: true },
          { content: '선지2', isCorrect: false },
        ],
        difficulty: 3,
      },
    ],
  };

  async function setupProcess(
    inputParams: Record<string, unknown>,
    generateResult: unknown = DEFAULT_RESULT,
    // 자기검증(#34 후속)은 옵트인이다 — 기본 목은 스위치가 꺼진 상태를 그대로 흉내낸다.
    llmExtra: Record<string, unknown> = {},
  ) {
    const generate = jest.fn().mockResolvedValue(generateResult);
    let passageSeq = 0;
    const tx = {
      // 지문마다 다른 id를 돌려줘 문항-지문 연결을 검증할 수 있게 한다.
      passage: { create: jest.fn().mockImplementation(() => ({ id: `p${++passageSeq}` })) },
      question: { create: jest.fn().mockResolvedValue({ id: 'q1' }) },
      aiGeneration: { update: jest.fn() },
      tag: { upsert: jest.fn().mockResolvedValue({ id: 't1' }) },
    };
    const prisma = {
      aiGeneration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'gen-1',
          status: 'PENDING',
          creatorId: 'u1',
          subjectId: 's1',
          inputParams,
          subject: { name: 'Part5_문법', examCategory: 'RC', examType: '토익' },
        }),
        update: jest.fn(),
      },
      tag: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(tx)),
    };
    const llm = { generate, ...llmExtra };
    const module = await Test.createTestingModule({
      providers: [
        AiGenerationProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiLlmService, useValue: llm },
      ],
    }).compile();
    return { processor: module.get(AiGenerationProcessor), generate, tx, llm };
  }

  it('템플릿 기본값이 LLM 컨텍스트에 깔린다(toeic-part5 → 4지·영어·지문 없음·단일정답)', async () => {
    const { processor, generate } = await setupProcess({
      prompt: '어법 문항',
      difficulty: 3,
      questionCount: 1,
      templateId: 'toeic-part5',
    });
    await processor.process(makeJob());
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        choiceCount: 4,
        language: 'en',
        includePassage: false,
        answerMode: 'single',
        templateHints: expect.arrayContaining([expect.stringContaining('빈칸')]),
      }),
    );
  });

  it('요청에서 명시한 개별 파라미터가 템플릿 기본값보다 우선한다', async () => {
    const { processor, generate } = await setupProcess({
      prompt: '어법 문항',
      difficulty: 3,
      questionCount: 1,
      templateId: 'toeic-part5',
      choiceCount: 5,
      language: 'ko',
    });
    await processor.process(makeJob());
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ choiceCount: 5, language: 'ko' }),
    );
  });

  it('다중지문 템플릿이면 passageCount가 LLM 컨텍스트에 실린다(toeic-part7-double → 2)', async () => {
    const { processor, generate } = await setupProcess(
      { prompt: '이중지문 세트', difficulty: 3, questionCount: 5, templateId: 'toeic-part7-double' },
      {
        passages: ['문서 1', '문서 2'],
        questions: [
          {
            questionType: '객관식',
            stemText: 'Q1',
            choices: [
              { content: 'a', isCorrect: true },
              { content: 'b', isCorrect: false },
            ],
            passageIndex: 0,
            difficulty: 3,
          },
          {
            questionType: '객관식',
            stemText: 'Q2',
            choices: [
              { content: 'a', isCorrect: true },
              { content: 'b', isCorrect: false },
            ],
            passageIndex: 1,
            difficulty: 3,
          },
        ],
      },
    );
    await processor.process(makeJob());
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ includePassage: true, passageCount: 2 }),
    );
  });

  it('다중지문 결과는 지문마다 Passage 행을 만들고 문항을 passageIndex대로 연결한다(gap 3)', async () => {
    const { processor, tx } = await setupProcess(
      { prompt: '이중지문 세트', difficulty: 3, questionCount: 3, templateId: 'toeic-part7-double' },
      {
        passages: ['첫 번째 문서 본문', '두 번째 문서 본문'],
        questions: [
          {
            questionType: '객관식',
            stemText: 'Q1(문서1 근거)',
            choices: [
              { content: 'a', isCorrect: true },
              { content: 'b', isCorrect: false },
            ],
            passageIndex: 0,
            difficulty: 3,
          },
          {
            questionType: '객관식',
            stemText: 'Q2(문서2 근거)',
            choices: [
              { content: 'a', isCorrect: true },
              { content: 'b', isCorrect: false },
            ],
            passageIndex: 1,
            difficulty: 3,
          },
          {
            questionType: '객관식',
            stemText: 'Q3(문서2 근거)',
            choices: [
              { content: 'a', isCorrect: true },
              { content: 'b', isCorrect: false },
            ],
            passageIndex: 1,
            difficulty: 3,
          },
        ],
      },
    );
    await processor.process(makeJob());

    // 지문 2개 → Passage 행 2개
    expect(tx.passage.create).toHaveBeenCalledTimes(2);
    // 문항이 자기 지문을 문다: Q1 → p1, Q2·Q3 → p2
    const passageIdsOfQuestions = tx.question.create.mock.calls.map(
      (c: [{ data: { passageId: string | null } }]) => c[0].data.passageId,
    );
    expect(passageIdsOfQuestions).toEqual(['p1', 'p2', 'p2']);
    // search_text에는 각 문항의 "자기" 지문 본문이 실린다
    const searchTexts = tx.question.create.mock.calls.map(
      (c: [{ data: { searchText: string } }]) => c[0].data.searchText,
    );
    expect(searchTexts[0]).toContain('첫 번째 문서 본문');
    expect(searchTexts[0]).not.toContain('두 번째 문서 본문');
    expect(searchTexts[1]).toContain('두 번째 문서 본문');
  });

  // 지문 내장 빈칸(#43 gap 9 — 토익 Part 6)
  describe('지문 내장 빈칸', () => {
    const blankResult = {
      passage: { bodyText: 'We are [[1]] to announce that our hours are [[2]] extended.' },
      questions: [1, 2].map((n) => ({
        questionType: '객관식',
        stemText: `Which word fits [[${n}]]?`,
        choices: [
          { content: 'a', isCorrect: true },
          { content: 'b', isCorrect: false },
        ],
        blankIndex: n,
        difficulty: 3,
      })),
    };

    const params = {
      prompt: 'store hours notice',
      difficulty: 3,
      questionCount: 2,
      templateId: 'toeic-part6',
    };

    it('템플릿이 빈칸 모드를 LLM 컨텍스트에 실어 준다', async () => {
      const { processor, generate } = await setupProcess(params, blankResult);
      await processor.process(makeJob());
      expect(generate).toHaveBeenCalledWith(
        expect.objectContaining({ blanksInPassage: true, includePassage: true, passageCount: 1 }),
      );
    });

    it('지문·발문의 `[[n]]`이 저장 정본 `___(n)___`으로 정규화된다', async () => {
      const { processor, tx } = await setupProcess(params, blankResult);
      await processor.process(makeJob());

      const passageText = JSON.stringify(tx.passage.create.mock.calls[0][0].data.content);
      expect(passageText).toContain('___(1)___');
      expect(passageText).toContain('___(2)___');
      expect(passageText).not.toContain('[[1]]');

      const stems = tx.question.create.mock.calls.map(
        (c: [{ data: { stem: unknown } }]) => JSON.stringify(c[0].data.stem),
      );
      expect(stems[0]).toContain('___(1)___');
      expect(stems[1]).toContain('___(2)___');
    });

    it('발문에 마커가 빠져 있으면 조립이 앞에 붙여 준다 — 응시 화면의 유일한 연결 고리다', async () => {
      const { processor, tx } = await setupProcess(params, {
        ...blankResult,
        questions: blankResult.questions.map((q) => ({ ...q, stemText: 'Choose the best option.' })),
      });
      await processor.process(makeJob());
      const stems = tx.question.create.mock.calls.map(
        (c: [{ data: { stem: unknown } }]) => JSON.stringify(c[0].data.stem),
      );
      expect(stems[0]).toContain('___(1)___ Choose the best option.');
    });

    it('빈칸 번호를 metadata에도 남긴다(스키마 컬럼 추가 없이)', async () => {
      const { processor, tx } = await setupProcess(params, blankResult);
      await processor.process(makeJob());
      const metadata = tx.question.create.mock.calls.map(
        (c: [{ data: { metadata?: Record<string, unknown> } }]) => c[0].data.metadata,
      );
      expect(metadata[0]).toEqual({ blankIndex: 1 });
      expect(metadata[1]).toEqual({ blankIndex: 2 });
    });

    it('빈칸 모드가 아닌 생성은 metadata를 만들지 않는다 — 종전 동작 그대로', async () => {
      const { processor, tx } = await setupProcess({
        prompt: '문항',
        difficulty: 3,
        questionCount: 1,
      });
      await processor.process(makeJob());
      expect(tx.question.create.mock.calls[0][0].data.metadata).toBeUndefined();
    });
  });

  // LLM 자기검증(#34 후속) — 옵트인. 꺼진 경로의 동작·비용이 종전과 같아야 한다.
  describe('자기검증', () => {
    const params = { prompt: '문항', difficulty: 3, questionCount: 1 };

    it('스위치가 꺼져 있으면 판정 호출이 0회다', async () => {
      const reviewGeneration = jest.fn();
      const { processor, tx } = await setupProcess(params, DEFAULT_RESULT, {
        isSelfReviewEnabled: false,
        reviewGeneration,
      });
      await processor.process(makeJob());
      expect(reviewGeneration).not.toHaveBeenCalled();
      expect(tx.question.create.mock.calls[0][0].data.metadata).toBeUndefined();
    });

    it('켜면 판정 결과를 metadata.review에 기록한다 — 문항은 버리지 않는다', async () => {
      const reviewGeneration = jest.fn().mockResolvedValue({
        verdicts: [
          { index: 0, verdict: 'REVISE', axes: ['오답매력도'], issues: ['2번 선지가 한눈에 버려진다'] },
        ],
      });
      const { processor, tx } = await setupProcess(params, DEFAULT_RESULT, {
        isSelfReviewEnabled: true,
        selfReviewModel: 'gemini-2.5-flash',
        reviewGeneration,
      });
      await processor.process(makeJob());

      expect(reviewGeneration).toHaveBeenCalledTimes(1);
      // 판정이 REVISE여도 문항은 그대로 저장된다(조용히 버리지 않는다).
      expect(tx.question.create).toHaveBeenCalledTimes(1);
      const review = tx.question.create.mock.calls[0][0].data.metadata.review;
      expect(review).toEqual(
        expect.objectContaining({
          verdict: 'REVISE',
          axes: ['오답매력도'],
          issues: ['2번 선지가 한눈에 버려진다'],
          model: 'gemini-2.5-flash',
        }),
      );
    });

    it('판정 호출이 실패해도 생성 배치는 완료된다 — 부가 기능이 본 기능을 깨지 않는다', async () => {
      const reviewGeneration = jest.fn().mockRejectedValue(new Error('판정 모델 호출 실패'));
      const { processor, tx } = await setupProcess(params, DEFAULT_RESULT, {
        isSelfReviewEnabled: true,
        selfReviewModel: 'gemini-2.5-flash',
        reviewGeneration,
      });
      await processor.process(makeJob());

      expect(tx.aiGeneration.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } }),
      );
      // "판정 못 함"은 통과와 구분해 남긴다 — 조용히 PASS로 기록하지 않는다.
      const review = tx.question.create.mock.calls[0][0].data.metadata.review;
      expect(review.verdict).toBe('ERROR');
      expect(review.issues).toEqual(['판정 모델 호출 실패']);
    });
  });

  it('레지스트리에 없는 templateId는 경고만 남기고 무템플릿으로 진행한다(FAILED 아님)', async () => {
    const { processor, generate } = await setupProcess({
      prompt: '문항',
      difficulty: 3,
      questionCount: 1,
      templateId: '없는-템플릿',
    });
    const warn = jest
      .spyOn((processor as unknown as { logger: Logger }).logger, 'warn')
      .mockImplementation();
    await processor.process(makeJob());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('없는-템플릿'));
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ templateHints: [], answerMode: 'single' }),
    );
  });
});
