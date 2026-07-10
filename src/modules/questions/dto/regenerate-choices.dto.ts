import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * 인라인 선지 재생성 요청.
 *
 * stemText는 "저장된" 발문이 아니라 에디터에 떠 있는 현재 텍스트다.
 * 출제자가 지문을 고친 직후 저장 없이 누르는 버튼이므로 클라이언트가 실어 보낸다.
 * 수식은 평문(x^2 - 2x = 0)으로 온다 — KaTeX는 전면 제외다.
 */
export class RegenerateChoicesDto {
  @ApiProperty({ description: '현재 에디터의 발문 평문', maxLength: 5000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  stemText!: string;

  @ApiProperty({ description: '생성할 선지 개수', minimum: 2, maximum: 8, default: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(8)
  choiceCount!: number;

  @ApiPropertyOptional({ description: '난이도 힌트', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty?: number;
}
