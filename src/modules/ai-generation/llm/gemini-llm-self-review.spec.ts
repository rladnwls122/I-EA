import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmUsageRecorder } from '@/modules/ai-usage/llm-usage.recorder';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmGenerationContext, LlmGenerationResult, REVIEW_AXES } from './llm.types';

/** 원장 기록용 호출 주체. 이 스펙들은 기록기를 스텁으로 갈아 끼우므로 값 자체는 의미가 없다. */
const USAGE_META = { userId: 'user-1', feature: 'GENERATION' } as const;

/**
 * LLM 자기검증(#34 후속) — 옵트인 2차 호출의 스위치·프롬프트·판정 파서.
 *
 * 이 기능이 유예됐던 이유가 "비용 배가"라, 기본값이 꺼짐이라는 것 자체가 계약이다.
 */
describe('GeminiLlmService — 자기검증', () => {
  const makeService = async (env: Record<string, string> = {}) => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiLlmService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => env[k] ?? (k === 'GEMINI_API_KEY' ? 'test-key' : undefined) },
        },
        { provide: LlmUsageRecorder, useValue: { record: jest.fn() } },
      ],
    }).compile();
    return module.get(GeminiLlmService);
  };

  const ctx: LlmGenerationContext = {
    prompt: '고전소설 문항',
    difficulty: 3,
    questionCount: 1,
    includePassage: true,
    examType: '수능',
    examCategory: '국어',
    subjectName: '문학',
  };

  const result: LlmGenerationResult = {
    passage: { bodyText: '지문 본문' },
    questions: [
      {
        questionType: '객관식',
        stemText: '윗글에 대한 이해로 가장 적절한 것은?',
        choices: [
          { content: '정답 선지', isCorrect: true },
          { content: '오답 선지', isCorrect: false },
        ],
        explanationText: '해설',
        difficulty: 3,
      },
    ],
  };

  const spyCall = (service: GeminiLlmService, raw: string) =>
    jest
      .spyOn(
        service as unknown as { callGemini: (...a: unknown[]) => Promise<string> },
        'callGemini',
      )
      .mockResolvedValue(raw);

  describe('스위치 (#33 도그푸딩 잔여 1 — 기본 켬)', () => {
    it('기본값은 켜짐 — env가 없어도 자기검증이 돈다', async () => {
      expect((await makeService()).isSelfReviewEnabled).toBe(true);
      expect((await makeService({ AI_SELF_REVIEW: '' })).isSelfReviewEnabled).toBe(true);
    });

    it('끄려면 끄는 뜻을 명시해야 한다 — 오타로 조용히 꺼지지 않는다', async () => {
      for (const off of ['false', 'FALSE', '0', 'off', 'no', ' false ']) {
        expect((await makeService({ AI_SELF_REVIEW: off })).isSelfReviewEnabled).toBe(false);
      }
      for (const on of ['true', '1', 'yes', 'ture']) {
        expect((await makeService({ AI_SELF_REVIEW: on })).isSelfReviewEnabled).toBe(true);
      }
    });

    it('판정 모델은 생성 모델을 그대로 쓴다(결정 6 — 같은 값을 가리키는 두 번째 손잡이를 만들지 않는다)', async () => {
      const service = await makeService({ GEMINI_MODEL: 'gemini-2.5-flash' });
      expect(service.selfReviewModel).toBe(service.model);
    });
  });

  describe('판정 프롬프트', () => {
    it('코드가 못 잡는 4축만 판정하게 하고, 형식 규격은 다시 보지 말라고 못 박는다', async () => {
      const service = await makeService();
      const call = spyCall(service, JSON.stringify({ verdicts: [{ index: 0, verdict: 'PASS' }] }));
      await service.reviewGeneration(ctx, result, USAGE_META);
      const system = call.mock.calls[0][0] as string;
      for (const axis of REVIEW_AXES) expect(system).toContain(axis);
      expect(system).toContain('형식 규격은 이미 기계 검증을 통과했다');
    });

    it('지문·발문·선지와 정답 표시를 함께 넘긴다 — 정답을 모르면 오답 매력도를 볼 수 없다', async () => {
      const service = await makeService();
      const call = spyCall(service, JSON.stringify({ verdicts: [{ index: 0, verdict: 'PASS' }] }));
      await service.reviewGeneration(ctx, result, USAGE_META);
      const user = call.mock.calls[0][1] as string;
      expect(user).toContain('지문 본문');
      expect(user).toContain('윗글에 대한 이해로 가장 적절한 것은?');
      expect(user).toContain('← 정답');
    });
  });

  describe('판정 파서', () => {
    it('PASS 판정을 그대로 돌려준다', async () => {
      const service = await makeService();
      spyCall(service, JSON.stringify({ verdicts: [{ index: 0, verdict: 'PASS', axes: [], issues: [] }] }));
      const { verdicts } = await service.reviewGeneration(ctx, result, USAGE_META);
      expect(verdicts).toEqual([{ index: 0, verdict: 'PASS', axes: [], issues: [] }]);
    });

    it('REVISE 판정의 축·지적을 보존한다', async () => {
      const service = await makeService();
      spyCall(
        service,
        JSON.stringify({
          verdicts: [
            { index: 0, verdict: 'REVISE', axes: ['오답매력도'], issues: ['2번 선지가 한눈에 버려진다'] },
          ],
        }),
      );
      const { verdicts } = await service.reviewGeneration(ctx, result, USAGE_META);
      expect(verdicts[0].axes).toEqual(['오답매력도']);
      expect(verdicts[0].issues).toEqual(['2번 선지가 한눈에 버려진다']);
    });

    it('모르는 축 이름은 떨구되 판정 자체는 살린다', async () => {
      const service = await makeService();
      spyCall(
        service,
        JSON.stringify({
          verdicts: [{ index: 0, verdict: 'REVISE', axes: ['참신성', '발문형식'], issues: ['발문이 모호하다'] }],
        }),
      );
      const { verdicts } = await service.reviewGeneration(ctx, result, USAGE_META);
      expect(verdicts[0].axes).toEqual(['발문형식']);
    });

    it('근거 없는 REVISE도 검수자가 읽을 문장을 남긴다', async () => {
      const service = await makeService();
      spyCall(service, JSON.stringify({ verdicts: [{ index: 0, verdict: 'REVISE', axes: [], issues: [] }] }));
      const { verdicts } = await service.reviewGeneration(ctx, result, USAGE_META);
      expect(verdicts[0].issues[0]).toContain('판정 근거가 제시되지 않았습니다');
    });

    it('문항 수와 판정 수가 다르면 예외 — "판정했다"고 기록할 수 없다', async () => {
      const service = await makeService();
      spyCall(service, JSON.stringify({ verdicts: [] }));
      await expect(service.reviewGeneration(ctx, result, USAGE_META)).rejects.toThrow(/판정하지 않았습니다/);
    });

    it('알 수 없는 판정값은 예외', async () => {
      const service = await makeService();
      spyCall(service, JSON.stringify({ verdicts: [{ index: 0, verdict: 'MAYBE' }] }));
      await expect(service.reviewGeneration(ctx, result, USAGE_META)).rejects.toThrow(/판정값이 잘못/);
    });

    it('JSON이 아니면 예외', async () => {
      const service = await makeService();
      spyCall(service, '판정을 할 수 없습니다');
      await expect(service.reviewGeneration(ctx, result, USAGE_META)).rejects.toThrow(/JSON을 찾지 못했습니다/);
    });
  });
});
