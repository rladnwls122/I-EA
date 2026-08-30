import { ValidationPipe } from '@nestjs/common';
import { BatchCreateMediaDto } from '@/modules/media/dto/batch-create-media.dto';
import { BatchUpdateQuestionsDto } from '@/modules/questions/dto/batch-update-question.dto';
import { BatchAddQuestionsDto } from '@/modules/workbooks/dto/batch-add-questions.dto';
import { CreateQuestionDto } from '@/modules/questions/dto/create-question.dto';
import { validateBatchItems } from '@/common/dto/batch-validation';
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

  /**
   * 파이프만 보면 반쪽이다. 실제 실패는 파이프를 지난 items가 그다음
   * `validateBatchItems`에 들어갔을 때 났다 — 기존 배치 테스트들이 서비스를 직접
   * 호출해 파이프를 건너뛰는 바람에 그 이음매가 통째로 비어 있었다. 두 단계를
   * 이어서 한 번 태운다.
   */
  it('파이프를 지난 items가 validateBatchItems를 통과한다', async () => {
    const doc = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const item = {
      subjectId: '00000000-0000-4000-8000-000000000001',
      questionType: '객관식',
      stem: doc('발문'),
      choices: [
        { id: 'c1', content: doc('선지1'), isCorrect: true },
        { id: 'c2', content: doc('선지2'), isCorrect: false },
      ],
    };

    const out = await transform(BatchAddQuestionsDto, { items: [item] });
    const { valid, failures } = validateBatchItems(out.items, CreateQuestionDto);

    expect(failures).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].dto.subjectId).toBe(item.subjectId);
    // 선지도 원형이어야 한다 — 여기서 뭉개지면 정답 정보가 통째로 사라진 채 저장된다.
    expect(valid[0].dto.choices).toEqual(item.choices);
  });
});
