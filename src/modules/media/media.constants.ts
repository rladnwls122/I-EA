/**
 * 미디어(이미지) 업로드 공통 상수. presign DTO 검증과 S3 서비스가 단일 출처로 참조한다.
 * MVP는 이미지 전용이므로 화이트리스트도 이미지 MIME 3종으로 고정한다.
 */

/** presign 이 허용하는 Content-Type 화이트리스트. 이 밖의 타입은 400. */
export const ALLOWED_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

/**
 * Content-Type → 파일 확장자 매핑. object key 확장자는 **서버가 소유**한다
 * (클라 파일명/확장자 신뢰 금지 — 경로 traversal·덮어쓰기 차단).
 */
export const CONTENT_TYPE_EXTENSIONS: Record<AllowedImageContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** 업로드 최소 크기(바이트). 0바이트 업로드를 막는다. */
export const MIN_UPLOAD_BYTES = 1;

/** 업로드 최대 크기(바이트). 5MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** presigned URL 유효 시간(초). 5분. */
export const PRESIGN_EXPIRES_SEC = 300;
