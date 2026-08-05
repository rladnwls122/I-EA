import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { QUESTION_BATCH_MAX } from '@/common/constants/question';
import { UpdateQuestionDto } from './update-question.dto';

/**
 * 일괄 갱신 항목 하나 — 단건 PATCH 본문에 대상 id만 얹은 것이다.
 * 필드 검증을 배치용으로 다시 쓰지 않는다(UpdateQuestionDto를 그대로 상속) —
 * 배치가 단건 경로의 검증을 우회하는 샛길이 되면 안 된다.
 */
export class BatchUpdateQuestionItemDto extends UpdateQuestionDto {
  @ApiProperty({ description: '수정할 문항 ID' })
  @IsUUID()
  id!: string;
}

/**
 * 문항 일괄 갱신. 캔버스 저장이 문항 수만큼 PATCH를 쏘던 자리를 한 번으로 줄인다.
 * 결과는 **항목별**로 돌아온다(BatchItemResult) — 하나가 실패해도 나머지는 저장된다.
 */
export class BatchUpdateQuestionsDto {
  @ApiProperty({
    description: `수정할 문항 목록(최대 ${QUESTION_BATCH_MAX}건)`,
    type: [BatchUpdateQuestionItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(QUESTION_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => BatchUpdateQuestionItemDto)
  items!: BatchUpdateQuestionItemDto[];
}
