import { PrismaService } from '@/prisma/prisma.service';
import { MeService } from '@/modules/me/me.service';

function makeService() {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({
      coins: 120, xpBoostUntil: null, equippedTitle: null, nameColor: null,
    }) },
    userInventory: { findMany: jest.fn().mockResolvedValue([
      { itemKey: 'STREAK_SHIELD', quantity: 2 },
      { itemKey: 'COSMETIC_TITLE_MASTER', quantity: 1 },
    ]) },
    lootBox: { count: jest.fn().mockResolvedValue(3) },
  } as unknown as PrismaService;
  return new MeService(prisma);
}

describe('MeService.wallet', () => {
  it('코인·인벤토리·미개봉 상자수를 합쳐 반환', async () => {
    const w = await makeService().wallet('u1');
    expect(w.coins).toBe(120);
    expect(w.inventory.STREAK_SHIELD).toBe(2);
    expect(w.inventory.HINT_TOKEN).toBe(0);
    expect(w.cosmetics.owned).toContain('COSMETIC_TITLE_MASTER');
    expect(w.unopenedBoxCount).toBe(3);
  });
});
