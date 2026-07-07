import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ description: '과목명 (예: 수학, 영어)', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '시험 카테고리 (예: 수능, 내신)', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  examCategory!: string;

  @ApiPropertyOptional({ description: '정렬 순서', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateUnitDto {
  @ApiProperty({ description: '소속 과목 ID' })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({ description: '부모 단원 ID(트리). 최상위면 생략' })
  @IsOptional()
  @IsUUID()
  parentUnitId?: string;

  @ApiProperty({ description: '단원명', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '리프(문항 태깅 가능) 여부', default: false })
  @IsOptional()
  @IsBoolean()
  isLeaf?: boolean;

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

  @ApiProperty({ description: '태그 분류 (예: 출처, 난이도)', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category!: string;
}
