import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ShopService } from '@/modules/shop/shop.service';

function makeTx(coins: number) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins }),
      update: jest.fn().mockResolvedValue({ coins: coins }),
    },
    userInventory: { upsert: jest.fn().mockResolvedValue({}) },
    purchase: { create: jest.fn().mockResolvedValue({ id: 'p1' }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}
function makeService(tx: any) {
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) } as unknown as PrismaService;
  return new ShopService(prisma);
}

describe('ShopService.purchase', () => {
  it('잔고 부족이면 BadRequest, 차감 안 함', async () => {
    const tx = makeTx(50); // XP_BOOST 100
    await expect(makeService(tx).purchase('u1', 'XP_BOOST')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('없는 itemKey면 NotFound', async () => {
    const tx = makeTx(9999);
    await expect(makeService(tx).purchase('u1', 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('CONSUMABLE 구매: 코인 차감 + 인벤토리 upsert + Purchase(FULFILLED)', async () => {
    const tx = makeTx(500);
    await makeService(tx).purchase('u1', 'STREAK_SHIELD'); // 250
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { coins: { decrement: 250 } },
    }));
    expect(tx.userInventory.upsert).toHaveBeenCalled();
    expect(tx.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemKey: 'STREAK_SHIELD', status: 'FULFILLED' }),
    }));
  });

  it('PHYSICAL(쿠폰) 구매: Purchase status=PENDING', async () => {
    const tx = makeTx(9999);
    await makeService(tx).purchase('u1', 'RICEBALL_COUPON'); // 7777
    expect(tx.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING' }),
    }));
  });
});
