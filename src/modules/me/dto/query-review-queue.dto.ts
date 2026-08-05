import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { QueryNotesDto } from './query-notes.dto';

/** 한 세션 최대 문항 수 — CreateSessionDto의 SESSION_MAX_QUESTIONS와 같아야 한다. */
export const REVIEW_QUEUE_MAX_LIMIT = 100;

/**
 * 복습 큐 조회. 범위 필터(시험·대분류·세부과목)는 오답노트와 같은 규약을 쓴다 —
 * 사용자가 보고 있는 범위와 복습 세션의 범위가 어긋나면 안 된다.
 */
export class QueryReviewQueueDto extends QueryNotesDto {
  @ApiPropertyOptional({
    description: `가져올 문항 수 (1~${REVIEW_QUEUE_MAX_LIMIT}). 기본 ${REVIEW_QUEUE_MAX_LIMIT}`,
    minimum: 1,
    maximum: REVIEW_QUEUE_MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEW_QUEUE_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: '마스터(복습 졸업) 문항 포함 여부. 기본 false — 이슈 #21 결정.',
  })
  @IsOptional()
  // 쿼리스트링은 전부 문자열이라 'true'/'false'를 직접 접는다.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeMastered?: boolean;
}
