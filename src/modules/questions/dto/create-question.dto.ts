import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { QuestionContentDto } from './question-content.dto';

/**
 * 문항 직접 생성(에디터에서 수기 작성/저장). AI 생성 경로와 달리 즉시 DB에 쓴다.
 * status는 항상 DRAFT로 시작하며, 발행은 별도 publish 엔드포인트로 처리한다.
 */
export class CreateQuestionDto extends QuestionContentDto {
  @ApiProperty({ description: '핵심 단원 ID (questions.primary_unit_id, NOT NULL)' })
  @IsUUID()
  primaryUnitId!: string;

  @ApiPropertyOptional({ description: '연결 지문 ID(세트 문항)' })
  @IsOptional()
  @IsUUID()
  passageId?: string;

  @ApiProperty({ enum: QuestionType, description: '문제 유형' })
  @IsEnum(QuestionType)
  questionType!: QuestionType;

  @ApiPropertyOptional({ description: '난이도 1~5', default: 3, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: '배점', default: 1, minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points?: number;

  @ApiPropertyOptional({ description: '태그 ID 배열(question_tags 매핑)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
