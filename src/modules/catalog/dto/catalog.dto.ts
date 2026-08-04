import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TAG_CATEGORIES, TagCategory } from '@/common/constants/tag';

export class CreateSubjectDto {
  @ApiProperty({ description: '시험 (예: 수능, 내신)', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  examType!: string;

  @ApiProperty({ description: '대분류 (예: 국어, 수학)', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  examCategory!: string;

  @ApiProperty({ description: '소분류명 (예: 문학, 미적분)', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '정렬 순서', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateTagDto {
  @ApiProperty({ description: '태그명', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /**
   * 정본 목록 밖의 카테고리는 거부한다(#24 용어 정리). 자유 문자열로 두면 같은 축이
   * 두 이름으로 갈리고("킬러"가 '유형'과 '출제기법'에 하나씩), 어느 쪽으로 필터해도
   * 결과가 반쪽이 된다 — 조용해서 더 나쁜 종류의 버그다.
   */
  @ApiProperty({ description: '태그 분류', enum: TAG_CATEGORIES })
  @IsIn(TAG_CATEGORIES, {
    message: `category는 다음 중 하나여야 합니다: ${TAG_CATEGORIES.join(', ')}`,
  })
  category!: TagCategory;
}
