import { ApiPropertyOptional } from '@nestjs/swagger';
import { PassageStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

export class QueryPassageDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PassageStatus })
  @IsOptional()
  @IsEnum(PassageStatus)
  status?: PassageStatus;

  @ApiPropertyOptional({ description: '작성자 ID로 필터' })
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}
