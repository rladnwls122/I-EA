import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { QUESTION_KINDS, QuestionKind } from '@/common/constants/question';

export class CreateGenerationDto {
  @ApiProperty({ description: '생성 문제가 분류될 세부과목 ID (questions.subject_id는 NOT NULL)' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ description: '자연어 출제 지시 (주제/조건 등)', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  prompt!: string;

  @ApiProperty({ description: '난이도 1~5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty!: number;

  @ApiProperty({ description: '생성할 문항 수 1~20', minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  questionCount!: number;

  @ApiPropertyOptional({ description: '지문(passage)을 함께 생성할지 여부', default: false })
  @IsOptional()
  @IsBoolean()
  includePassage?: boolean;

  @ApiPropertyOptional({ description: '선호 문제 유형(힌트)', enum: QUESTION_KINDS })
  @IsOptional()
  @IsIn(QUESTION_KINDS)
  questionType?: QuestionKind;
}
