import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // CORS — ALLOWED_ORIGINS(콤마 구분 목록)가 설정돼 있으면 그 목록 + Vercel 배포
  // 도메인(*.vercel.app — 프리뷰 URL이 배포마다 바뀌므로)만 허용, 없으면 데모
  // 편의상 모든 origin 허용. 목록에 프로덕션 도메인을 넣어두는 것을 권장.
  const allowedOrigins = (config.get<string>('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 0 ? [...allowedOrigins, /\.vercel\.app$/] : true,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // 전역 검증: DTO에 선언되지 않은 속성 제거, 타입 자동 변환.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger — /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Q-Idea API')
    .setDescription('AI 문항 출제 · 모의고사 조립/응시 플랫폼 API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port);
}

void bootstrap();
