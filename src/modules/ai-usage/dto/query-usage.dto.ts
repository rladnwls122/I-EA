import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { USAGE_DEFAULT_RANGE_DAYS, USAGE_MAX_RANGE_DAYS } from '../llm-usage.constants';

/** AI 사용량 조회 기간. 상한을 두는 이유는 llm-usage.constants의 주석 참고. */
export class QueryUsageDto {
  @ApiPropertyOptional({
    description: '오늘을 포함한 조회 일수',
    default: USAGE_DEFAULT_RANGE_DAYS,
    minimum: 1,
    maximum: USAGE_MAX_RANGE_DAYS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(USAGE_MAX_RANGE_DAYS)
  days: number = USAGE_DEFAULT_RANGE_DAYS;
}
