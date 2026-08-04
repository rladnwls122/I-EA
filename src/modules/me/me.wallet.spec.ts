import { PrismaService } from '@/prisma/prisma.service';
import { MeService } from '@/modules/me/me.service';
import { AI_FREE_PER_DAY } from '@/common/constants/shop';

function makeService(
  over: { inventory?: { itemKey: string; quantity: number }[]; user?: Record<string, unknown> } = {},
) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        coins: 120,
        xpBoostUntil: null,
        equippedTitle: null,
        nameColor: null,
        aiFreeDate: null,
        aiFreeUsed: 0,
        ...over.user,
      }),
    },
    userInventory: {
      findMany: jest.fn().mockResolvedValue(
        over.inventory ?? [
          { itemKey: 'STREAK_SHIELD', quantity: 2 },
          { itemKey: 'COSMETIC_TITLE_MASTER', quantity: 1 },
        ],
      ),
    },
    lootBox: { count: jest.fn().mockResolvedValue(3) },
  } as unknown as PrismaService;
  return new MeService(prisma);
}

describe('MeService.wallet', () => {
  it('코인·인벤토리·미개봉 상자수를 합쳐 반환', async () => {
    const w = await makeService().wallet('u1');
    expect(w.coins).toBe(120);
    expect(w.inventory.STREAK_SHIELD).toBe(2);
    expect(w.cosmetics.owned).toContain('COSMETIC_TITLE_MASTER');
    expect(w.unopenedBoxCount).toBe(3);
  });

  it('보유하지 않은 AI 크레딧은 0으로 나온다(키 자체가 사라지지 않는다)', async () => {
    const w = await makeService().wallet('u1');
    expect(w.inventory.AI_CREDIT).toBe(0);
  });

  it('AI 크레딧 보유분을 그대로 싣는다', async () => {
    const w = await makeService({
      inventory: [{ itemKey: 'AI_CREDIT', quantity: 7 }],
    }).wallet('u1');
    expect(w.inventory.AI_CREDIT).toBe(7);
  });

  it('오늘 한 번도 안 썼으면 무료 턴이 전부 남아 있다', async () => {
    const w = await makeService().wallet('u1');
    expect(w.aiFreeRemaining).toBe(AI_FREE_PER_DAY);
  });

  it('어제 다 썼어도 오늘은 다시 전부 남는다(날짜 리셋)', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const w = await makeService({
      user: { aiFreeDate: yesterday, aiFreeUsed: AI_FREE_PER_DAY },
    }).wallet('u1');
    expect(w.aiFreeRemaining).toBe(AI_FREE_PER_DAY);
  });

  it('오늘 쓴 만큼 줄어든다', async () => {
    const w = await makeService({
      user: { aiFreeDate: new Date(), aiFreeUsed: 2 },
    }).wallet('u1');
    expect(w.aiFreeRemaining).toBe(AI_FREE_PER_DAY - 2);
  });
});
