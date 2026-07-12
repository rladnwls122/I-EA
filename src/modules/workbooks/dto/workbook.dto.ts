import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { WORKBOOK_VISIBILITIES } from '@/common/constants/question';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

export class CreateWorkbookDto {
  @ApiProperty({ description: '문제집 제목', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: '설명' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '표지 이미지 public URL', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: '공개 범위', enum: WORKBOOK_VISIBILITIES, default: 'PRIVATE' })
  @IsOptional()
  @IsIn(WORKBOOK_VISIBILITIES)
  visibility?: string;

  @ApiPropertyOptional({
    description: '초기 문항 ID 목록(순서 보존). 장바구니에서 한 번에 생성할 때 사용',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  questionIds?: string[];
}

export class UpdateWorkbookDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiPropertyOptional({ enum: WORKBOOK_VISIBILITIES })
  @IsOptional()
  @IsIn(WORKBOOK_VISIBILITIES)
  visibility?: string;
}

/** 문제집에 문항 담기(Pick). sourceWorkbookId는 어느 문제집에서 가져왔는지 추적용. */
export class AddQuestionDto {
  @ApiProperty({ description: '담을 문항 ID (PUBLISHED만 허용)' })
  @IsUUID()
  questionId!: string;

  @ApiPropertyOptional({ description: '담아온 출처 문제집 ID' })
  @IsOptional()
  @IsUUID()
  sourceWorkbookId?: string;

  @ApiPropertyOptional({ description: '삽입 위치(생략 시 맨 뒤)', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

/**
 * 문항 순서 재배열. 부분 이동이 아니라 **전체 순서를 통째로** 받는다.
 * 부분 이동은 동시 편집 시 순서가 어긋나기 쉬워 서버가 검증할 수 없다.
 * questionIds는 현재 문제집의 문항 집합과 정확히 일치해야 한다.
 */
export class ReorderQuestionsDto {
  @ApiProperty({ description: '새 순서대로 나열한 전체 문항 ID', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  questionIds!: string[];
}

/** 문제집 탐색 쿼리. 3단 분류는 문항을 통해 간접 필터링한다. */
export class QueryWorkbookDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '제목 검색어' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: '시험 (예: 수능)' })
  @IsOptional()
  @IsString()
  examType?: string;

  @ApiPropertyOptional({ description: '대분류 (예: 국어)' })
  @IsOptional()
  @IsString()
  examCategory?: string;

  @ApiPropertyOptional({ description: '소분류 subject ID(단일, 레거시)' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({
    description: '소분류 subject ID(콤마 구분 또는 반복 파라미터). 여러 개면 OR 매칭',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : String(value).split(',').filter(Boolean)))
  @IsArray()
  @IsUUID('4', { each: true })
  subjectIds?: string[];

  @ApiPropertyOptional({ description: '정렬', enum: ['popular', 'recent'], default: 'popular' })
  @IsOptional()
  @IsIn(['popular', 'recent'])
  sort?: 'popular' | 'recent';

  @ApiPropertyOptional({ description: '내 문제집만 조회(공개 여부 무관)' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
}
