import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { rollCoins, type BoxTier } from '@/common/constants/shop';

@Injectable()
export class LootBoxesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 미개봉 상자 목록(최신순). */
  async listUnopened(userId: string) {
    return this.prisma.lootBox.findMany({
      where: { userId, openedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tier: true, createdAt: true },
    });
  }

  /**
   * 상자 개봉. openedAt IS NULL 가드로 동시 이중개봉을 원자적으로 차단한다.
   * updateMany count===0 이면 이미 열렸거나 내 것이 아님 → Conflict, 코인 크레딧 안 함.
   */
  async open(boxId: string, userId: string, rng: () => number = Math.random) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.lootBox.findUnique({
        where: { id: boxId },
        select: { id: true, userId: true, tier: true, openedAt: true },
      });
      if (!box || box.userId !== userId || box.openedAt) {
        throw new ConflictException('이미 개봉했거나 존재하지 않는 상자입니다.');
      }
      const reward = rollCoins(box.tier as BoxTier, rng);
      const now = new Date();
      const upd = await tx.lootBox.updateMany({
        where: { id: boxId, userId, openedAt: null },
        data: { openedAt: now, rewardCoins: reward },
      });
      if (upd.count === 0) {
        throw new ConflictException('이미 개봉된 상자입니다.');
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: reward } },
        select: { coins: true },
      });
      await tx.coinHistory.create({
        data: {
          userId, amount: reward, reason: 'BOX_OPEN',
          referenceId: boxId, balanceAfter: user.coins,
        },
      });
      return { id: boxId, tier: box.tier as BoxTier, rewardCoins: reward, coins: user.coins };
    });
  }
}
