import { ConfigService } from '@nestjs/config';

/**
 * JWT 서명 키를 ConfigService에서 꺼낸다. **fallback 기본값은 없다.**
 *
 * 발급(auth.module의 JwtModule)과 검증(jwt.strategy) 양쪽이 이 함수 하나를 쓴다.
 * 예전에는 두 곳이 각자 `?? 'change-me-in-production'`을 갖고 있어서,
 * env가 빠지면 앱이 정상 부팅한 것처럼 보이면서도 공개된 문자열로 서명된
 * 토큰을 누구나 위조할 수 있었다(ADMIN 포함).
 *
 * 정상 경로에서는 app.module의 validateEnv가 부팅 자체를 막으므로 여기까지
 * 오지 않는다. 이 throw는 ConfigModule을 우회해 모듈을 직접 조립하는 경우
 * (테스트 등)를 위한 마지막 방어선이다.
 */
export function requireJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (!secret) {
    throw new Error(
      'JWT_SECRET이 설정되지 않았습니다. 기본값으로 대체하지 않고 기동을 중단합니다.',
    );
  }
  return secret;
}
