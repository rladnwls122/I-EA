import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
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

@Module({
  imports: [
    // .env 전역 로드
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  providers: [
    // 전역 인증 가드 — @Public() 라우트만 우회한다.
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
