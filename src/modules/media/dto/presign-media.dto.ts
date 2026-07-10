import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  AllowedImageContentType,
  MAX_UPLOAD_BYTES,
  MIN_UPLOAD_BYTES,
} from '../media.constants';

/**
 * S3 presigned POST 발급 요청. 파일명은 클라가 정하지 못하며(서버가 UUID로 생성),
 * 여기서 검증된 contentType/contentLength 가 POST policy conditions로 서버측에서 강제된다.
 * 클라는 응답 fields를 FormData에 넣고 file을 append 해 multipart POST 한다(PUT 아님).
 */
export class PresignMediaDto {
  @ApiProperty({
    enum: ALLOWED_IMAGE_CONTENT_TYPES,
    description: '업로드할 이미지 MIME 타입 (image/png|image/jpeg|image/webp)',
  })
  @IsIn(ALLOWED_IMAGE_CONTENT_TYPES, {
    message: 'contentType은 image/png, image/jpeg, image/webp 중 하나여야 합니다.',
  })
  contentType!: AllowedImageContentType;

  @ApiProperty({
    minimum: MIN_UPLOAD_BYTES,
    maximum: MAX_UPLOAD_BYTES,
    description: '업로드 파일 크기(바이트). 1 ~ 5MB.',
  })
  @IsInt({ message: 'contentLength는 정수(바이트)여야 합니다.' })
  @Min(MIN_UPLOAD_BYTES, { message: '빈 파일은 업로드할 수 없습니다.' })
  @Max(MAX_UPLOAD_BYTES, { message: '업로드 가능한 최대 크기는 5MB입니다.' })
  contentLength!: number;
}
