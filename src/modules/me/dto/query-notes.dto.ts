import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * 오답노트 조회 필터 — 시험 → 대분류 → 세부과목 3단 범위 좁히기.
 * 셋 다 선택(optional)이며 함께 오면 AND. subjectId가 있으면 사실상 최상위 필터.
 */
export class QueryNotesDto {
  @ApiPropertyOptional({ description: '시험 (subjects.exam_type, 예: 수능)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  examType?: string;

  @ApiPropertyOptional({ description: '대분류 (subjects.exam_category, 예: 국어)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  examCategory?: string;

  @ApiPropertyOptional({ description: '세부과목 ID' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
