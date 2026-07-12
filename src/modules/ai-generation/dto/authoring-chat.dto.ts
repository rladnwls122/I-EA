import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QUESTION_KINDS } from '@/common/constants/question';

/** 좌측 캔버스의 현재 문항 요약 — 교체/수정 참조용(평문). */
export class CurrentQuestionRef {
  @IsInt()
  index!: number;

  @IsIn(QUESTION_KINDS)
  questionType!: string;

  @IsString()
  @MaxLength(4000)
  stem!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  choices?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  answer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  explanation?: string;
}

/** POST /ai-generations/chat 요청 바디. */
export class AuthoringChatDto {
  @IsUUID()
  workbookId!: string;

  @IsUUID()
  subjectId!: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  /** "한번에 N개씩" — AI가 이번 턴에 목표로 하는 문항 수. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  batchSize?: number;

  /** 설정 패널의 유형 힌트 — 지정하면 이번 턴 생성 문항의 유형을 강제. */
  @IsOptional()
  @IsIn(QUESTION_KINDS)
  questionType?: string;

  /** OX(참/거짓) 2지선다 스타일 힌트. 저장 유형은 객관식 그대로. */
  @IsOptional()
  @IsBoolean()
  ox?: boolean;

  /** 설정 패널의 난이도(1~5) 힌트. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CurrentQuestionRef)
  currentQuestions?: CurrentQuestionRef[];
}
