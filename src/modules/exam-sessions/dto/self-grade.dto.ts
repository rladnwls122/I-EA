import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** 서술형(자기채점 대상) 문항의 정오를 응시자가 직접 확정한다. */
export class SelfGradeDto {
  @ApiProperty({ description: '자기채점 결과(맞음=true/틀림=false)' })
  @IsBoolean()
  isCorrect!: boolean;
}
