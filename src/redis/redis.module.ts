import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * ioredis 클라이언트 주입 토큰.
 * bullmq가 이미 ioredis를 물고 있어 별도 패키지 없이 재사용한다.
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * 앱 전역에서 공유하는 단일 ioredis 인스턴스를 제공한다.
 *
 * BullMQ 등록부(app.module.ts)와 **같은 env**를 읽는다:
 * REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_TLS.
 * REDIS_TLS=true(Aiven 등 관리형)일 때만 TLS를 켜고 로컬/Railway는 끈다.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis({
          host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          ...(config.get<string>('REDIS_TLS') === 'true' ? { tls: {} } : {}),
          // 커맨드 재시도를 무한정 큐잉하지 않게 한다(BullMQ와 동일한 안정성 기조).
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** 앱 종료 시 연결을 정리한다. */
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
