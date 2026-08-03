import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { QUESTION_KINDS, QuestionKind } from '@/common/constants/question';

/** 한 세션에 담을 수 있는 최대 문항 수 — 플레이리스트/필터 모드 공통 상한. */
export const SESSION_MAX_QUESTIONS = 100;

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
 *   문제집(Pick & Mix)이 여러 소분류를 섞을 수 있으므로 subjectId를 요구하지 않는다.
 * - 필터 모드: 소분류(subjectId) + filter 조건으로 questionCount개 랜덤 추출.
 *   buildQuestionWhere()가 subjectId로 후보를 좁히므로 여전히 필수다.
 */
export class CreateSessionDto {
  @ApiPropertyOptional({
    description: '소분류 subject ID. 필터 모드에서만 필수(플레이리스트 모드는 교차 과목 허용)',
  })
  @ValidateIf((o: CreateSessionDto) => !o.questionIds?.length)
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ description: '이 세션이 응시한 문제집 ID(평균점수 집계원)' })
  @IsOptional()
  @IsUUID()
  workbookId?: string;

  @ApiPropertyOptional({
    description: '오답노트에서 조립한 복습 세션 여부. true면 정답 시 복습 보너스(+15) 적립',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isReview?: boolean;

  @ApiPropertyOptional({
    description:
      '수동 플레이리스트: 지정 문항 ID들로 세트 구성(있으면 filter/questionCount 무시). 최대 100문항',
    type: [String],
    maxItems: SESSION_MAX_QUESTIONS,
  })
  @IsOptional()
  @IsArray()
  // 제출 트랜잭션이 문항 수만큼 순차 DB 왕복(정답률·풀이시간·선지분포·복습상태)을 도는 구조라
  // 상한이 없으면 오답노트 복습처럼 수백 문항이 한 세션에 들어와 트랜잭션 타임아웃(P2028)이 난다.
  // 필터 모드의 questionCount 상한(100)과 같은 값으로 맞춘다.
  @ArrayMaxSize(SESSION_MAX_QUESTIONS, {
    message: `한 세션에는 최대 ${SESSION_MAX_QUESTIONS}문항까지 담을 수 있습니다.`,
  })
  @IsUUID('4', { each: true })
  questionIds?: string[];

  @ApiPropertyOptional({
    description: '출제할 문항 수(필터 모드)',
    minimum: 1,
    maximum: SESSION_MAX_QUESTIONS,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SESSION_MAX_QUESTIONS)
  questionCount?: number;

  @ApiPropertyOptional({ description: '문항 필터 조건(필터 모드)', type: SessionFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionFilterDto)
  filter?: SessionFilterDto;
}
