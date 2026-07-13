import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  SHOP_ITEMS, getShopItem, boostExpiryHours, type ShopItemKey,
} from '@/common/constants/shop';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  listItems() {
    return Object.entries(SHOP_ITEMS).map(([key, v]) => ({
      key, name: v.name, price: v.price, kind: v.kind,
    }));
  }

  /** 아이템 구매. 원자적: 잔고검증 → 차감 → 효과적용 → Purchase + CoinHistory. */
  async purchase(userId: string, itemKey: string) {
    const item = getShopItem(itemKey as ShopItemKey);
    if (!item) throw new NotFoundException('존재하지 않는 상품입니다.');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { coins: true, xpBoostUntil: true },
      });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

      const now = new Date();
      const status = item.kind === 'PHYSICAL' ? 'PENDING' : 'FULFILLED';
      const eff = item.effect;

      // COSMETIC은 중복 구매(이미 보유)를 차단한다 — 차감 전에 검사해야 이중 과금을 막는다.
      if (eff.type === 'COSMETIC') {
        const owned = await tx.userInventory.findUnique({
          where: { userId_itemKey: { userId, itemKey } },
          select: { quantity: true },
        });
        if (owned && owned.quantity >= 1) {
          throw new BadRequestException('이미 보유한 아이템입니다.');
        }
      }

      // 1) 코인 차감. 동시 구매로 인한 이중 차감/음수 잔고를 막기 위해
      //    "잔고가 충분할 때만" 조건부로 원자적 차감한다(loot-boxes open()의 openedAt 가드와 같은 패턴).
      const debit = await tx.user.updateMany({
        where: { id: userId, coins: { gte: item.price } },
        data: { coins: { decrement: item.price } },
      });
      if (debit.count === 0) throw new BadRequestException('코인이 부족합니다.');

      const afterDebit = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      const debitedCoins = afterDebit?.coins ?? 0;

      // 2) 효과 적용(부스터/인벤토리/코스메틱). PHYSICAL은 효과 없음(관리자 배송).
      const updated = { coins: debitedCoins };
      if (eff.type === 'BOOST') {
        // 기존 부스터가 새로 사는 부스터보다 더 나중에 만료되면 단축시키지 않는다(더 늦은 시점을 취한다).
        const newUntil = boostExpiryHours(now, eff.hours);
        const nextUntil =
          user.xpBoostUntil && user.xpBoostUntil > newUntil ? user.xpBoostUntil : newUntil;
        await tx.user.update({
          where: { id: userId },
          data: { xpBoostUntil: nextUntil },
        });
      } else if (eff.type === 'CONSUMABLE') {
        await tx.userInventory.upsert({
          where: { userId_itemKey: { userId, itemKey: eff.inventoryKey } },
          create: { userId, itemKey: eff.inventoryKey, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
      } else if (eff.type === 'COSMETIC') {
        await tx.userInventory.upsert({
          where: { userId_itemKey: { userId, itemKey } },
          create: { userId, itemKey, quantity: 1 },
          update: { quantity: 1 },
        });
      }

      // 3) 구매 원장 + 코인 원장
      const purchase = await tx.purchase.create({
        data: { userId, itemKey, coinCost: item.price, status },
        select: { id: true },
      });
      await tx.coinHistory.create({
        data: {
          userId, amount: -item.price, reason: 'PURCHASE',
          referenceId: purchase.id, balanceAfter: updated.coins,
        },
      });

      return { itemKey, coins: updated.coins, status };
    });
  }
}
