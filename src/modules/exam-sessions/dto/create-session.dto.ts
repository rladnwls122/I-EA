import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { QUESTION_KINDS, QuestionKind } from '@/common/constants/question';

/** exam_sessions.filter_criteria에 스냅샷으로 저장되는 조립 조건(필터 모드). */
export class SessionFilterDto {
  @ApiPropertyOptional({ description: '태그 ID 목록(OR 매칭)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ description: '문제 유형 필터', enum: QUESTION_KINDS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(QUESTION_KINDS, { each: true })
  questionTypes?: QuestionKind[];

  @ApiPropertyOptional({ description: '최소 난이도', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  minDifficulty?: number;

  @ApiPropertyOptional({ description: '최대 난이도', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxDifficulty?: number;
}

/**
 * 모의고사 조립. 두 가지 모드:
 * - 플레이리스트 모드: questionIds로 특정 문항을 직접 지정(있으면 filter/questionCount 무시).
 * - 필터 모드: 세부과목(subjectId) + filter 조건으로 questionCount개 랜덤 추출.
 */
export class CreateSessionDto {
  @ApiProperty({ description: '세부과목 ID' })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({
    description: '수동 플레이리스트: 지정 문항 ID들로 세트 구성(있으면 filter/questionCount 무시)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds?: string[];

  @ApiPropertyOptional({ description: '출제할 문항 수(필터 모드)', minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  questionCount?: number;

  @ApiPropertyOptional({ description: '문항 필터 조건(필터 모드)', type: SessionFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionFilterDto)
  filter?: SessionFilterDto;
}
