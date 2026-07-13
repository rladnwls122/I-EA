import { SetMetadata } from '@nestjs/common';

/** 전역 JwtAuthGuard를 우회시키는 라우트 표식(로그인 등 인증 불필요 엔드포인트). */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
