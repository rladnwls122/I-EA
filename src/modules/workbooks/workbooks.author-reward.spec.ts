import { WorkbooksService } from '@/modules/workbooks/workbooks.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTx(over: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: null, authorRewardCount: 0 }),
      update: jest.fn().mockResolvedValue({ coins: 120 }),
    },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    xpHistory: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

describe('WorkbooksService.awardPublishReward', () => {
  // 생성자가 (PrismaService, ExamSessionsService) 2개 인자를 받는다 — 둘 다 mock 주입.
  it('캡 미달이면 코인+EXP 지급 + authorRewardCount 갱신', async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkbooksService({} as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'AUTHOR_PUBLISH', amount: 20 }),
    }));
    expect(r.rewarded).toBe(true);
  });

  it('오늘 캡(3/3) 소진이면 미지급', async () => {
    const tx = makeTx({
      user: {
        findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: new Date('2026-07-13T00:00:00'), authorRewardCount: 3 }),
        update: jest.fn(),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkbooksService({} as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(r.rewarded).toBe(false);
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
  });
});
