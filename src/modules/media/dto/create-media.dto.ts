import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaAssetType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsPositive, IsUrl, IsUUID, MaxLength } from 'class-validator';

/**
 * media_assets. DDL의 CHECK(지문 XOR 문제 배타적 매핑)을 애플리케이션에서도 보장한다:
 * passageId와 questionId 중 정확히 하나만 지정해야 한다.
 * 파일 업로드는 클라이언트가 presign(POST /media-assets/presign)으로 받은 url·fields로 S3에
 * multipart POST 하고(PUT 아님), 여기엔 결과 public URL만 등록한다. storageUrl은 우리 버킷/공개 베이스 접두여야 한다(서버가 검증).
 */
export class CreateMediaDto {
  @ApiProperty({ enum: MediaAssetType, description: 'IMAGE (MVP는 이미지 전용)' })
  @IsEnum(MediaAssetType)
  assetType!: MediaAssetType;

  @ApiProperty({ description: 'S3 등 외부 스토리지 public URL (우리 버킷 접두)', maxLength: 500 })
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  storageUrl!: string;

  @ApiPropertyOptional({ description: '지문 ID (문제 ID와 배타)' })
  @IsOptional()
  @IsUUID()
  passageId?: string;

  @ApiPropertyOptional({ description: '문제 ID (지문 ID와 배타)' })
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional({ description: '생성 파이프라인 추적용 generation ID' })
  @IsOptional()
  @IsUUID()
  generationId?: string;

  @ApiPropertyOptional({ description: '가로 픽셀' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  widthPx?: number;

  @ApiPropertyOptional({ description: '세로 픽셀' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  heightPx?: number;
}
