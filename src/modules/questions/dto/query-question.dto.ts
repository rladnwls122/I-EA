import { ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { QUESTION_KINDS, QuestionKind } from '@/common/constants/question';

/** 문제 은행 목록/검색 필터. */
export class QueryQuestionDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '세부과목 ID(단일, 레거시)' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({
    description: '세부과목 ID(콤마 구분 또는 반복 파라미터). 여러 개면 OR 매칭',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',').filter(Boolean)))
  @IsArray()
  @IsUUID('4', { each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ enum: QuestionStatus })
  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @ApiPropertyOptional({ description: '문제 유형', enum: QUESTION_KINDS })
  @IsOptional()
  @IsIn(QUESTION_KINDS)
  questionType?: QuestionKind;

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
