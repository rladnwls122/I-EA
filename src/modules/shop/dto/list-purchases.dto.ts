import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** 관리자 구매 목록 조회 쿼리. status는 허용값만 받는다(임의 문자열이 Prisma where로 새는 것을 막는다). */
export class ListPurchasesDto {
  @ApiPropertyOptional({ description: '조회할 구매 상태(기본 PENDING)', enum: ['PENDING', 'FULFILLED'] })
  @IsOptional()
  @IsIn(['PENDING', 'FULFILLED'])
  status?: 'PENDING' | 'FULFILLED';
}
