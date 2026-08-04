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
        signOptions: {
          // @nestjs/jwt 11은 expiresIn을 ms의 리터럴 유니온(`${number}d` 등)으로 좁혔다.
          // 값의 출처가 env라 컴파일 시점에 그 유니온임을 증명할 방법이 없다.
          // 형식이 틀리면 jsonwebtoken이 런타임에 던진다 — 캐스팅이 검사를 없애는 게 아니라
          // 원래부터 런타임 검사였던 것을 타입이 표현하지 못하는 것뿐이다.
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
