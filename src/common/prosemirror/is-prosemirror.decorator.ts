import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import {
  ProseMirrorValidationError,
  sanitizeProseMirrorBlocks,
  sanitizeProseMirrorNode,
} from './prosemirror.sanitize';

/**
 * ProseMirror JSON 필드용 검증 데코레이터.
 *
 * 값을 바꾸지 않고 **통과 여부만** 판정한다. class-transformer의 @Transform과 섞이면
 * 변환 순서가 얽히고(이 프로젝트는 enableImplicitConversion 때문에 choices/explanation이
 * []로 뭉개진 전례가 있다), 서비스가 받는 값과 검증한 값이 달라질 위험이 있다.
 * 여기서는 "허용 집합 밖이면 400"만 책임진다.
 *
 * 실패 사유는 DTO 객체에 저장하지 않는다 — ValidationPipe의 forbidNonWhitelisted가
 * 그 임시 속성을 "선언되지 않은 속성"으로 잡아 엉뚱한 400을 낸다.
 * 대신 실패 경로에서만 검증기를 한 번 더 돌려 메시지를 얻는다.
 */
type Validator = (value: unknown, field: string) => unknown;

function passes(validator: Validator, value: unknown, field: string): boolean {
  try {
    validator(value, field);
    return true;
  } catch (err) {
    if (err instanceof ProseMirrorValidationError) return false;
    throw err;
  }
}

/** 실패한 값에서 사유 문자열을 뽑는다(실패 경로에서만 호출된다). */
function reasonFor(validator: Validator, args: ValidationArguments): string {
  try {
    validator(args.value, args.property);
  } catch (err) {
    if (err instanceof ProseMirrorValidationError) return err.message;
  }
  return `${args.property}: 잘못된 리치텍스트 구조입니다.`;
}

function makeDecorator(name: string, validator: Validator) {
  return (options?: ValidationOptions) =>
    function (object: object, propertyName: string): void {
      registerDecorator({
        name,
        target: object.constructor,
        propertyName,
        options,
        validator: {
          validate: (value, args) => passes(validator, value, args?.property ?? propertyName),
          defaultMessage: (args) => reasonFor(validator, args as ValidationArguments),
        },
      });
    };
}

/** 단일 doc 노드(stem, passage.content 등). */
export const IsProseMirrorDoc = makeDecorator('isProseMirrorDoc', sanitizeProseMirrorNode);

/** 블록 노드 배열(explanation 등). */
export const IsProseMirrorBlocks = makeDecorator('isProseMirrorBlocks', sanitizeProseMirrorBlocks);

/** 선지 객체가 가질 수 있는 키. AuthoringCanvas가 explanationVisible까지 실어 보낸다. */
const CHOICE_KEYS = ['id', 'isCorrect', 'content', 'explanation', 'explanationVisible'];

/**
 * 리치텍스트 값이 doc 노드로도, 블록 배열로도 올 수 있어 둘 다 받는다.
 * - 프런트 에디터는 `buildRichDoc()` 결과(= doc 노드)를 선지 content로 보낸다.
 * - AI 생성 경로는 `buildRichBlocks()` 결과(= 블록 배열)를 쓴다.
 * 어느 쪽이든 내부 노드는 같은 화이트리스트를 통과해야 한다.
 */
function sanitizeRichValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    sanitizeProseMirrorBlocks(value, path);
    return;
  }
  sanitizeProseMirrorNode(value, path);
}

/**
 * 선지 배열. 각 원소는 `{ id, isCorrect?, content, explanation?, explanationVisible? }`이며
 * content/explanation은 doc 노드 또는 블록 배열이다.
 */
export function validateChoices(value: unknown, field: string): unknown {
  if (!Array.isArray(value)) {
    throw new ProseMirrorValidationError(`${field}: 배열이어야 합니다.`);
  }
  value.forEach((raw, i) => {
    const path = `${field}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ProseMirrorValidationError(`${path}: 객체여야 합니다.`);
    }
    const choice = raw as Record<string, unknown>;

    if (typeof choice.id !== 'string' || choice.id.length === 0 || choice.id.length > 36) {
      throw new ProseMirrorValidationError(`${path}.id: 1~36자 문자열이어야 합니다.`);
    }
    if (choice.isCorrect !== undefined && typeof choice.isCorrect !== 'boolean') {
      throw new ProseMirrorValidationError(`${path}.isCorrect: 불리언이어야 합니다.`);
    }
    if (choice.explanationVisible !== undefined && typeof choice.explanationVisible !== 'boolean') {
      throw new ProseMirrorValidationError(`${path}.explanationVisible: 불리언이어야 합니다.`);
    }

    sanitizeRichValue(choice.content, `${path}.content`);
    if (choice.explanation !== undefined) {
      sanitizeRichValue(choice.explanation, `${path}.explanation`);
    }

    for (const key of Object.keys(choice)) {
      if (!CHOICE_KEYS.includes(key)) {
        throw new ProseMirrorValidationError(`${path}: 허용되지 않은 키입니다(${key}).`);
      }
    }
  });
  return value;
}

export const IsQuestionChoices = makeDecorator('isQuestionChoices', validateChoices);
