import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';

function makeTx() {
  return {
    user: { update: jest.fn().mockResolvedValue({ coins: 40 }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    question: { update: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('ExamSessionsService.maybeAwardSolveMilestone', () => {
  const svc = new ExamSessionsService({} as any, {} as any);
  it('증가후 10 도달 + 미지급 → 저자 +20코인, 플래그 set', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 10, solveBonusAwarded: false }, new Date());
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'SOLVE_MILESTONE', amount: 20, referenceId: 'q1' }),
    }));
    expect(tx.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { solveBonusAwarded: true },
    }));
    expect(r.awarded).toBe(true);
  });
  it('이미 지급(flag true) → 무지급', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 15, solveBonusAwarded: true }, new Date());
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
    expect(r.awarded).toBe(false);
  });
  it('아직 10 미만 → 무지급', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 9, solveBonusAwarded: false }, new Date());
    expect(r.awarded).toBe(false);
  });
});
