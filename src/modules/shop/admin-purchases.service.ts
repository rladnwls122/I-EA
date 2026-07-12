import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminPurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  listPending(status: 'PENDING' | 'FULFILLED' = 'PENDING') {
    return this.prisma.purchase.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, itemKey: true, coinCost: true, status: true, note: true, createdAt: true },
    });
  }

  /** PENDING만 전이(멱등·이중처리 방지). count===0 이면 없음/이미처리. */
  async fulfill(id: string, note?: string) {
    const upd = await this.prisma.purchase.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'FULFILLED', note: note ?? null },
    });
    if (upd.count === 0) throw new NotFoundException('처리 대상 구매가 없습니다.');
    return { id, status: 'FULFILLED' as const };
  }
}
