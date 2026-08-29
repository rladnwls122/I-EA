import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TRANSFORM_OPTIONS, VALIDATOR_OPTIONS } from './common/validation-options';

/** 콤마 구분 목록 env를 트리밍된 배열로. */
function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Vercel 프리뷰 URL만 좁혀서 허용하는 정규식.
 * 접두(예: "qidea-web")를 요구하므로 제3자가 만든 임의의 *.vercel.app은 통과하지 못한다.
 */
function previewOriginPattern(prefix: string | undefined): RegExp | null {
  const trimmed = prefix?.trim();
  if (!trimmed) return null;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https://${escaped}[a-z0-9-]*\\.vercel\\.app$`);
}

/**
 * Nest 앱을 만들어 **listen 없이** 돌려준다.
 * 로컬/컨테이너는 main.ts가 listen하고, Vercel 서버리스는 api/index.js가
 * express 인스턴스를 그대로 핸들러로 쓴다 — 부팅 설정이 두 경로에서 갈리지 않게 여기 한 곳에 둔다.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // Railway/Vercel 등 리버스 프록시 뒤에서 돈다. 이걸 켜야 req.ip가 X-Forwarded-For의
  // 실제 클라이언트 IP가 된다. 없으면 모든 요청이 프록시 IP 하나로 보여서
  // IP 기반 레이트리밋이 전체 사용자를 한 버킷에 몰아넣는다(=사실상 무력화).
  // 신뢰 홉 수는 프록시 1단 기준. 프록시를 더 얹으면 이 숫자도 올려야 한다.
  app.set('trust proxy', 1);

  // 보안 헤더(X-Content-Type-Options, HSTS, Referrer-Policy 등). 예전엔 전무했다.
  // API는 HTML을 서빙하지 않으므로 CSP 기본값을 그대로 쓰되, Swagger UI가 인라인
  // 스크립트를 쓰므로 문서를 켜는 환경에서는 CSP를 끈다.
  const swaggerEnabled = !isProduction || config.get<string>('ENABLE_SWAGGER') === 'true';
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
      // API 응답을 다른 오리진에서 <img>/<script>로 임베드할 일이 없다.
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
    }),
  );

  // CORS — ALLOWED_ORIGINS(콤마 구분 목록)에 명시된 origin만 허용한다.
  //
  // 예전에는 목록이 비면 `origin: true`(= 요청 온 origin을 그대로 반사)로 열어 뒀고,
  // 목록이 있어도 `/\.vercel\.app$/`가 **누구나 배포할 수 있는 vercel 도메인 전체**를
  // 허용했다. 지금은 운영에서 목록이 비면 env 검증(validateEnv)이 부팅을 막고,
  // 프리뷰는 VERCEL_PREVIEW_PREFIX로 우리 프로젝트 접두를 가진 것만 좁혀서 받는다.
  const allowedOrigins = parseList(config.get<string>('ALLOWED_ORIGINS'));
  const previewPattern = previewOriginPattern(config.get<string>('VERCEL_PREVIEW_PREFIX'));
  const configuredOrigins = [...allowedOrigins, ...(previewPattern ? [previewPattern] : [])];

  app.enableCors({
    origin:
      configuredOrigins.length > 0
        ? configuredOrigins
        : // 로컬 개발 편의. 운영에서는 여기 도달하기 전에 부팅이 막힌다.
          ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // 전역 검증: DTO에 선언되지 않은 속성 제거, 타입 자동 변환.
  // 옵션은 `common/validation-options.ts`가 정본이다 — 배치 항목별 검증이 같은 값을
  // 읽어야 "배치로만 통과하는 값"이 생기지 않는다.
  app.useGlobalPipes(
    new ValidationPipe({
      ...VALIDATOR_OPTIONS,
      transform: true,
      transformOptions: TRANSFORM_OPTIONS,
    }),
  );

  // 처리되지 않은 예외가 스택/Prisma 내부 메시지를 그대로 노출하지 않게 감싼다.
  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

  // Swagger — /api/docs. 운영에서 API 표면 전체를 무인증 공개하지 않도록 기본은 끈다.
  // 필요하면 ENABLE_SWAGGER=true로 명시적으로 켠다.
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Q-Idea API')
      .setDescription('AI 문항 출제 · 모의고사 조립/응시 플랫폼 API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  return app;
}
