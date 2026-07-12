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
      const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (user.coins < item.price) throw new BadRequestException('코인이 부족합니다.');

      const now = new Date();
      const status = item.kind === 'PHYSICAL' ? 'PENDING' : 'FULFILLED';

      // 1) 코인 차감
      const updated = await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: item.price } },
        select: { coins: true },
      });

      // 2) 효과 적용(부스터/인벤토리/코스메틱). PHYSICAL은 효과 없음(관리자 배송).
      const eff = item.effect;
      if (eff.type === 'BOOST') {
        await tx.user.update({
          where: { id: userId },
          data: { xpBoostUntil: boostExpiryHours(now, eff.hours) },
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
