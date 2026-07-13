import { WorkbooksService } from '@/modules/workbooks/workbooks.service';

describe('WorkbooksService.awardForkReward', () => {
  it('원작자에게 [5,10] 코인 + WORKBOOK_FORK 원장', async () => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({ coins: 55 }) },
      coinHistory: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const svc = new WorkbooksService({} as any, {} as any);
    await (svc as any).awardForkReward(tx, 'owner1', 'forkwb1', () => 0); // 5코인

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { coins: { increment: 5 } },
      }),
    );
    expect(tx.coinHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'WORKBOOK_FORK', referenceId: 'forkwb1' }),
      }),
    );
  });
});
