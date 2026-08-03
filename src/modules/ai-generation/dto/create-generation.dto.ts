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
import { OUTPUT_LANGUAGES, OutputLanguage } from '../exam-format';

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

  @ApiPropertyOptional({
    description:
      'OX 퀴즈 스타일 힌트. true면 객관식 문항을 O/X 2지선다로 유도한다(questionType 저장값은 그대로 객관식).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  ox?: boolean;

  @ApiPropertyOptional({ description: '선호 문제 유형(힌트)', enum: QUESTION_KINDS })
  @IsOptional()
  @IsIn(QUESTION_KINDS)
  questionType?: QuestionKind;

  @ApiPropertyOptional({
    description:
      '객관식 선지 개수(2~8). 생략하면 시험별 관행(수능·내신·한능검 5지 / 공무원·공기업·토익 4지)을 프롬프트로 유도만 하고 개수를 강제하지 않는다. ox가 true면 무시된다(OX는 2개 고정).',
    minimum: 2,
    maximum: 8,
  })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  choiceCount?: number;

  @ApiPropertyOptional({
    description:
      "출력 언어. 생략하면 시험·대분류로 추정한다(토익 → en, 영어 대분류 → en-passage-ko-stem, 그 외 → ko). 'en-passage-ko-stem'은 지문·선지 영어 + 발문·해설 한국어.",
    enum: OUTPUT_LANGUAGES,
  })
  @IsOptional()
  @IsIn(OUTPUT_LANGUAGES)
  language?: OutputLanguage;
}
