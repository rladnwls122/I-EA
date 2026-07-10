import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { QUESTION_KINDS, QuestionKind } from '@/common/constants/question';
import { QuestionContentDto } from './question-content.dto';

/**
 * 문항 직접 생성(에디터에서 수기 작성/저장). AI 생성 경로와 달리 즉시 DB에 쓴다.
 * status는 항상 DRAFT로 시작하며, 발행은 별도 publish 엔드포인트로 처리한다.
 * - 객관식: choices 필수(정답 선지 isCorrect)
 * - 주관식: correctAnswerText 있으면 단답 자동채점, 없으면 서술형(자기채점)
 */
export class CreateQuestionDto extends QuestionContentDto {
  @ApiProperty({ description: '세부과목 ID (questions.subject_id, NOT NULL)' })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({ description: '연결 지문 ID(세트 문항)' })
  @IsOptional()
  @IsUUID()
  passageId?: string;

  @ApiProperty({ description: '문제 유형', enum: QUESTION_KINDS })
  @IsIn(QUESTION_KINDS)
  questionType!: QuestionKind;

  @ApiPropertyOptional({
    description: '주관식 정답 텍스트(단답 자동채점용). 서술형/객관식은 생략',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  correctAnswerText?: string;

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

  @ApiPropertyOptional({ description: '풀이 힌트(응시 중 열람 가능)', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hintContent?: string;

  @ApiPropertyOptional({ description: '태그 ID 배열(question_tags 매핑)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
