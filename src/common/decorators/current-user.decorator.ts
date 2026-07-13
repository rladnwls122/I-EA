import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';

/**
 * 컨트롤러 핸들러에서 인증된 사용자를 꺼내는 파라미터 데코레이터.
 * JwtStrategy.validate()가 채운 request.user를 그대로 반환한다.
 *
 * 사용: create(@CurrentUser() user: CurrentUserPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
