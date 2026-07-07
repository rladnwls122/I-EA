import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** exam_sessions.filter_criteria에 스냅샷으로 저장되는 조립 조건. */
export class SessionFilterDto {
  @ApiPropertyOptional({ description: '출제 대상 단원 ID 목록', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  unitIds?: string[];

  @ApiPropertyOptional({ description: '태그 ID 목록(OR 매칭)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ enum: QuestionType, isArray: true, description: '문제 유형 필터' })
  @IsOptional()
  @IsArray()
  @IsEnum(QuestionType, { each: true })
  questionTypes?: QuestionType[];

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

export class CreateSessionDto {
  @ApiProperty({ description: '과목 ID' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ description: '출제할 문항 수', minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  questionCount!: number;

  @ApiProperty({ description: '문항 필터 조건', type: SessionFilterDto })
  @ValidateNested()
  @Type(() => SessionFilterDto)
  filter!: SessionFilterDto;
}
