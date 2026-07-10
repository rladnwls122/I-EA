import { SetMetadata } from '@nestjs/common';
import { UserRoleType } from '@prisma/client';

/** 라우트에 필요한 권한을 지정한다. RolesGuard가 이 메타데이터를 검사한다. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoleType[]) => SetMetadata(ROLES_KEY, roles);
