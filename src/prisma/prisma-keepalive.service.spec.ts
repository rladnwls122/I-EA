import { PrismaKeepAliveService } from './prisma-keepalive.service';
import { PrismaService } from './prisma.service';

describe('PrismaKeepAliveService', () => {
  it('SELECT 1을 실행해 커넥션을 깨운다', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ 1: 1 }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new PrismaKeepAliveService(prisma);

    await service.handleKeepAlive();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('쿼리가 실패해도 예외를 던지지 않는다(크론 루프가 죽지 않아야 함)', async () => {
    const queryRaw = jest.fn().mockRejectedValue(new Error('Server has closed the connection'));
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new PrismaKeepAliveService(prisma);

    await expect(service.handleKeepAlive()).resolves.toBeUndefined();
  });
});
