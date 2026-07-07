import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * 실시간 OMR 답안 제출. 문제 유형별로 사용하는 필드가 다르다.
 * - 객관식/OX: selectedChoiceIds
 * - SHORT_ANSWER: blankAnswers (빈칸 순서대로)
 * - ESSAY: answerText (자동 채점 불가)
 * annotations: 필기(펜) 스트로크 JSON.
 */
export class SubmitAnswerDto {
  @ApiPropertyOptional({ description: '선택한 선지 ID 배열(예: ["c1","c3"])', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedChoiceIds?: string[];

  @ApiPropertyOptional({ description: '단답형 빈칸 정답(빈칸 순서대로)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blankAnswers?: string[];

  @ApiPropertyOptional({ description: '서술형 답안 텍스트' })
  @IsOptional()
  @IsString()
  answerText?: string;

  @ApiPropertyOptional({ description: '필기 주석(스트로크) JSON', type: Object })
  @IsOptional()
  @IsObject()
  annotations?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '이 문항에 소요한 시간(초)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  timeSpentSec?: number;
}
