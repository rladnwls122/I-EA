import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * 레이트리밋 카운터가 인스턴스별로 갈리면 안 된다. 그래서 Redis에 둔다.
 * 여기서는 계약을 지킨다: 한도 초과 판정, 창 갱신 금지, 그리고 Redis 장애 시 통과.
 */
type EvalArgs = [script: string, numKeys: number, ...rest: string[]];

const makeRedis = (evalImpl: (...args: EvalArgs) => Promise<unknown>) =>
  ({ eval: jest.fn(evalImpl) }) as unknown as ConstructorParameters<
    typeof RedisThrottlerStorage
  >[0];

describe('RedisThrottlerStorage', () => {
  it('한도 이내면 통과시킨다', async () => {
    const storage = new RedisThrottlerStorage(makeRedis(async () => [3, 250]));

    const out = await storage.increment('ip:1.2.3.4', 300_000, 10, 300_000, 'login');

    expect(out.totalHits).toBe(3);
    expect(out.isBlocked).toBe(false);
    expect(out.timeToExpire).toBe(250);
    expect(out.timeToBlockExpire).toBe(0);
  });

  it('한도를 넘으면 차단으로 표시한다', async () => {
    const storage = new RedisThrottlerStorage(makeRedis(async () => [11, 120]));

    const out = await storage.increment('ip:1.2.3.4', 300_000, 10, 300_000, 'login');

    expect(out.isBlocked).toBe(true);
    expect(out.timeToBlockExpire).toBe(120);
  });

  it('throttler 이름과 키를 함께 네임스페이스에 넣는다(프로파일끼리 카운터를 공유하지 않게)', async () => {
    const redis = makeRedis(async () => [1, 60]);
    const storage = new RedisThrottlerStorage(redis);

    await storage.increment('user:abc', 60_000, 120, 60_000, 'default');

    const [, , usedKey, windowSec] = (redis.eval as jest.Mock).mock.calls[0];
    expect(usedKey).toBe('throttle:default:user:abc');
    // ttl은 ms로 들어오고 Redis EXPIRE는 초를 받는다.
    expect(windowSec).toBe('60');
  });

  it('1초 미만 ttl도 최소 1초로 올린다(EXPIRE 0은 즉시 삭제라 제한이 사라진다)', async () => {
    const redis = makeRedis(async () => [1, 1]);
    const storage = new RedisThrottlerStorage(redis);

    await storage.increment('k', 400, 5, 400, 'default');

    expect((redis.eval as jest.Mock).mock.calls[0][3]).toBe('1');
  });

  it('Redis가 죽으면 예외를 던지지 않고 통과시킨다', async () => {
    const storage = new RedisThrottlerStorage(
      makeRedis(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const out = await storage.increment('k', 60_000, 1, 60_000, 'default');

    // 전역 가드가 모든 요청에서 부른다 — 여기서 던지면 API 전체가 멈춘다.
    expect(out.isBlocked).toBe(false);
    expect(out.totalHits).toBe(1);
  });
});
