import { HttpException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { AuthoringChatService, trimAuthoringTurns } from './authoring-chat.service';
import type { TutorTurn } from './llm/llm.types';

describe('trimAuthoringTurns', () => {
  it('20턴을 넘으면 최근 20턴만 남긴다', () => {
    const turns: TutorTurn[] = Array.from({ length: 26 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      text: `t${i}`,
    }));
    const out = trimAuthoringTurns(turns);
    expect(out.length).toBe(20);
    expect(out[out.length - 1].text).toBe('t25');
  });

  it('20턴 이하는 그대로 둔다', () => {
    const turns: TutorTurn[] = [
      { role: 'user', text: 'a' },
      { role: 'model', text: 'b' },
    ];
    expect(trimAuthoringTurns(turns)).toHaveLength(2);
  });

  it('총 문자 수가 12000자를 넘으면 오래된 턴부터 버리고 최신 위주로 남긴다', () => {
    // 각 3000자 × 5턴 = 15000자 > 12000. 오래된 것부터 잘려 12000자 이하로.
    const big = (n: number) => 'x'.repeat(n);
    const turns: TutorTurn[] = [
      { role: 'user', text: big(3000) },
      { role: 'model', text: big(3000) },
      { role: 'user', text: big(3000) },
      { role: 'model', text: big(3000) },
      { role: 'user', text: big(3000) },
    ];
    const trimmed = trimAuthoringTurns(turns);
    const total = trimmed.reduce((sum, t) => sum + t.text.length, 0);
    expect(total).toBeLessThanOrEqual(12_000);
    // 가장 최근 턴은 반드시 살아남는다.
    expect(trimmed[trimmed.length - 1]).toBe(turns[4]);
    // 오래된 것부터 버렸으므로 첫 턴은 사라진다.
    expect(trimmed).not.toContain(turns[0]);
  });
});

type PrismaMock = {
  workbook: { findUnique: jest.Mock };
  subject: { findUnique: jest.Mock };
};
type RedisMock = {
  eval: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
};

function makeService(opts: {
  workbook?: unknown;
  subject?: unknown;
  redis?: Partial<RedisMock>;
  gemini?: Partial<GeminiLlmService>;
}): { service: AuthoringChatService; prisma: PrismaMock; redis: RedisMock } {
  const prisma: PrismaMock = {
    workbook: { findUnique: jest.fn().mockResolvedValue(opts.workbook ?? null) },
    subject: { findUnique: jest.fn().mockResolvedValue(opts.subject ?? null) },
  };
  const redis: RedisMock = {
    eval: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    ...opts.redis,
  };
  const gemini = (opts.gemini ?? {}) as GeminiLlmService;
  const service = new AuthoringChatService(
    prisma as unknown as PrismaService,
    gemini,
    redis as never,
  );
  return { service, prisma, redis };
}

describe('AuthoringChatService 레이트 리밋', () => {
  const enforceOf = (service: AuthoringChatService) =>
    (
      service as unknown as {
        enforceRateLimit(u: string, w: string): Promise<void>;
      }
    ).enforceRateLimit.bind(service);

  it('60회까지는 통과하고 61번째 호출에서 429', async () => {
    let count = 0;
    const { service } = makeService({
      redis: { eval: jest.fn().mockImplementation(() => Promise.resolve(++count)) },
    });
    const enforce = enforceOf(service);

    for (let i = 0; i < 60; i++) {
      await expect(enforce('me', 'w1')).resolves.toBeUndefined();
    }
    await expect(enforce('me', 'w1')).rejects.toBeInstanceOf(HttpException);
    await expect(enforce('me', 'w1')).rejects.toMatchObject({ status: 429 });
  });

  it('key/window 인자를 넘긴다', async () => {
    const { service, redis } = makeService({});
    await enforceOf(service)('me', 'w1');
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'authoring:rate:me:w1',
      '3600',
    );
  });
});
