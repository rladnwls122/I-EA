import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * @Public() 라우트에서 "로그인했으면 개인화, 안 했으면 공개 목록만" 패턴에 쓴다.
 * 토큰이 없거나 무효해도 절대 401을 던지지 않고 request.user를 null로 둔 채 통과시킨다.
 * 전역 JwtAuthGuard와 별개로 라우트에 직접 @UseGuards(OptionalJwtAuthGuard)로 붙인다.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: unknown): TUser {
    return (user || null) as TUser;
  }
}
