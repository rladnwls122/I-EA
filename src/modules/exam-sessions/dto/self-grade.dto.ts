import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { RUBRIC_MAX_CRITERIA, RUBRIC_MAX_ID_LENGTH } from '@/common/constants/rubric';

/**
 * 서술형 자기채점. 문항이 채점기준표를 가졌는지에 따라 **둘 중 하나만** 보낸다.
 *
 *  - 기준표 없음(기존 문항): `isCorrect` 불리언 하나로 정오를 확정한다.
 *  - 기준표 있음: `checkedCriterionIds`로 충족한 기준을 보낸다(빈 배열 = 0점).
 *    점수도 정오도 서버가 기준 배점으로 계산한다 — 클라이언트가 보낸 `isCorrect`는
 *    채점 근거와 어긋날 수 있어 받지 않는다.
 *
 * 두 필드를 함께 보내거나 둘 다 빠뜨리면 서비스가 400으로 거부한다. "둘 다 허용"으로 열어 두면
 * 어느 쪽이 점수의 근거인지 요청만 봐서는 알 수 없고, 그 모호함이 그대로 통계에 박힌다.
 */
export class SelfGradeDto {
  @ApiPropertyOptional({
    description: '자기채점 결과(맞음=true/틀림=false). 채점기준표가 없는 문항에서만 사용한다.',
  })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({
    description: '충족한 채점기준 id 배열(예: ["c1","c3"]). 채점기준표가 있는 문항에서만 사용한다.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(RUBRIC_MAX_CRITERIA)
  @IsString({ each: true })
  @MaxLength(RUBRIC_MAX_ID_LENGTH, { each: true })
  checkedCriterionIds?: string[];
}
