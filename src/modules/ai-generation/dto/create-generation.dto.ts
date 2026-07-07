import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Prisma의 QuestionType과 값이 일치해야 한다(문자열 enum). */
export enum RequestedQuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTI_CHOICE = 'MULTI_CHOICE',
  OX = 'OX',
  SHORT_ANSWER = 'SHORT_ANSWER',
  ESSAY = 'ESSAY',
}

export class CreateGenerationDto {
  @ApiProperty({ description: '생성할 문제가 태깅될 리프 단원 ID (questions.primary_unit_id는 NOT NULL)' })
  @IsUUID()
  unitId!: string;

  @ApiPropertyOptional({ description: '컨텍스트용 과목 ID' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

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

  @ApiPropertyOptional({ enum: RequestedQuestionType, description: '선호 문제 유형(힌트)' })
  @IsOptional()
  @IsEnum(RequestedQuestionType)
  questionType?: RequestedQuestionType;
}
