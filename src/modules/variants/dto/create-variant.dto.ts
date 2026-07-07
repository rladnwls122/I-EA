import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * question_variants — 원본 문제(source)에서 파생된 변형 문제(variant)의 관계를 기록한다.
 * source는 URL 경로에서, variant/generation은 본문에서 받는다.
 */
export class CreateVariantDto {
  @ApiProperty({ description: '변형(파생) 문제 ID' })
  @IsUUID()
  variantQuestionId!: string;

  @ApiPropertyOptional({ description: '이 변형을 만든 AI 생성 작업 ID' })
  @IsOptional()
  @IsUUID()
  generationId?: string;
}
