import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionStatus, QuestionType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

/** 문제 은행 목록/검색 필터. */
export class QueryQuestionDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '단원 ID' })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiPropertyOptional({ enum: QuestionStatus })
  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @ApiPropertyOptional({ description: '난이도 1~5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'search_text LIKE 검색어' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '정렬: latest(기본, 최신순) | popular(조회수순)', enum: ['latest', 'popular'] })
  @IsOptional()
  @IsIn(['latest', 'popular'])
  sort?: 'latest' | 'popular';

  @ApiPropertyOptional({ description: '태그 ID(콤마 구분 또는 반복 파라미터). AND 매칭', type: [String] })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',').filter(Boolean)))
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds?: string[];
}
