import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmUsageRecorder } from '@/modules/ai-usage/llm-usage.recorder';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmGenerationContext } from './llm.types';

/** 원장 기록용 호출 주체. 이 스펙들은 기록기를 스텁으로 갈아 끼우므로 값 자체는 의미가 없다. */
const USAGE_META = { userId: 'user-1', feature: 'GENERATION' } as const;

/**
 * 지문 내장 빈칸(#43 gap 9 — 토익 Part 6).
 *
 * 지문 하나에 번호 붙은 빈칸이 N개 있고 문항 하나가 빈칸 하나를 맡는다. 스키마에는 그 연결을
 * 담을 자리가 없어서 **지문 평문의 `[[n]]` 마커 + 문항의 blankIndex**가 계약이다.
 * 여기서 지키는 것은 그 대응이 깨진 응답이 조용히 저장되지 않는다는 것.
 */
describe('GeminiLlmService.generate — 지문 내장 빈칸', () => {
  let service: GeminiLlmService;

  const ctx: LlmGenerationContext = {
    prompt: 'a customer notice with in-text blanks',
    difficulty: 3,
    questionCount: 2,
    includePassage: true,
    passageCount: 1,
    blanksInPassage: true,
    language: 'en',
    examType: '토익',
    examCategory: 'RC',
    subjectName: 'Part6_빈칸',
  };

  const question = (blankIndex: number | undefined, stemText = 'Choose the best option.') => ({
    questionType: '객관식',
    stemText,
    choices: [
      { content: 'a', isCorrect: true },
      { content: 'b', isCorrect: false },
    ],
    ...(blankIndex === undefined ? {} : { blankIndex }),
    difficulty: 3,
  });

  const body = (text: string) => JSON.stringify({ passage: { bodyText: text }, questions: [] });

  function response(passageBody: string, questions: unknown[]): string {
    return JSON.stringify({ passage: { bodyText: passageBody }, questions });
  }

  function spyCall(raw: string) {
    return jest
      .spyOn(
        service as unknown as { callGemini: (...a: unknown[]) => Promise<string> },
        'callGemini',
      )
      .mockResolvedValue(raw);
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiLlmService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: LlmUsageRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(GeminiLlmService);
  });

  it('마커와 blankIndex가 일대일이면 통과한다', async () => {
    spyCall(
      response('We are [[1]] to announce that hours are [[2]] extended.', [
        question(1),
        question(2),
      ]),
    );
    const res = await service.generate(ctx, USAGE_META);
    expect(res.questions.map((q) => q.blankIndex)).toEqual([1, 2]);
  });

  it('지문에 마커가 없으면 예외 — 빈칸 없는 지문은 풀 수 없는 세트가 된다', async () => {
    spyCall(response('We are pleased to announce extended hours.', [question(1), question(2)]));
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/빈칸 마커/);
  });

  it('마커 개수가 문항 수와 다르면 예외', async () => {
    spyCall(response('only one [[1]] here', [question(1), question(2)]));
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/빈칸 마커/);
  });

  it('마커가 글의 순서대로 붙지 않으면 예외 — 학습자가 (2)를 (1)보다 먼저 읽게 된다', async () => {
    spyCall(response('first [[2]] then [[1]]', [question(1), question(2)]));
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/순서대로/);
  });

  it('blankIndex가 없는 문항이 있으면 예외', async () => {
    spyCall(response('a [[1]] b [[2]]', [question(1), question(undefined)]));
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/빈칸 번호/);
  });

  it('같은 빈칸에 문항이 두 개면 예외', async () => {
    spyCall(response('a [[1]] b [[2]]', [question(1), question(1)]));
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/두 개 이상/);
  });

  it('발문이 자기 빈칸이 아닌 마커를 가리키면 예외 — 지문의 엉뚱한 자리를 보게 된다', async () => {
    spyCall(
      response('a [[1]] b [[2]]', [question(1, 'What fits [[2]]?'), question(2, 'What fits [[2]]?')]),
    );
    await expect(service.generate(ctx, USAGE_META)).rejects.toThrow(/자기 빈칸/);
  });

  it('빈칸 모드가 아니면 마커 검증을 하지 않는다 — 기존 경로의 동작은 그대로', async () => {
    spyCall(response('마커가 하나도 없는 평범한 지문', [question(undefined), question(undefined)]));
    await expect(
      service.generate({ ...ctx, blanksInPassage: false }, USAGE_META),
    ).resolves.toBeDefined();
  });

  it('마커 규약과 blankIndex 스키마가 시스템 프롬프트에 실린다', async () => {
    const call = spyCall(response('a [[1]] b [[2]]', [question(1), question(2)]));
    await service.generate(ctx, USAGE_META);
    const system = call.mock.calls[0][0] as string;
    expect(system).toContain('blankIndex');
    expect(system).toContain('[[1]]');
    expect(system).toContain('[[2]]');
  });

  it('빈칸 모드가 아니면 마커 지시가 프롬프트에 실리지 않는다', async () => {
    const call = spyCall(body('평범한 지문'));
    await service.generate({ ...ctx, blanksInPassage: false, questionCount: 0 }, USAGE_META).catch(() => {});
    const system = call.mock.calls[0][0] as string;
    expect(system).not.toContain('blankIndex');
  });

  it('빈칸 수 = 문항 수임을 사용자 프롬프트에 명시한다', async () => {
    const call = spyCall(response('a [[1]] b [[2]]', [question(1), question(2)]));
    await service.generate(ctx, USAGE_META);
    const user = call.mock.calls[0][1] as string;
    expect(user).toContain('빈칸을 2개');
  });
});
