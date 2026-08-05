import { BadRequestException } from '@nestjs/common';
import { ExamSessionsService } from './exam-sessions.service';
import { SelfGradeDto } from './dto/self-grade.dto';
import { maskSnapshot, QuestionSnapshot } from './grading.util';

/**
 * 서술형 자기채점의 부분점수 경로(#43 gap 8).
 *
 * 여기서 지키는 계약은 세 가지다.
 *  1) 채점기준표가 있으면 정오를 클라이언트가 아니라 배점 합이 결정한다.
 *  2) 부분점수는 새 컬럼 없이 answers.annotations의 예약 키에 남고, 기존 필기 값을 지우지 않는다.
 *  3) 채점기준표가 없는 문항의 기존 경로(isCorrect 불리언)는 그대로다.
 */

const essaySnapshot = (rubric?: unknown): QuestionSnapshot =>
  ({
    questionType: '주관식',
    stem: { type: 'doc', content: [] },
    correctAnswerText: null,
    points: 10,
    difficulty: 3,
    ...(rubric === undefined ? {} : { rubric }),
  }) as QuestionSnapshot;

const RUBRIC = [
  { id: 'c1', text: '핵심어 포함', points: 6 },
  { id: 'c2', text: '근거 제시', points: 4 },
];

/** 트랜잭션 안에서 selfGrade가 부르는 모든 경로를 받아내는 최소 mock. */
function makeTx() {
  return {
    examSessionAnswer: { update: jest.fn().mockResolvedValue({}) },
    question: {
      update: jest
        .fn()
        .mockResolvedValue({ id: 'q1', creatorId: 'author', totalSolvedCount: 1, solveBonusAwarded: false }),
    },
    userQuestionReviewState: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    userQuestionReviewTransition: { createMany: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue({ xp: 0, longestStreak: 0 }), update: jest.fn().mockResolvedValue({}) },
    xpHistory: { create: jest.fn().mockResolvedValue({}) },
    milestoneAchievement: { createMany: jest.fn().mockResolvedValue({}) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}

function makeService(opts: {
  snapshot: QuestionSnapshot;
  answer?: { id: string; isCorrect: boolean | null; annotations?: unknown };
}) {
  const tx = makeTx();
  const prisma = {
    examSessionQuestion: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'sq1',
        questionId: 'q1',
        snapshot: opts.snapshot,
        answer: opts.answer ?? { id: 'a1', isCorrect: null, annotations: null },
        examSession: { id: 's1', userId: 'u1', status: 'SUBMITTED', isReview: false },
      }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ExamSessionsService(prisma as any, {} as any);
  return { service, tx };
}

const call = (service: ExamSessionsService, dto: Partial<SelfGradeDto>) =>
  service.selfGrade('sq1', 'u1', dto as SelfGradeDto);

describe('selfGrade — 채점기준표가 있는 문항(부분점수)', () => {
  it('체크한 기준의 배점 합으로 채점하고, 60% 이상이면 정답으로 확정한다', async () => {
    const { service, tx } = makeService({ snapshot: essaySnapshot(RUBRIC) });

    const res = await call(service, { checkedCriterionIds: ['c1'] });

    expect(res.isCorrect).toBe(true); // 6/10 = 60%
    expect(res.rubricGrading).toEqual({
      checkedIds: ['c1'],
      earnedPoints: 6,
      totalPoints: 10,
      isCorrect: true,
    });
    expect(tx.examSessionAnswer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isCorrect: true }) }),
    );
  });

  it('60% 미만이면 오답으로 확정한다(정답률 캐시에도 오답으로 들어간다)', async () => {
    const { service, tx } = makeService({ snapshot: essaySnapshot(RUBRIC) });

    const res = await call(service, { checkedCriterionIds: ['c2'] }); // 4/10 = 40%

    expect(res.isCorrect).toBe(false);
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ totalSolvedCount: { increment: 1 } }),
      }),
    );
    // 오답이므로 correctSolvedCount는 올리지 않는다.
    expect(tx.question.update.mock.calls[0][0].data.correctSolvedCount).toBeUndefined();
  });

  it('부분점수를 annotations.rubricGrading에 남기고 기존 필기 값은 보존한다', async () => {
    const { service, tx } = makeService({
      snapshot: essaySnapshot(RUBRIC),
      answer: { id: 'a1', isCorrect: null, annotations: { strokes: [1, 2, 3] } },
    });

    await call(service, { checkedCriterionIds: ['c1', 'c2'] });

    expect(tx.examSessionAnswer.update.mock.calls[0][0].data.annotations).toEqual({
      strokes: [1, 2, 3],
      rubricGrading: { checkedIds: ['c1', 'c2'], earnedPoints: 10, totalPoints: 10, isCorrect: true },
    });
  });

  it('빈 배열이면 0점·오답 (체크 없음도 유효한 채점이다)', async () => {
    const { service } = makeService({ snapshot: essaySnapshot(RUBRIC) });
    const res = await call(service, { checkedCriterionIds: [] });
    expect(res.rubricGrading?.earnedPoints).toBe(0);
    expect(res.isCorrect).toBe(false);
  });

  it('rubric에 없는 기준 id는 400 — 조용히 버리면 체크한 것과 저장된 점수가 달라진다', async () => {
    const { service } = makeService({ snapshot: essaySnapshot(RUBRIC) });
    await expect(call(service, { checkedCriterionIds: ['c1', 'c9'] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('isCorrect를 직접 보내면 400 — 채점 근거는 하나여야 한다', async () => {
    const { service } = makeService({ snapshot: essaySnapshot(RUBRIC) });
    await expect(call(service, { isCorrect: true })).rejects.toThrow(BadRequestException);
  });

  it('형태가 깨진 rubric은 기준표 없는 문항처럼 다룬다(정오 2지선다로 폴백)', async () => {
    const { service } = makeService({ snapshot: essaySnapshot([{ id: 'c1', text: 'x' }]) });
    const res = await call(service, { isCorrect: true });
    expect(res.isCorrect).toBe(true);
    expect(res.rubricGrading).toBeNull();
  });
});

describe('maskSnapshot — 응시 중 채점기준표 은닉', () => {
  it('진행 중 스냅샷에서 rubric을 지운다(기준을 보면 그대로 베껴 쓸 수 있다)', () => {
    expect(maskSnapshot(essaySnapshot(RUBRIC)).rubric).toBeUndefined();
  });
});

describe('selfGrade — 채점기준표가 없는 기존 문항(불변)', () => {
  it('isCorrect 불리언 하나로 그대로 채점된다', async () => {
    const { service, tx } = makeService({ snapshot: essaySnapshot() });

    const res = await call(service, { isCorrect: true });

    expect(res.isCorrect).toBe(true);
    expect(res.rubricGrading).toBeNull();
    // annotations는 건드리지 않는다 — 부분점수가 없는 채점이다.
    expect(tx.examSessionAnswer.update.mock.calls[0][0].data.annotations).toBeUndefined();
    expect(tx.examSessionAnswer.update.mock.calls[0][0].data.isCorrect).toBe(true);
  });

  it('isCorrect가 없으면 400', async () => {
    const { service } = makeService({ snapshot: essaySnapshot() });
    await expect(call(service, {})).rejects.toThrow(BadRequestException);
  });

  it('checkedCriterionIds를 보내면 400 — 채점할 기준이 없다', async () => {
    const { service } = makeService({ snapshot: essaySnapshot() });
    await expect(call(service, { checkedCriterionIds: ['c1'] })).rejects.toThrow(
      BadRequestException,
    );
  });
});
