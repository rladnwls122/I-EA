import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LootBoxesService } from '@/modules/loot-boxes/loot-boxes.service';

function makeTx(over: any = {}) {
  return {
    lootBox: {
      findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'u1', tier: 'COMMON', openedAt: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { update: jest.fn().mockResolvedValue({ coins: 25 }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

function makeService(tx: any) {
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) } as unknown as PrismaService;
  return new LootBoxesService(prisma);
}

describe('LootBoxesService.open', () => {
  it('개봉 성공: 코인 크레딧 + CoinHistory(referenceId=box) 기록', async () => {
    const tx = makeTx();
    const svc = makeService(tx);
    const res = await svc.open('b1', 'u1', () => 0.5); // COMMON [10,30] → 20
    expect(tx.lootBox.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', userId: 'u1', openedAt: null },
      data: expect.objectContaining({ rewardCoins: expect.any(Number) }),
    });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { coins: { increment: expect.any(Number) } },
    }));
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'BOX_OPEN', referenceId: 'b1' }),
    }));
    expect(res.coins).toBe(25);
  });

  it('이미 개봉된 상자(updateMany count=0)면 ConflictException, 크레딧 안 함', async () => {
    const tx = makeTx({
      lootBox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'u1', tier: 'COMMON', openedAt: new Date() }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = makeService(tx);
    await expect(svc.open('b1', 'u1', () => 0.5)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('타인 소유 상자면 ConflictException', async () => {
    const tx = makeTx({
      lootBox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'other', tier: 'COMMON', openedAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = makeService(tx);
    await expect(svc.open('b1', 'u1', () => 0.5)).rejects.toBeInstanceOf(ConflictException);
  });
});
