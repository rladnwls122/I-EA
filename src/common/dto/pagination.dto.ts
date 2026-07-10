import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

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
