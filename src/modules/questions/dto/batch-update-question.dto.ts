import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
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
 *
 * ⚠️ `items`에 `@ValidateNested`를 걸지 않는다. 전역 파이프가 항목을 검증하면 형식이
 * 깨진 항목 **하나가 배치 전체를 400**으로 만들어, 서비스 실패는 항목별로 격리해 놓고
 * 형식 실패만 전부-아니면-전무가 된다. 항목 검증은 서비스가 `validateBatchItems`로
 * 하나씩 돌리고(같은 DTO·같은 옵션), 걸린 항목만 실패로 돌려준다.
 * 배열 자체·상한은 여기 남는다 — 그건 항목이 아니라 요청의 형태다.
 */
export class BatchUpdateQuestionsDto {
  @ApiProperty({
    description: `수정할 문항 목록(최대 ${QUESTION_BATCH_MAX}건). 항목 형식 오류는 그 항목만 실패한다.`,
    type: [BatchUpdateQuestionItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(QUESTION_BATCH_MAX)
  /**
   * 원본 평문에서 items를 다시 읽어 원형을 보존한다(제거 금지). 없으면 전역 파이프의 enableImplicitConversion이
   * 속성 타입(Array)을 원소에도 적용해 항목을 전부 빈 배열로 바꿔 놓는다
   * (배치 전체가 '항목이 객체가 아닙니다'로 실패). QuestionContentDto의 choices/explanation과 같은 처방이다.
   * 검증은 여전히 서비스가 항목별로 돌린다.
   */
  @Transform(({ obj }) => obj.items)
  items!: unknown[];
}
