import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * question_reviews는 UNIQUE(question_id, reviewer_id) 제약이 있어
 * 한 사용자가 한 문제에 리뷰를 하나만 남긴다 → 생성/수정을 upsert로 통합한다.
 */
export class UpsertReviewDto {
  @ApiProperty({ description: '평점 1~5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: '리뷰 본문', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewText?: string;
}
