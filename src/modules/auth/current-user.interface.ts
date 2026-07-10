import { UserRoleType } from '@prisma/client';

/**
 * JWT 검증 후 request.user에 실리는 페이로드.
 * @CurrentUser() 데코레이터가 이 타입을 반환한다.
 */
export interface CurrentUserPayload {
  /** users.id (UUID) */
  id: string;
  email: string;
  /** user_roles 매핑 결과 — 권한 가드에서 사용 */
  roles: UserRoleType[];
}
