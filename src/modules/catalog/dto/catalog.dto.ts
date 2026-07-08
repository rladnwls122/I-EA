import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ description: '세부과목명 (예: 문학, 언어와매체)', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: '대분류/시험 카테고리 (예: 국어, 수학)', maxLength: 50 })
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
