import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoleType } from '@prisma/client';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { CurrentUserPayload } from './current-user.interface';

/**
 * @Roles(...)로 지정된 권한을 request.user.roles와 대조한다.
 * JwtAuthGuard 다음에 동작하므로 user가 이미 채워져 있다고 가정한다.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRoleType[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as CurrentUserPayload | undefined;
    const ok = !!user && required.some((role) => user.roles.includes(role));
    if (!ok) throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
    return true;
  }
}
