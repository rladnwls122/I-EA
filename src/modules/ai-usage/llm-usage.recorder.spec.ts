import { Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LlmPricingService } from './llm-pricing';
import { LlmCallMeta, LlmUsageRecorder } from './llm-usage.recorder';

/**
 * 원장 기록기의 계약 두 가지:
 *  1) 단가를 모르면 costMicros를 null로 남긴다(0이 아니다).
 *  2) 어떤 이유로도 던지지 않는다 — 회계가 기능을 죽이면 안 된다.
 */
const META: LlmCallMeta = { userId: 'u1', feature: 'GENERATION', generationId: 'gen-1' };
const TOKENS = { promptTokens: 1000, outputTokens: 500, thinkingTokens: 200, totalTokens: 1700 };

function setup(prices: { inputPerMTok: number; outputPerMTok: number } | null, create = jest.fn()) {
  const prisma = { llmUsage: { create } } as unknown as PrismaService;
  const pricing = new LlmPricingService({
    get: (k: string) =>
      prices
        ? { GEMINI_PRICE_INPUT_PER_MTOK: String(prices.inputPerMTok), GEMINI_PRICE_OUTPUT_PER_MTOK: String(prices.outputPerMTok) }[k]
        : undefined,
  } as never);
  return { recorder: new LlmUsageRecorder(prisma, pricing), create };
}

describe('LlmUsageRecorder', () => {
  it('토큰과 호출 주체를 한 행으로 남긴다', async () => {
    const { recorder, create } = setup({ inputPerMTok: 0.3, outputPerMTok: 2.5 });

    await recorder.record(META, 'gemini-3.6-flash', 'OK', TOKENS, new Date(2026, 8, 4, 10));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        feature: 'GENERATION',
        generationId: 'gen-1',
        model: 'gemini-3.6-flash',
        status: 'OK',
        promptTokens: 1000,
        outputTokens: 500,
        thinkingTokens: 200,
        totalTokens: 1700,
        usageDate: '2026-09-04',
      }),
    });
  });

  it('단가가 설정돼 있으면 원가를 계산해 넣는다', async () => {
    const { recorder, create } = setup({ inputPerMTok: 0.3, outputPerMTok: 2.5 });

    await recorder.record(META, 'm', 'OK', TOKENS);

    // 입력 1000 × 0.3/M + 출력(500+200) × 2.5/M = $0.00205
    expect(create.mock.calls[0][0].data.costMicros).toBe(2050);
  });

  it('단가가 없으면 costMicros는 null이다 — 토큰은 사실이고 원가는 파생값이다', async () => {
    const { recorder, create } = setup(null);

    await recorder.record(META, 'm', 'OK', TOKENS);

    expect(create.mock.calls[0][0].data.costMicros).toBeNull();
    expect(create.mock.calls[0][0].data.totalTokens).toBe(1700);
  });

  it('실패한 호출도 상태만 갈라 기록한다 — 실패율 자체가 원가 지표다', async () => {
    const { recorder, create } = setup(null);

    await recorder.record(META, 'm', 'FAILED', {
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
    });

    expect(create.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('DB 쓰기가 실패해도 던지지 않는다 — 원장 때문에 생성이 되돌아가면 손해가 더 크다', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { recorder } = setup(null, jest.fn().mockRejectedValue(new Error('DB 다운')));

    await expect(recorder.record(META, 'm', 'OK', TOKENS)).resolves.toBeUndefined();
  });
});
