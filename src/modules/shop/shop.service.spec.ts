import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ShopService } from '@/modules/shop/shop.service';

/**
 * tx mock. user.findUnique는 두 곳에서 다른 select로 불린다:
 *  - 구매 시작 시 { coins, xpBoostUntil } (존재 확인 + 부스터 연장 판단용)
 *  - 원자적 차감(updateMany) 이후 잔고 재조회용 { coins }
 * select.xpBoostUntil 유무로 두 호출을 구분한다.
 */
function makeTx(
  coins: number,
  opts: { debitCount?: number; xpBoostUntil?: Date | null; ownedCosmetic?: boolean } = {},
) {
  const { debitCount = 1, xpBoostUntil = null, ownedCosmetic = false } = opts;
  return {
    user: {
      findUnique: jest.fn().mockImplementation(({ select }: any) => {
        if ('xpBoostUntil' in (select ?? {})) {
          return Promise.resolve({ coins, xpBoostUntil });
        }
        return Promise.resolve({ coins });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: debitCount }),
      update: jest.fn().mockResolvedValue({ coins }),
    },
    userInventory: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(ownedCosmetic ? { quantity: 1 } : null),
    },
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
    const tx = makeTx(50, { debitCount: 0 }); // XP_BOOST 100, 조건부 차감이 실패를 보고
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
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
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

  // FIX 1: 동시 구매 레이스 — 조건부 차감(updateMany)이 count===0을 보고하면
  // 잔고가 실제로는 부족한 것이므로 BadRequest, Purchase/CoinHistory 생성 안 함.
  it('동시 구매 레이스: 조건부 차감 count===0 → BadRequest, Purchase/CoinHistory 생성 안 함', async () => {
    const tx = makeTx(9999, { debitCount: 0 });
    await expect(makeService(tx).purchase('u1', 'STREAK_SHIELD')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.updateMany).toHaveBeenCalled();
    expect(tx.purchase.create).not.toHaveBeenCalled();
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
  });

  // FIX 3: 기존 부스터가 새로 사는 부스터보다 더 나중에 만료되면 단축시키지 않는다.
  it('BOOST: 기존 만료가 더 미래면 단축하지 않고 유지한다', async () => {
    const farFuture = new Date('2099-01-01T00:00:00Z');
    const tx = makeTx(9999, { xpBoostUntil: farFuture });
    await makeService(tx).purchase('u1', 'XP_BOOST'); // +24h, 훨씬 가까운 미래
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { xpBoostUntil: farFuture },
    }));
  });

  it('BOOST: 기존 만료가 더 과거/없으면 새 만료로 연장한다', async () => {
    const tx = makeTx(9999, { xpBoostUntil: null });
    await makeService(tx).purchase('u1', 'XP_BOOST');
    const call = tx.user.update.mock.calls[0][0];
    expect(call.data.xpBoostUntil).toBeInstanceOf(Date);
  });

  // FIX 4: 이미 보유한 코스메틱을 재구매하면 차단 + 차감 안 함.
  it('COSMETIC 재구매(이미 보유): BadRequest, 차감 안 함', async () => {
    const tx = makeTx(9999, { ownedCosmetic: true });
    await expect(makeService(tx).purchase('u1', 'COSMETIC_TITLE_MASTER')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.purchase.create).not.toHaveBeenCalled();
  });
});
