import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, ValidateNested } from 'class-validator';
import { QUESTION_BATCH_MAX } from '@/common/constants/question';
import { CreateQuestionDto } from '@/modules/questions/dto/create-question.dto';

/**
 * 새 문항을 만들어 곧바로 이 문제집에 담는 배치.
 *
 * 단건 경로는 문항 하나당 **세 번**(생성 POST → 발행 → 담기) 나갔다. 20문항짜리 문제집
 * 첫 저장이면 그것만으로 60회다. 여기서 한 번으로 줄인다.
 *
 * 항목 본문은 단건 생성 DTO(CreateQuestionDto)를 **그대로** 쓴다 — 배치용 필드 집합을
 * 따로 정의하면 검증이 갈라진다.
 *
 * **items의 순서가 곧 문제집 순서다.** 서버가 요청 순서대로 displayOrder를 매긴다
 * (그래서 클라이언트가 순차 루프로 순서를 지킬 이유가 사라진다 — 그게 이 배치의 요점이다).
 */
export class BatchAddQuestionsDto {
  @ApiProperty({
    description:
      `새로 만들어 담을 문항 목록(최대 ${QUESTION_BATCH_MAX}건). ` +
      '배열 순서대로 문제집 뒤에 붙는다.',
    type: [CreateQuestionDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(QUESTION_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  items!: CreateQuestionDto[];
}
