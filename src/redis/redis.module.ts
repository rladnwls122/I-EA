import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { sharedRedisOptions } from './redis.options';

/**
 * ioredis 클라이언트 주입 토큰.
 * bullmq가 이미 ioredis를 물고 있어 별도 패키지 없이 재사용한다.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * 앱 전역에서 공유하는 단일 ioredis 인스턴스를 제공한다.
 *
 * 접속 정보와 타임아웃 정책은 `redis.options.ts`가 정본이다 — BullMQ 등록부도 같은 곳을
 * 읽으므로 env가 한쪽에만 반영되는 드리프트가 생기지 않는다.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => new Redis(sharedRedisOptions(config)),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * 앱 종료 시 연결을 정리한다.
   *
   * 실패는 삼킨다. 이미 끊긴 연결에 quit을 보내거나 commandTimeout에 걸리면 예외가
   * 나는데, 종료 중에 그걸 던져 봐야 정리 순서만 어그러진다(이 시점엔 정리할 것도 없다).
   */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
