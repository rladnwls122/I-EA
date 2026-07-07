import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: true, // 데모: 모든 origin 허용. 운영 시 Vercel 도메인으로 좁힐 것.
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
