import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MeService } from '@/modules/me/me.service';

function makeService(owned: boolean) {
  const prisma = {
    userInventory: { findUnique: jest.fn().mockResolvedValue(owned ? { quantity: 1 } : null) },
    user: { update: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { svc: new MeService(prisma), prisma };
}

describe('MeService.equipCosmetic', () => {
  it('소유한 칭호 장착 → equippedTitle 세팅', async () => {
    const { svc, prisma } = makeService(true);
    await svc.equipCosmetic('u1', 'COSMETIC_TITLE_MASTER');
    expect((prisma as any).user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { equippedTitle: '문제의 지배자' },
    }));
  });
  it('미소유면 BadRequest', async () => {
    const { svc } = makeService(false);
    await expect(svc.equipCosmetic('u1', 'COSMETIC_TITLE_MASTER')).rejects.toBeInstanceOf(BadRequestException);
  });
});
