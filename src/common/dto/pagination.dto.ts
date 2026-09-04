import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 목록 API 검색어(`q`) 길이 상한.
 *
 * `q`는 저장되지 않고 `LIKE %...%`의 패턴이 된다. 상한이 없으면 수십 KB짜리 패턴이
 * 그대로 인덱스를 못 타는 전체 스캔의 비교 대상이 된다 — 한 요청이 DB를 오래 붙잡는
 * 경로라 page/limit에 상한을 둔 것과 같은 이유로 막는다. 실제 검색어는 한 줄이다.
 */
export const SEARCH_QUERY_MAX = 100;

/** 목록 API 공통 페이지네이션 쿼리. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: '페이지(1부터)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: '페이지당 개수', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /** Prisma skip 계산 헬퍼 */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/** 목록 API 공통 응답 봉투. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
