import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FulfillDto {
  @ApiPropertyOptional({ description: '배송 처리 메모(예: 수령 일시)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
