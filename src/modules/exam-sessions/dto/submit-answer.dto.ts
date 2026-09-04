import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 주관식 답안 길이 상한.
 *
 * `exam_session_answers.answer_text`는 `TEXT`라 DB가 65,535**바이트**에서 막는다. UTF-8
 * 한글은 글자당 3바이트이므로 21,845자 근처가 실제 한계인데, 상한이 없으면 그 초과가
 * Prisma P2000 → 500으로 나간다 — 응시자 입장에서는 답안을 길게 썼다는 이유로 제출이
 * "서버 오류"로 실패하고, 무엇을 고쳐야 하는지 알 수 없다.
 *
 * 10,000자는 최악의 경우(전부 이모지, 글자당 4바이트)에도 컬럼 안에 들면서, 내신 서·논술형
 * 답안(길어야 2,000자)의 다섯 배다. 정상 응시를 막지 않는다.
 */
export const ANSWER_TEXT_MAX = 10_000;

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

  @ApiPropertyOptional({
    description: '주관식 답안 텍스트(단답/서술형)',
    maxLength: ANSWER_TEXT_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(ANSWER_TEXT_MAX)
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
