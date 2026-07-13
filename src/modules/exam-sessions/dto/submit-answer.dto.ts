import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

/**
 * 실시간 OMR 답안 제출. 문제 유형별로 사용하는 필드가 다르다.
 * - 객관식: selectedChoiceIds
 * - 주관식(단답/서술형): answerText
 * annotations: 필기(펜) 스트로크 JSON.
 */
export class SubmitAnswerDto {
  @ApiPropertyOptional({ description: '선택한 선지 ID 배열(예: ["c1","c3"])', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedChoiceIds?: string[];

  @ApiPropertyOptional({ description: '주관식 답안 텍스트(단답/서술형)' })
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
  @Min(0)
  timeSpentSec?: number;
}
