import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  RUBRIC_MAX_CRITERIA,
  RUBRIC_MAX_TEXT_LENGTH,
  RUBRIC_MAX_TOTAL_POINTS,
} from '@/common/constants/rubric';
import { CreateQuestionDto } from './create-question.dto';
import { RubricValidationError, validateRubric } from './rubric.validator';

const ok = (value: unknown) => validateRubric(value, 'rubric');
const fails = (value: unknown) => () => validateRubric(value, 'rubric');

describe('validateRubric — 채점기준표 저장 검증', () => {
  it('정상 기준 배열을 통과시킨다', () => {
    expect(
      ok([
        { id: 'c1', text: '명반응 산물 2가지를 모두 언급', points: 3 },
        { id: 'c2', text: '암반응과의 차이를 서술', points: 2 },
      ]),
    ).toHaveLength(2);
  });

  it('빈 배열은 통과 — 편집기가 "기준 전부 삭제"를 표현하는 형태다', () => {
    expect(ok([])).toEqual([]);
  });

  it('0.5점 단위 배점을 허용한다', () => {
    expect(ok([{ id: 'c1', text: 'x', points: 1.5 }])).toHaveLength(1);
  });

  it('배열이 아니면 거부', () => {
    expect(fails({ c1: 3 })).toThrow(RubricValidationError);
    expect(fails('c1')).toThrow(RubricValidationError);
    expect(fails(null)).toThrow(RubricValidationError);
  });

  it('기준 개수 상한을 넘으면 거부', () => {
    const many = Array.from({ length: RUBRIC_MAX_CRITERIA + 1 }, (_, i) => ({
      id: `c${i + 1}`,
      text: 'x',
      points: 1,
    }));
    expect(fails(many)).toThrow(/최대 12개/);
  });

  it('id가 중복되면 거부 — 어느 기준을 체크했는지 복원할 수 없다', () => {
    expect(
      fails([
        { id: 'c1', text: 'a', points: 1 },
        { id: 'c1', text: 'b', points: 1 },
      ]),
    ).toThrow(/중복된 기준 id/);
  });

  it('id가 없거나 빈 문자열이면 거부', () => {
    expect(fails([{ text: 'a', points: 1 }])).toThrow(RubricValidationError);
    expect(fails([{ id: '', text: 'a', points: 1 }])).toThrow(RubricValidationError);
    expect(fails([{ id: 'x'.repeat(37), text: 'a', points: 1 }])).toThrow(RubricValidationError);
  });

  it('text가 비었거나 공백뿐이면 거부', () => {
    expect(fails([{ id: 'c1', text: '', points: 1 }])).toThrow(RubricValidationError);
    expect(fails([{ id: 'c1', text: '   ', points: 1 }])).toThrow(RubricValidationError);
  });

  it('text 길이 상한을 넘으면 거부', () => {
    expect(fails([{ id: 'c1', text: 'ㄱ'.repeat(RUBRIC_MAX_TEXT_LENGTH + 1), points: 1 }])).toThrow(
      /300자 이하/,
    );
  });

  it('배점이 0 이하면 거부 — 체크해도 점수가 안 오르거나 깎인다', () => {
    expect(fails([{ id: 'c1', text: 'a', points: 0 }])).toThrow(/0보다 커야/);
    expect(fails([{ id: 'c1', text: 'a', points: -1 }])).toThrow(/0보다 커야/);
  });

  it('배점이 숫자가 아니면 거부(문자열 "3" 포함)', () => {
    expect(fails([{ id: 'c1', text: 'a', points: '3' }])).toThrow(/숫자여야/);
    expect(fails([{ id: 'c1', text: 'a', points: NaN }])).toThrow(/숫자여야/);
  });

  it('소수 3자리 배점은 거부', () => {
    expect(fails([{ id: 'c1', text: 'a', points: 0.001 }])).toThrow(/소수점 2자리/);
  });

  it('배점 합 상한을 넘으면 거부 — 비율 판정의 분모가 폭주한다', () => {
    expect(
      fails([
        { id: 'c1', text: 'a', points: RUBRIC_MAX_TOTAL_POINTS },
        { id: 'c2', text: 'b', points: 1 },
      ]),
    ).toThrow(/배점 합/);
  });

  it('허용되지 않은 키가 섞이면 거부(리치텍스트 유입·오타 방어)', () => {
    expect(fails([{ id: 'c1', text: 'a', points: 1, isCorrect: true }])).toThrow(
      /허용되지 않은 키/,
    );
  });
});

/**
 * 전역 ValidationPipe를 통과할 때의 동작. 이 프로젝트는 enableImplicitConversion이
 * Json 배열 원소를 []로 뭉개 선지·해설을 통째로 날린 전례가 있어서, 새 Json 필드는
 * 파이프까지 태워서 원형 보존을 확인한다.
 */
describe('CreateQuestionDto.rubric — 전역 ValidationPipe 통과', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const body = (rubric: unknown) => ({
    subjectId: '11111111-1111-4111-8111-111111111111',
    questionType: '주관식',
    stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '발문' }] }] },
    rubric,
  });

  const run = (rubric: unknown) =>
    pipe.transform(structuredClone(body(rubric)) as object, {
      type: 'body',
      metatype: CreateQuestionDto,
    });

  it('기준 객체가 원형 그대로 살아남는다(빈 배열로 변조 금지)', async () => {
    const out = (await run([{ id: 'c1', text: '핵심어 포함', points: 3 }])) as CreateQuestionDto;
    expect(out.rubric).toEqual([{ id: 'c1', text: '핵심어 포함', points: 3 }]);
  });

  it('rubric을 생략하면 undefined로 통과한다("안 건드림")', async () => {
    const out = (await pipe.transform(
      {
        subjectId: '11111111-1111-4111-8111-111111111111',
        questionType: '주관식',
        stem: { type: 'doc', content: [] },
      },
      { type: 'body', metatype: CreateQuestionDto },
    )) as CreateQuestionDto;
    expect(out.rubric).toBeUndefined();
  });

  it('형태가 깨진 기준은 400으로 막힌다', async () => {
    await expect(run([{ id: 'c1', text: '핵심어', points: -1 }])).rejects.toThrow(
      BadRequestException,
    );
  });
});
