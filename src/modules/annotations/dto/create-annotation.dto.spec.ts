import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ANNOTATION_SELECTED_TEXT_MAX } from '@/common/constants/question';
import { TRANSFORM_OPTIONS, VALIDATOR_OPTIONS } from '@/common/validation-options';
import { CreateAnnotationDto } from './create-annotation.dto';
import { UpdateAnnotationDto } from './update-annotation.dto';
import { SelectionRangeValidationError, validateSelectionRange } from './selection-range.validator';

/** 전역 ValidationPipe와 같은 규칙(whitelist/forbidNonWhitelisted/implicit conversion)으로 검증. */
function validate(payload: Record<string, unknown>, cls: typeof CreateAnnotationDto | typeof UpdateAnnotationDto = CreateAnnotationDto) {
  const dto = plainToInstance(cls, payload, TRANSFORM_OPTIONS);
  return validateSync(dto as object, VALIDATOR_OPTIONS);
}

function messages(payload: Record<string, unknown>): string[] {
  return validate(payload).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('validateSelectionRange — 주석 앵커 형태', () => {
  const ok = (value: unknown) => validateSelectionRange(value, 'selectionRange');
  const fails = (value: unknown) => () => validateSelectionRange(value, 'selectionRange');

  it('{ start, end } 정수 오프셋을 통과시킨다', () => {
    expect(ok({ start: 0, end: 1 })).toEqual({ start: 0, end: 1 });
    expect(ok({ start: 12, end: 20 })).toEqual({ start: 12, end: 20 });
  });

  it('객체가 아니면 거부', () => {
    expect(fails(null)).toThrow(SelectionRangeValidationError);
    expect(fails('0-5')).toThrow(SelectionRangeValidationError);
    expect(fails([0, 5])).toThrow(SelectionRangeValidationError);
  });

  it('프런트가 읽지 않는 키(startOffset 등)는 거부 — 앵커가 조용히 유실되는 형태다', () => {
    expect(fails({ startOffset: 0, endOffset: 5 })).toThrow(/허용되지 않은 키/);
    expect(fails({ start: 0, end: 5, extra: 1 })).toThrow(/허용되지 않은 키/);
  });

  it('start·end가 빠지거나 정수가 아니면 거부', () => {
    expect(fails({ start: 0 })).toThrow(/end/);
    expect(fails({ end: 5 })).toThrow(/start/);
    expect(fails({ start: '0', end: 5 })).toThrow(/start/);
    expect(fails({ start: 0.5, end: 5 })).toThrow(/start/);
    expect(fails({ start: -1, end: 5 })).toThrow(/start/);
    expect(fails({ start: 0, end: Number.NaN })).toThrow(/end/);
    expect(fails({ start: 0, end: Number.POSITIVE_INFINITY })).toThrow(/end/);
  });

  it('end는 exclusive — start와 같거나 작으면 빈 선택이라 거부', () => {
    expect(fails({ start: 5, end: 5 })).toThrow(/end는 start보다/);
    expect(fails({ start: 6, end: 5 })).toThrow(/end는 start보다/);
  });
});

describe('CreateAnnotationDto — 전역 파이프 규칙으로 검증', () => {
  const anchored = {
    target: 'STEM',
    markStyle: 'HIGHLIGHT',
    color: 'yellow',
    selectedText: '광합성의 명반응',
    selectionRange: { start: 12, end: 20 },
    reasonCode: 'CONCEPT',
    memoText: '명반응 산물을 헷갈림',
  };

  it('프런트(AnnotationToolbar)가 보내는 앵커 주석 페이로드를 통과시킨다', () => {
    expect(validate(anchored)).toHaveLength(0);
  });

  it('앵커 없는 일반 메모(빈 본문)도 통과 — 모든 필드가 선택이다', () => {
    expect(validate({})).toHaveLength(0);
    expect(validate({ memoText: '전체 메모' })).toHaveLength(0);
  });

  it('implicit conversion을 지나도 selectionRange 객체가 뭉개지지 않는다', () => {
    const dto = plainToInstance(CreateAnnotationDto, anchored, TRANSFORM_OPTIONS);
    expect(dto.selectionRange).toEqual({ start: 12, end: 20 });
  });

  it('형태가 깨진 selectionRange는 사유를 담아 400으로 거부한다', () => {
    expect(messages({ ...anchored, selectionRange: { startOffset: 12, endOffset: 20 } })).toEqual([
      expect.stringContaining('허용되지 않은 키'),
    ]);
    expect(messages({ ...anchored, selectionRange: { start: 20, end: 12 } })).toEqual([
      expect.stringContaining('end는 start보다'),
    ]);
    expect(messages({ ...anchored, selectionRange: 'x' }).length).toBeGreaterThan(0);
  });

  it('selectedText는 컬럼(TEXT) 안에 드는 길이까지만 받는다', () => {
    expect(validate({ selectedText: '가'.repeat(ANNOTATION_SELECTED_TEXT_MAX) })).toHaveLength(0);
    expect(
      validate({ selectedText: '가'.repeat(ANNOTATION_SELECTED_TEXT_MAX + 1) }).length,
    ).toBeGreaterThan(0);
  });

  it('선언되지 않은 필드는 거부한다 (forbidNonWhitelisted)', () => {
    expect(validate({ ...anchored, questionId: 'x' }).length).toBeGreaterThan(0);
  });
});

describe('UpdateAnnotationDto — PartialType이 앵커 검증을 물려받는다', () => {
  it('부분 수정에서도 깨진 selectionRange는 거부한다', () => {
    expect(validate({ selectionRange: { start: 3, end: 9 } }, UpdateAnnotationDto)).toHaveLength(0);
    expect(
      validate({ selectionRange: { start: 9, end: 3 } }, UpdateAnnotationDto).length,
    ).toBeGreaterThan(0);
    expect(
      validate({ selectionRange: { startOffset: 0, endOffset: 3 } }, UpdateAnnotationDto).length,
    ).toBeGreaterThan(0);
  });
});
