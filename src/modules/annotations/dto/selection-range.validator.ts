import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * 주석 앵커(`selectionRange`) 입력 검증.
 *
 * `user_question_annotations.selection_range`는 Json 컬럼이라 DB가 형태를 보장하지 않는다.
 * 계약은 설계 문서(docs/superpowers/specs/2026-07-12-annotations-design.md)와 프런트의
 * `resolveAnnotation`(web/lib/annotations.ts)이 정한 `{ start, end }` 하나다 — target 블록
 * 평문 기준 오프셋, end는 exclusive. 프런트는 이 형태가 아니면 앵커를 **조용히 버리고**
 * 일반 메모로 그린다. 즉 형태가 깨진 값은 저장은 되는데 화면에서는 하이라이트가 사라지는,
 * 사용자가 원인을 알 수 없는 유실이다. 그래서 리치텍스트(@IsProseMirrorDoc)·채점기준표
 * (@IsQuestionRubric)와 같은 방식으로 저장 전에 400으로 돌려보낸다.
 *
 * 값을 바꾸지 않고 허용 집합 밖이면 400만 낸다 — @Transform과 섞이면 검증한 값과
 * 저장되는 값이 달라질 수 있다(enableImplicitConversion이 Json 배열을 []로 뭉갠 전례).
 */
export class SelectionRangeValidationError extends Error {}

export interface SelectionRange {
  start: number;
  end: number;
}

const RANGE_KEYS = ['start', 'end'];

function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** `{ start, end }`인지 판정한다. 둘 다 0 이상 정수이고 end가 start보다 커야 한다. */
export function validateSelectionRange(value: unknown, field: string): SelectionRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SelectionRangeValidationError(`${field}: { start, end } 객체여야 합니다.`);
  }
  const range = value as Record<string, unknown>;

  for (const key of Object.keys(range)) {
    if (!RANGE_KEYS.includes(key)) {
      throw new SelectionRangeValidationError(`${field}: 허용되지 않은 키입니다(${key}).`);
    }
  }

  if (!isOffset(range.start)) {
    throw new SelectionRangeValidationError(`${field}.start: 0 이상의 정수여야 합니다.`);
  }
  if (!isOffset(range.end)) {
    throw new SelectionRangeValidationError(`${field}.end: 0 이상의 정수여야 합니다.`);
  }
  // end는 exclusive다 — 같거나 작으면 빈 선택이라 프런트가 앵커로 인정하지 않는다.
  if (range.end <= range.start) {
    throw new SelectionRangeValidationError(`${field}: end는 start보다 커야 합니다.`);
  }

  return { start: range.start, end: range.end };
}

/**
 * 실패 사유는 DTO 객체에 저장하지 않는다 — ValidationPipe의 forbidNonWhitelisted가
 * 그 임시 속성을 "선언되지 않은 속성"으로 잡아 엉뚱한 400을 낸다.
 * 대신 실패 경로에서만 검증기를 한 번 더 돌려 메시지를 얻는다.
 */
export function IsSelectionRange(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isSelectionRange',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value, args) => {
          try {
            validateSelectionRange(value, args?.property ?? propertyName);
            return true;
          } catch (err) {
            if (err instanceof SelectionRangeValidationError) return false;
            throw err;
          }
        },
        defaultMessage: (args?: ValidationArguments) => {
          const field = args?.property ?? propertyName;
          try {
            validateSelectionRange(args?.value, field);
          } catch (err) {
            if (err instanceof SelectionRangeValidationError) return err.message;
          }
          return `${field}: 잘못된 선택 범위입니다.`;
        },
      },
    });
  };
}
