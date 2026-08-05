import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * 인라인 선지 재생성 요청.
 *
 * stemText는 "저장된" 발문이 아니라 에디터에 떠 있는 현재 텍스트다.
 * 출제자가 지문을 고친 직후 저장 없이 누르는 버튼이므로 클라이언트가 실어 보낸다.
 * 수식은 $...$ LaTeX 델리미터가 든 평문으로 온다(#35) — 조립(buildRichDoc)이 math 노드로
 * 승격한다. 여기만 평문을 받던 시절에는 발문은 렌더되고 재생성된 선지만 안 되는 문항이 나왔다.
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
