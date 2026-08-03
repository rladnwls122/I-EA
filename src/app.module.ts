import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { DEFAULT_THROTTLE } from './common/throttler/throttler.config';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { WorkbooksModule } from './modules/workbooks/workbooks.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { MediaModule } from './modules/media/media.module';
import { PassagesModule } from './modules/passages/passages.module';
import { AnnotationsModule } from './modules/annotations/annotations.module';
import { ExamSessionsModule } from './modules/exam-sessions/exam-sessions.module';
import { AiGenerationModule } from './modules/ai-generation/ai-generation.module';
import { MeModule } from './modules/me/me.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { LootBoxesModule } from './modules/loot-boxes/loot-boxes.module';
import { ShopModule } from './modules/shop/shop.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    // .env 전역 로드 + 보안상 필수인 값(JWT_SECRET 등)을 부팅 시점에 검증한다.
    // 검증 실패는 예외 → 프로세스가 뜨지 않는다(조용한 안전하지 않은 기동 방지).
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // @Cron 데코레이터 활성화 — TiDB keep-alive 등 스케줄 잡이 쓴다.
    ScheduleModule.forRoot(),
    // 전역 레이트리밋 기본선. 라우트별 강화는 @Throttle로 한다(throttler.config 참고).
    ThrottlerModule.forRoot([DEFAULT_THROTTLE]),
    // BullMQ(Redis) 전역 연결 — AI 생성 등 비동기 잡 큐가 공유한다.
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          // Aiven 등 관리형 Redis는 TLS(rediss://) 연결이 필수다.
          // REDIS_TLS=true 로 켜고, TLS 없는 로컬/Railway Redis는 기본값(끔)으로 둔다.
          ...(config.get<string>('REDIS_TLS') === 'true' ? { tls: {} } : {}),
        },
      }),
    }),
    PrismaModule,
    // Redis(ioredis) 전역 클라이언트 — 튜터 히스토리/레이트 리밋이 공유한다.
    RedisModule,
    AuthModule,
    CatalogModule,
    QuestionsModule,
    WorkbooksModule,
    CommentsModule,
    ReviewsModule,
    MediaModule,
    PassagesModule,
    AnnotationsModule,
    ExamSessionsModule,
    AiGenerationModule,
    MeModule,
    TutorModule,
    LootBoxesModule,
    ShopModule,
  ],
  providers: [
    // 가드 실행 순서 = 등록 순서다. 스로틀을 인증보다 **먼저** 둔다:
    // JwtStrategy.validate()가 매 요청 DB를 치므로, 인증 뒤에 두면 무차별 대입이
    // 차단되기 전에 DB를 먼저 두들기게 된다.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // 전역 인증 가드 — @Public() 라우트만 우회한다.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
