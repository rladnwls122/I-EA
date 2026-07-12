import { ConflictException } from '@nestjs/common';
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';

/**
 * FIX 2: 힌트 토큰 차감 레이스. 무료 3회를 소진한 상태(토큰 소모 경로)에서
 * 동시 열람으로 토큰이 이미 바닥났다면(updateMany count===0) 원자적으로 거부해야 하고,
 * 세션 문항/유저 상태를 갱신해서는 안 된다(음수 소모 방지).
 */
describe('ExamSessionsService.revealHint — 힌트 토큰 원자적 차감', () => {
  function makePrisma(over: {
    tokenDebitCount: number;
  }) {
    const tx = {
      userInventory: {
        updateMany: jest.fn().mockResolvedValue({ count: over.tokenDebitCount }),
      },
      examSessionQuestion: { update: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      examSessionQuestion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sq1',
          isHintUsed: false,
          hintUsedAt: null,
          question: { hintContent: '힌트 내용' },
          examSession: { userId: 'u1', status: 'IN_PROGRESS' },
        }),
      },
      user: {
        // 오늘 무료 3/3 소진 → 토큰 소모 경로를 강제한다.
        findUnique: jest.fn().mockResolvedValue({ hintFreeDate: new Date(), hintFreeUsed: 3 }),
      },
      userInventory: {
        findUnique: jest.fn().mockResolvedValue({ quantity: 1 }), // 토큰 보유
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    } as any;
    return { prisma, tx };
  }

  it('토큰 재고 있음(count=1): 정상 차감 + 세션 문항/유저 갱신', async () => {
    const { prisma, tx } = makePrisma({ tokenDebitCount: 1 });
    // hintContent가 있는 경로만 검증 — geminiLlm은 호출되지 않으므로 목이 필요 없다.
    const svc = new ExamSessionsService(prisma, {} as any);
    const r = await svc.revealHint('sq1', 'u1');
    expect(tx.userInventory.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'u1', itemKey: 'HINT_TOKEN', quantity: { gt: 0 } }),
      data: { quantity: { decrement: 1 } },
    }));
    expect(tx.examSessionQuestion.update).toHaveBeenCalled();
    expect(r.hint).toBe('힌트 내용');
  });

  it('레이스로 토큰 이미 소진(count=0): Conflict, 세션 문항/유저 갱신 안 함(음수 소모 방지)', async () => {
    const { prisma, tx } = makePrisma({ tokenDebitCount: 0 });
    const svc = new ExamSessionsService(prisma, {} as any);
    await expect(svc.revealHint('sq1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.examSessionQuestion.update).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
