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

/**
 * 미디어 등록 배치 한 요청의 항목 수 상한 (#33 도그푸딩 잔여 3).
 *
 * 문항 배치(QUESTION_BATCH_MAX = 50)보다 크게 잡는다: 이미지는 문항 하나에 여러 장이
 * 붙을 수 있어(발문 그림 + 선지 그림) 같은 저장 한 번에서 문항 수보다 많이 나온다.
 * 반면 항목 하나는 URL·크기 몇 개뿐이라 페이로드가 문항과 비교가 안 되게 작고,
 * 처리도 존재 확인 + INSERT 한 번이다.
 *
 * ⚠️ 프런트가 같은 값으로 나눠 보낸다 — `web/lib/api.ts`의 사본과
 * `media.batch.web-mirror.spec.ts`가 대조한다.
 */
export const MEDIA_BATCH_MAX = 100;
