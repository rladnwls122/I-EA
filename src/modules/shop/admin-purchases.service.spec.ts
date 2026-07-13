import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AdminPurchasesService } from '@/modules/shop/admin-purchases.service';

describe('AdminPurchasesService.fulfill', () => {
  it('PENDING → FULFILLED 전이 + note', async () => {
    const prisma = {
      purchase: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const svc = new AdminPurchasesService(prisma);
    const r = await svc.fulfill('p1', '7/15 수령 완료');
    expect((prisma as any).purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'PENDING' },
      data: { status: 'FULFILLED', note: '7/15 수령 완료' },
    });
    expect(r).toEqual({ id: 'p1', status: 'FULFILLED' });
  });

  it('대상 없거나 이미 처리(count=0)면 NotFound', async () => {
    const prisma = { purchase: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as unknown as PrismaService;
    await expect(new AdminPurchasesService(prisma).fulfill('p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
