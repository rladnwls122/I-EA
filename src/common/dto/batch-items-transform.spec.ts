import { ValidationPipe } from '@nestjs/common';
import { BatchCreateMediaDto } from '@/modules/media/dto/batch-create-media.dto';
import { BatchUpdateQuestionsDto } from '@/modules/questions/dto/batch-update-question.dto';
import { BatchAddQuestionsDto } from '@/modules/workbooks/dto/batch-add-questions.dto';
import { TRANSFORM_OPTIONS, VALIDATOR_OPTIONS } from '@/common/validation-options';

/**
 * 배치 DTO의 `items` 원소가 전역 파이프를 지나도 **객체 그대로** 남는지 지킨다.
 *
 * 지키지 않으면 무슨 일이 났었나: `items!: unknown[]`의 리플렉션 타입은 `Array`다.
 * 전역 파이프가 `enableImplicitConversion: true`로 도는데 원소 타입을 알려주는 `@Type()`이
 * 없으면, class-transformer가 속성 타입(`Array`)을 원소에도 적용해 모든 항목을 빈 배열로
 * 바꿔 놓는다. 그러면 `validateBatchItems`가 전 항목을 "항목이 객체가 아닙니다"로 떨어뜨려
 * 배치 저장이 통째로 실패한다 — 단건 경로는 멀쩡한데 배치만 죽는, 원인 찾기 고약한 모양이다.
 */
const pipe = new ValidationPipe({
  ...VALIDATOR_OPTIONS,
  transform: true,
  transformOptions: TRANSFORM_OPTIONS,
});

const transform = async (metatype: new () => object, body: unknown) =>
  (await pipe.transform(body, { type: 'body', metatype, data: '' })) as {
    items: unknown[];
  };

describe('배치 DTO items — 전역 파이프가 원소를 뭉개지 않는다', () => {
  const cases: [string, new () => object][] = [
    ['BatchAddQuestionsDto', BatchAddQuestionsDto],
    ['BatchUpdateQuestionsDto', BatchUpdateQuestionsDto],
    ['BatchCreateMediaDto', BatchCreateMediaDto],
  ];

  it.each(cases)('%s: 원소가 객체로 보존된다', async (_name, cls) => {
    const item = { id: 'x', nested: { a: 1 }, list: [1, 2] };
    const out = await transform(cls, { items: [item, item] });

    for (const got of out.items) {
      expect(Array.isArray(got)).toBe(false);
      expect(typeof got).toBe('object');
      expect(got).toEqual(item);
    }
  });
});
