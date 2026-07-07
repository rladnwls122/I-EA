import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaAssetType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * media_assets. DDL의 CHECK(지문 XOR 문제 배타적 매핑)을 애플리케이션에서도 보장한다:
 * passageId와 questionId 중 정확히 하나만 지정해야 한다.
 */
export class CreateMediaDto {
  @ApiProperty({ enum: MediaAssetType, description: 'IMAGE | GRAPH_CODE | SVG' })
  @IsEnum(MediaAssetType)
  assetType!: MediaAssetType;

  @ApiProperty({ description: '스토리지 URL', maxLength: 500 })
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  storageUrl!: string;

  @ApiPropertyOptional({ description: 'GRAPH_CODE/SVG 원본 소스(렌더 재현용)' })
  @IsOptional()
  @IsString()
  sourceCode?: string;

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
