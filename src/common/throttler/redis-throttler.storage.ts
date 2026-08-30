import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/redis/redis.module';

/**
 * 레이트리밋 카운터를 Redis에 둔다.
 *
 * **왜 바꿨나.** @nestjs/throttler의 기본 저장소는 프로세스 메모리다. 인스턴스가 하나면
 * 충분하지만(예전 Railway 배포), 지금은 Vercel 서버리스라 인스턴스가 여러 개 뜬다.
 * 그러면 카운터가 인스턴스별로 갈려 실효 한도가 (동시 인스턴스 수)배가 된다.
 * 로그인 5분 10회(무차별 대입 억제), 회원가입 1시간 5회(다중계정 억제 — 코인이 실물
 * 상품으로 나간다), AI 생성 1시간 30회(Gemini 직접 비용)가 전부 같이 헐거워진다.
 *
 * 구현은 이 저장소가 처음 만든 게 아니라, tutor/authoring 채팅이 이미 쓰고 있는
 * 고정창 패턴(Lua: INCR 후 TTL이 없을 때만 EXPIRE)을 그대로 가져온 것이다. 새 패키지를
 * 들이지 않는 이유도 그거다 — 같은 Redis, 같은 방식이면 동작을 두 번 배울 필요가 없다.
 *
 * **실패 시 통과시킨다(fail-open).** 이 저장소는 전역 가드가 **모든 요청에서** 부른다.
 * Redis가 잠깐 흔들릴 때 예외를 던지면 API 전체가 멈춘다. 레이트리밋이 잠시 헐거워지는
 * 것보다 그게 훨씬 나쁘다. 대신 경고를 남겨 조용히 무력화되지 않게 한다.
 *
 * ponytail: 고정창이라 창 경계에서 최대 2배까지 몰릴 수 있다. 슬라이딩 윈도가 필요할
 * 만큼 정밀한 제어가 요구되면 그때 바꾼다.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  /**
   * INCR 후 창이 처음 열렸을 때만 EXPIRE를 건다. 매번 EXPIRE를 걸면 요청이 이어지는 한
   * 창이 영원히 갱신돼 제한이 사실상 사라진다.
   * 반환: {현재 카운트, 남은 TTL(초)}.
   */
  private static readonly INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * ttl·blockDuration은 **밀리초**로 들어오고, 반환하는 시간은 **초**다(기본 저장소와 동일).
   *
   * 이 앱은 blockDuration을 따로 설정하지 않는다 — @nestjs/throttler가 ttl과 같은 값으로
   * 채운다. 그래서 "차단 창 = 카운터 창"이고 timeToBlockExpire는 남은 TTL과 같다.
   * 나중에 창보다 긴 차단을 쓰려면 별도 차단 키가 필요하다(여기서 갈라 쓸 것).
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const windowSec = Math.max(1, Math.ceil(ttl / 1000));
    const redisKey = `throttle:${throttlerName}:${key}`;

    try {
      const [count, remaining] = (await this.redis.eval(
        RedisThrottlerStorage.INCREMENT_SCRIPT,
        1,
        redisKey,
        String(windowSec),
      )) as [number, number];

      const timeToExpire = remaining > 0 ? remaining : windowSec;
      const isBlocked = count > limit;
      return {
        totalHits: count,
        timeToExpire,
        isBlocked,
        timeToBlockExpire: isBlocked ? timeToExpire : 0,
      };
    } catch (err) {
      this.logger.warn(
        `레이트리밋 저장소(Redis) 접근 실패 — 이번 요청은 통과시킵니다: ${(err as Error).message}`,
      );
      // 통과시키는 값. totalHits를 1로 두면 어떤 limit에도 걸리지 않는다.
      return { totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
