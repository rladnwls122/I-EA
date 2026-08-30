import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

/**
 * Redis 접속 정보의 **단일 출처**.
 *
 * 예전에는 RedisModule과 app.module의 BullMQ 등록부가 같은 env를 각자 읽었다. 주석으로
 * "같은 env를 읽는다"고 적어 두는 것으로는 드리프트를 못 막는다 — 실제로 REDIS_TLS 같은
 * 값을 한쪽에만 추가하면 큐만 붙고 캐시는 안 붙는 식으로 조용히 갈린다.
 */
export function redisConnectionOptions(config: ConfigService): RedisOptions {
  return {
    host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
    port: Number(config.get<string>('REDIS_PORT') ?? 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    // Aiven 등 관리형 Redis는 TLS(rediss://) 연결이 필수다.
    // REDIS_TLS=true 로 켜고, TLS 없는 로컬 Redis는 기본값(끔)으로 둔다.
    ...(config.get<string>('REDIS_TLS') === 'true' ? { tls: {} } : {}),
  };
}

/**
 * 앱이 공유하는 일반 클라이언트(REDIS_CLIENT)의 옵션.
 *
 * **왜 상한이 중요한가.** 이 클라이언트는 이제 레이트리밋 저장소가 쓰고, 그건 전역 가드가
 * **모든 요청에서** 부른다. Redis가 응답하지 않을 때 커맨드가 무한정 매달리면 요청이
 * 서버리스 함수 시간 한도까지 붙잡혀 있다가 죽는다. 그러면 저장소의 fail-open은 영영
 * 실행되지 않는다 — 예외가 던져져야 통과시킬 수 있는데 예외가 안 오기 때문이다.
 *
 * - commandTimeout: ioredis는 이 타이머를 커맨드를 **보내기 전에** 건다(오프라인 큐에
 *   들어가는 경우 포함). 그래서 끊긴 상태에서도 대기가 확실히 끊긴다.
 * - maxRetriesPerRequest: 예전 값은 null이었고, 주석은 "무한정 큐잉하지 않게 한다"고
 *   적혀 있었다. 실제 의미는 정반대인 **재시도 무제한**이다(기본값은 20). BullMQ가
 *   요구하는 설정을 일반 클라이언트에 잘못 옮겨온 것으로 보인다 — BullMQ는 app.module에서
 *   자기 커넥션을 따로 만든다.
 */
export function sharedRedisOptions(config: ConfigService): RedisOptions {
  return {
    ...redisConnectionOptions(config),
    commandTimeout: 1_000,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 3,
  };
}
