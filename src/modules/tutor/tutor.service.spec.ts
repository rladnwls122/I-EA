import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { QuestionSnapshot } from '@/modules/exam-sessions/grading.util';
import { buildTutorSystemPrompt } from './tutor.prompt';
import { TutorService, trimTurns } from './tutor.service';

type PrismaMock = {
  examSession: { findUnique: jest.Mock };
  examSessionQuestion: { findFirst: jest.Mock };
};
type RedisMock = {
  eval: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
};

function makeService(opts: {
  session?: unknown;
  sessionQuestion?: unknown;
  redis?: Partial<RedisMock>;
  gemini?: Partial<GeminiLlmService>;
}): { service: TutorService; prisma: PrismaMock; redis: RedisMock } {
  const prisma: PrismaMock = {
    examSession: { findUnique: jest.fn().mockResolvedValue(opts.session ?? null) },
    examSessionQuestion: {
      findFirst: jest.fn().mockResolvedValue(opts.sessionQuestion ?? null),
    },
  };
  const redis: RedisMock = {
    // 레이트 리밋은 Lua(eval)로 INCR+조건부 EXPIRE를 원자적으로 처리한다.
    eval: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    ...opts.redis,
  };
  const gemini = (opts.gemini ?? {}) as GeminiLlmService;
  const service = new TutorService(
    prisma as unknown as PrismaService,
    gemini,
    redis as never,
  );
  return { service, prisma, redis };
}

const inProgress = { userId: 'me', status: 'IN_PROGRESS' };

describe('TutorService 인가', () => {
  it('남의 세션이면 ForbiddenException', async () => {
    const { service } = makeService({ session: { userId: 'other', status: 'IN_PROGRESS' } });
    await expect(
      service.getHistory('me', { examSessionId: 's1', questionId: 'q1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('세션이 존재하지 않아도 ForbiddenException(존재 여부 비노출)', async () => {
    const { service } = makeService({ session: null });
    await expect(
      service.getHistory('me', { examSessionId: 's1', questionId: 'q1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUBMITTED 세션이면 ForbiddenException', async () => {
    const { service } = makeService({ session: { userId: 'me', status: 'SUBMITTED' } });
    await expect(
      service.getHistory('me', { examSessionId: 's1', questionId: 'q1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('세션에 없는 questionId면 NotFoundException', async () => {
    const { service } = makeService({ session: inProgress, sessionQuestion: null });
    await expect(
      service.getHistory('me', { examSessionId: 's1', questionId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('통과하면 히스토리를 반환한다', async () => {
    const turns = [{ role: 'user', text: '질문' }];
    const { service } = makeService({
      session: inProgress,
      sessionQuestion: { snapshot: {} },
      redis: { get: jest.fn().mockResolvedValue(JSON.stringify(turns)) },
    });
    const result = await service.getHistory('me', { examSessionId: 's1', questionId: 'q1' });
    expect(result.turns).toEqual(turns);
  });
});

/**
 * enforceRateLimit이 실제로 실행하는 Lua(eval) 계약을 목으로 흉내 낸다:
 * INCR 후 TTL이 없을 때만 EXPIRE. hasTtl로 EXPIRE 실행 횟수를 관찰한다.
 */
function makeRateEval() {
  const store = new Map<string, { count: number; hasTtl: boolean }>();
  let expireCalls = 0;
  const evalMock = jest.fn(
    (_script: string, _numKeys: number, key: string): Promise<number> => {
      const cur = store.get(key) ?? { count: 0, hasTtl: false };
      cur.count += 1; // INCR
      if (!cur.hasTtl) {
        // TTL(key) < 0 → 최초 창 생성 시에만 EXPIRE
        cur.hasTtl = true;
        expireCalls += 1;
      }
      store.set(key, cur);
      return Promise.resolve(cur.count);
    },
  );
  return { evalMock, expireCalls: () => expireCalls };
}

describe('TutorService 레이트 리밋', () => {
  const enforceOf = (service: TutorService) =>
    (
      service as unknown as {
        enforceRateLimit(u: string, s: string, q: string): Promise<void>;
      }
    ).enforceRateLimit.bind(service);

  it('30회까지는 통과하고 31번째 호출에서 429', async () => {
    let count = 0;
    const { service } = makeService({
      redis: { eval: jest.fn().mockImplementation(() => Promise.resolve(++count)) },
    });
    const enforce = enforceOf(service);

    // 1~30회는 통과.
    for (let i = 0; i < 30; i++) {
      await expect(enforce('me', 's1', 'q1')).resolves.toBeUndefined();
    }
    // 31번째(count=31)에서 429.
    await expect(enforce('me', 's1', 'q1')).rejects.toBeInstanceOf(HttpException);
    await expect(enforce('me', 's1', 'q1')).rejects.toMatchObject({ status: 429 });
  });

  it('첫 호출에서만 EXPIRE로 TTL을 걸고 key/window 인자를 넘긴다', async () => {
    const { evalMock } = makeRateEval();
    const { service, redis } = makeService({ redis: { eval: evalMock } });
    await enforceOf(service)('me', 's1', 'q1');
    // Lua에 (스크립트, numKeys=1, key, window='3600')를 넘긴다.
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'tutor:rate:me:s1:q1',
      '3600',
    );
  });

  it('회귀: TTL이 이미 붙은 키에는 EXPIRE를 다시 걸지 않는다(고정 창, 창 미연장)', async () => {
    const { evalMock, expireCalls } = makeRateEval();
    const { service } = makeService({ redis: { eval: evalMock } });
    const enforce = enforceOf(service);

    // 3600초 안에 연속 호출해도 EXPIRE는 최초 1회뿐 — 창이 연장(슬라이딩)되지 않는다.
    await enforce('me', 's1', 'q1');
    await enforce('me', 's1', 'q1');
    await enforce('me', 's1', 'q1');

    expect(expireCalls()).toBe(1);
  });
});

describe('trimTurns 상한', () => {
  it('20턴을 넘으면 오래된 턴부터 버린다', () => {
    const turns = Array.from({ length: 25 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      text: `t${i}`,
    }));
    const trimmed = trimTurns(turns);
    expect(trimmed).toHaveLength(20);
    // 최근 20턴만 남는다 → t0~t4는 버려지고 t5부터 유지.
    expect(trimmed[0].text).toBe('t5');
    expect(trimmed[19].text).toBe('t24');
  });

  it('총 문자 수가 8000자를 넘으면 오래된 턴부터 버린다', () => {
    // 각 3000자 × 4턴 = 12000자 > 8000. 오래된 것부터 잘려 8000자 이하로.
    const big = (n: number) => 'x'.repeat(n);
    const turns = [
      { role: 'user' as const, text: big(3000) },
      { role: 'model' as const, text: big(3000) },
      { role: 'user' as const, text: big(3000) },
      { role: 'model' as const, text: big(3000) },
    ];
    const trimmed = trimTurns(turns);
    const total = trimmed.reduce((s, t) => s + t.text.length, 0);
    expect(total).toBeLessThanOrEqual(8000);
    // 가장 최근 턴은 반드시 살아남는다.
    expect(trimmed[trimmed.length - 1]).toBe(turns[3]);
    // 오래된 것부터 버렸으므로 첫 턴은 사라진다.
    expect(trimmed).not.toContain(turns[0]);
  });
});

describe('buildTutorSystemPrompt 조립', () => {
  it('발문을 평문화하고 정답 정보를 <answer_context>에 격리한다', () => {
    const snapshot: QuestionSnapshot = {
      questionType: '주관식',
      stem: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'f(x) = x^2 의 도함수는?' }] },
        ],
      },
      correctAnswerText: '2x',
      explanation: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '거듭제곱 미분법' }] }],
      },
      points: 10,
      difficulty: 3,
    };

    const prompt = buildTutorSystemPrompt(snapshot);

    // 발문이 노드 트리가 아니라 평문으로 들어간다.
    expect(prompt).toContain('f(x) = x^2 의 도함수는?');
    expect(prompt).not.toContain('"type"');

    // correctAnswerText가 <answer_context> 블록 안에 있다.
    const start = prompt.indexOf('<answer_context>');
    const end = prompt.indexOf('</answer_context>');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const answerBlock = prompt.slice(start, end);
    expect(answerBlock).toContain('2x');
    expect(answerBlock).toContain('거듭제곱 미분법');
  });

  it('객관식이면 정답 선지 번호를 <answer_context>에만 넣는다', () => {
    const snapshot: QuestionSnapshot = {
      questionType: '객관식',
      stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '문제' }] }] },
      choices: [
        { id: 'c1', isCorrect: false, content: [{ type: 'paragraph', content: [{ type: 'text', text: '오답' }] }] },
        { id: 'c2', isCorrect: true, content: [{ type: 'paragraph', content: [{ type: 'text', text: '정답보기' }] }] },
      ],
      points: 10,
      difficulty: 2,
    };

    const prompt = buildTutorSystemPrompt(snapshot);
    const answerBlock = prompt.slice(
      prompt.indexOf('<answer_context>'),
      prompt.indexOf('</answer_context>'),
    );
    expect(answerBlock).toContain('2번');
    expect(answerBlock).toContain('정답보기');
  });
});
