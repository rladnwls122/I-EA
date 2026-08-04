import { ForbiddenException } from '@nestjs/common';
import { TutorService } from './tutor.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';

/**
 * 복습 튜터(#40) 인가 — 이 기능의 보안 경계 전체가 여기 있다.
 *
 * 두 가지를 동시에 막아야 한다:
 *  1. 안 푼 문항 복습(컨텍스트 부재 + 남의 문항 정답 열람)
 *  2. **지금 응시 중인 문항 복습** — 통과시키면 응시 중 정답 마스킹을 우회하는
 *     새 구멍이 된다. 복습이 커닝 경로가 되면 안 된다.
 */
const SNAPSHOT = {
  questionType: '객관식',
  stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '발문' }] }] },
  choices: [
    { id: 'c1', content: [{ type: 'paragraph', content: [{ type: 'text', text: '선지1' }] }] },
    { id: 'c2', isCorrect: true, content: [{ type: 'paragraph', content: [{ type: 'text', text: '선지2' }] }] },
  ],
  explanation: [{ type: 'paragraph', content: [{ type: 'text', text: '해설' }] }],
  points: 1,
  difficulty: 3,
};

const ANSWER_ROW = {
  isCorrect: false,
  selectedChoiceIds: ['c1'],
  answerText: null,
  examSessionQuestion: { snapshot: SNAPSHOT },
};

/**
 * @param answered  제출 세션에서 이 문항을 푼 기록(없으면 null)
 * @param active    같은 문항이 진행 중 세션에도 있는지
 */
function makeService(answered: unknown, active: unknown = null, annotations: unknown[] = []) {
  const prisma = {
    examSessionAnswer: { findFirst: jest.fn().mockResolvedValue(answered) },
    examSessionQuestion: { findFirst: jest.fn().mockResolvedValue(active) },
    userQuestionAnnotation: { findMany: jest.fn().mockResolvedValue(annotations) },
  } as unknown as PrismaService;
  const redis = {
    eval: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
  return new TutorService(prisma, {} as GeminiLlmService, redis as never);
}

describe('복습 튜터 인가 (#40)', () => {
  it('제출 세션에서 푼 문항이면 히스토리를 돌려준다', async () => {
    const service = makeService(ANSWER_ROW);
    await expect(service.getReviewHistory('u1', { questionId: 'q1' })).resolves.toEqual({
      turns: [],
    });
  });

  it('푼 기록이 없으면 거절한다 — 안 푼 문항의 정답을 코치로 캐낼 수 없다', async () => {
    const service = makeService(null);
    await expect(service.getReviewHistory('u1', { questionId: 'q1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getReviewHistory('u1', { questionId: 'q1' })).rejects.toThrow(
      /직접 푼 문항만/,
    );
  });

  it('같은 문항을 지금 응시 중이면 거절한다 — 마스킹 우회 차단', async () => {
    // 과거에 제출한 세션에서 푼 적은 있지만(answered), 지금 진행 중 세션에도 들어 있다.
    const service = makeService(ANSWER_ROW, { id: 'sq-active' });
    await expect(service.getReviewHistory('u1', { questionId: 'q1' })).rejects.toThrow(
      /응시 중입니다/,
    );
  });

  it('인가 조회는 반드시 본인(userId)과 SUBMITTED 세션으로 좁혀 묻는다', async () => {
    const service = makeService(ANSWER_ROW);
    await service.getReviewHistory('u1', { questionId: 'q1' });

    const prisma = (service as unknown as { prisma: any }).prisma;
    expect(prisma.examSessionAnswer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          examSessionQuestion: {
            questionId: 'q1',
            examSession: { userId: 'u1', status: 'SUBMITTED' },
          },
        },
      }),
    );
    // 진행 중 검사도 같은 사용자로 좁혀야 한다.
    expect(prisma.examSessionQuestion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { questionId: 'q1', examSession: { userId: 'u1', status: 'IN_PROGRESS' } },
      }),
    );
  });
});

describe('복습 튜터 Redis 키 분리', () => {
  it('히스토리 키에 userId가 들어간다 — 문항 단위라 없으면 대화가 공유된다', async () => {
    const service = makeService(ANSWER_ROW);
    await service.getReviewHistory('u1', { questionId: 'q1' });

    const redis = (service as unknown as { redis: any }).redis;
    expect(redis.get).toHaveBeenCalledWith('tutor:review:u1:q1');
  });

  it('풀이 중 튜터 키(tutor:{session}:{question})와 겹치지 않는다', async () => {
    const service = makeService(ANSWER_ROW);
    await service.getReviewHistory('u1', { questionId: 'q1' });

    const redis = (service as unknown as { redis: any }).redis;
    const key = redis.get.mock.calls[0][0] as string;
    expect(key.startsWith('tutor:review:')).toBe(true);
  });
});
