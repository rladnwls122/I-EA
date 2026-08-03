import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { requireJwtSecret } from './jwt-secret';

/**
 * 인증 인프라(JWT 전략 + 토큰 발급) 제공 모듈.
 * 실제 요청 가드(JwtAuthGuard)는 app.module에서 전역 APP_GUARD로 등록된다.
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // fallback 없음 — 값이 없으면 여기 오기 전에 env 검증(validateEnv)이 부팅을 막는다.
        // 예전의 'change-me-in-production' fallback은 env 누락 시 공개된 시크릿으로
        // 조용히 기동해 토큰 위조를 허용했다. 절대 되살리지 마라.
        secret: requireJwtSecret(config),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
