import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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

  @ApiProperty({ description: '태그 분류 (예: 출처, 난이도)', maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  category!: string;
}
