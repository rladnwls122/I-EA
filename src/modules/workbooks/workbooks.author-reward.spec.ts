import { WorkbooksService } from '@/modules/workbooks/workbooks.service';
import { AUTHOR_PUBLISH_DAILY_CAP } from '@/common/constants/shop';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTx(over: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: null, authorRewardCount: 0 }),
      update: jest.fn().mockResolvedValue({ coins: 120 }),
    },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    xpHistory: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

describe('WorkbooksService.awardPublishReward', () => {
  // 생성자가 (PrismaService, ExamSessionsService) 2개 인자를 받는다 — 둘 다 mock 주입.
  it('캡 미달이면 코인+EXP 지급 + authorRewardCount 갱신', async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkbooksService({} as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'AUTHOR_PUBLISH', amount: 20 }),
    }));
    expect(r.rewarded).toBe(true);
  });

  it('오늘 캡(3/3) 소진이면 미지급', async () => {
    const tx = makeTx({
      user: {
        findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: new Date('2026-07-13T00:00:00'), authorRewardCount: 3 }),
        update: jest.fn(),
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkbooksService({} as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(r.rewarded).toBe(false);
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
  });
});

// FIX 5: PRIVATE→PUBLIC 전환 시 문항 저자 보상 루프가 캡 소진 후 조기 중단하는지.
// 대형 문제집에서 같은 저자의 문항이 많을 때 불필요한 read+write를 계속하면
// 트랜잭션 타임아웃 위험이 커지므로, 캡이 소진된 저자는 더 이상 호출하지 않아야 한다.
describe('WorkbooksService.update() — becomingPublic 발행 보상 조기 중단', () => {
  function makeTx() {
    // authorRewardCount는 실제 트랜잭션처럼 호출마다 누적된다(같은 tx 안의 이전 update가 다음 findUnique에 반영).
    let count = 0;
    return {
      workbook: { update: jest.fn().mockResolvedValue({ id: 'wb1', workbookTags: [] }) },
      workbookQuestion: {
        // 같은 저자(author1)의 문항 5개 — 캡(3)을 넘긴다.
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 5 }, () => ({ question: { creatorId: 'author1' } })),
        ),
      },
      user: {
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({ coins: 100, xp: 0, authorRewardDate: new Date(), authorRewardCount: count })),
        update: jest.fn().mockImplementation(({ data }: any) => {
          count = data.authorRewardCount;
          return Promise.resolve({ coins: 100, xp: 20 });
        }),
      },
      coinHistory: { create: jest.fn().mockResolvedValue({}) },
      xpHistory: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('캡(3) 소진 후에는 같은 저자에 대해 더 이상 보상 write를 시도하지 않는다', async () => {
    const tx = makeTx();
    const prisma = {
      workbook: {
        findUnique: jest.fn().mockResolvedValue({ ownerId: 'owner1', visibility: 'PRIVATE' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ visibility: 'PRIVATE', publishedAt: null }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new WorkbooksService(prisma as any, {} as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await svc.update('wb1', { visibility: 'PUBLIC' } as any, 'owner1');

    // 캡(3)만큼만 실제 보상 지급(user.update)이 일어난다.
    expect(tx.user.update).toHaveBeenCalledTimes(AUTHOR_PUBLISH_DAILY_CAP);
    // 4번째 문항에서 캡 소진을 감지하기 위한 조회까지 총 4회, 5번째 문항은 완전히 스킵된다.
    expect(tx.user.findUnique).toHaveBeenCalledTimes(AUTHOR_PUBLISH_DAILY_CAP + 1);

    // $transaction에 타임아웃 옵션이 전달됐는지도 함께 확인한다(안전마진).
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000 });
  });
});
