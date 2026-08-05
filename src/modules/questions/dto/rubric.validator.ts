import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import {
  RUBRIC_MAX_CRITERIA,
  RUBRIC_MAX_CRITERION_POINTS,
  RUBRIC_MAX_ID_LENGTH,
  RUBRIC_MAX_TEXT_LENGTH,
  RUBRIC_MAX_TOTAL_POINTS,
  RUBRIC_POINTS_DECIMALS,
  RubricCriterion,
} from '@/common/constants/rubric';

/**
 * 채점기준표(rubric) 입력 검증.
 *
 * `questions.rubric`은 Json 컬럼이라 DB가 형태를 보장하지 않는다. 그런데 이 값은 나중에
 * **점수를 만든다** — 자기채점이 기준별 배점을 더해 부분점수를 내고, 그 점수가 정오 판정 →
 * XP → 복습 상태까지 이어진다. 형태가 깨진 rubric은 화면 깨짐이 아니라 점수 오염이다.
 * 그래서 리치텍스트(@IsProseMirrorDoc)와 같은 방식으로 **전용 데코레이터**를 둔다:
 * 값을 바꾸지 않고 허용 집합 밖이면 400만 낸다(@Transform과 섞이면 검증한 값과 저장되는
 * 값이 달라질 수 있다 — 이 프로젝트는 enableImplicitConversion이 Json 배열을 []로 뭉갠 전례가 있다).
 *
 * 객관식 금지는 여기서 하지 않는다 — PATCH는 questionType 없이 rubric만 올 수 있어
 * "실제 유형"을 DTO 혼자서는 모른다. 저장 직전 questions.service가 기존 행과 병합해 판정한다.
 */
export class RubricValidationError extends Error {}

/** 소수 자릿수 초과 여부 — 0.5점 단위까지는 받고 0.001점 같은 값은 막는다. */
function hasTooManyDecimals(value: number): boolean {
  return Math.round(value * 10 ** RUBRIC_POINTS_DECIMALS) / 10 ** RUBRIC_POINTS_DECIMALS !== value;
}

const CRITERION_KEYS = ['id', 'text', 'points'];

/**
 * `[{ id, text, points }]` 배열인지 판정한다. 빈 배열은 통과시킨다 —
 * 편집기가 "기준 전부 삭제"를 표현할 방법이 `[]`밖에 없기 때문이다(undefined는 "안 건드림").
 */
export function validateRubric(value: unknown, field: string): unknown {
  if (!Array.isArray(value)) {
    throw new RubricValidationError(`${field}: 배열이어야 합니다.`);
  }
  if (value.length > RUBRIC_MAX_CRITERIA) {
    throw new RubricValidationError(
      `${field}: 채점기준은 최대 ${RUBRIC_MAX_CRITERIA}개까지입니다.`,
    );
  }

  const seenIds = new Set<string>();
  let totalPoints = 0;

  value.forEach((raw, i) => {
    const path = `${field}[${i}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new RubricValidationError(`${path}: 객체여야 합니다.`);
    }
    const criterion = raw as Record<string, unknown>;

    for (const key of Object.keys(criterion)) {
      if (!CRITERION_KEYS.includes(key)) {
        throw new RubricValidationError(`${path}: 허용되지 않은 키입니다(${key}).`);
      }
    }

    if (
      typeof criterion.id !== 'string' ||
      criterion.id.length === 0 ||
      criterion.id.length > RUBRIC_MAX_ID_LENGTH
    ) {
      throw new RubricValidationError(
        `${path}.id: 1~${RUBRIC_MAX_ID_LENGTH}자 문자열이어야 합니다.`,
      );
    }
    // 답안에 "체크한 기준 id"로 박히는 값이다 — 중복되면 어느 기준을 체크했는지 복원할 수 없다.
    if (seenIds.has(criterion.id)) {
      throw new RubricValidationError(`${path}.id: 중복된 기준 id입니다(${criterion.id}).`);
    }
    seenIds.add(criterion.id);

    if (typeof criterion.text !== 'string' || criterion.text.trim().length === 0) {
      throw new RubricValidationError(`${path}.text: 비어 있지 않은 문자열이어야 합니다.`);
    }
    if (criterion.text.length > RUBRIC_MAX_TEXT_LENGTH) {
      throw new RubricValidationError(
        `${path}.text: ${RUBRIC_MAX_TEXT_LENGTH}자 이하여야 합니다.`,
      );
    }

    const points = criterion.points;
    if (typeof points !== 'number' || !Number.isFinite(points)) {
      throw new RubricValidationError(`${path}.points: 숫자여야 합니다.`);
    }
    // 0점·음수 기준은 체크해도 점수가 안 변하거나 깎인다 — 부분점수의 정의를 깨므로 막는다.
    if (points <= 0) {
      throw new RubricValidationError(`${path}.points: 0보다 커야 합니다.`);
    }
    if (points > RUBRIC_MAX_CRITERION_POINTS) {
      throw new RubricValidationError(
        `${path}.points: ${RUBRIC_MAX_CRITERION_POINTS} 이하여야 합니다.`,
      );
    }
    if (hasTooManyDecimals(points)) {
      throw new RubricValidationError(
        `${path}.points: 소수점 ${RUBRIC_POINTS_DECIMALS}자리까지만 허용합니다.`,
      );
    }
    totalPoints += points;
  });

  // 합계는 부분점수 비율(획득/만점)의 분모다. 폭주하면 비율 판정이 무의미해진다.
  if (totalPoints > RUBRIC_MAX_TOTAL_POINTS) {
    throw new RubricValidationError(
      `${field}: 배점 합은 ${RUBRIC_MAX_TOTAL_POINTS} 이하여야 합니다(현재 ${totalPoints}).`,
    );
  }

  return value as RubricCriterion[];
}

/**
 * 실패 사유는 DTO 객체에 저장하지 않는다 — ValidationPipe의 forbidNonWhitelisted가
 * 그 임시 속성을 "선언되지 않은 속성"으로 잡아 엉뚱한 400을 낸다(#41에서 겪은 함정).
 * 대신 실패 경로에서만 검증기를 한 번 더 돌려 메시지를 얻는다.
 */
export function IsQuestionRubric(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isQuestionRubric',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value, args) => {
          try {
            validateRubric(value, args?.property ?? propertyName);
            return true;
          } catch (err) {
            if (err instanceof RubricValidationError) return false;
            throw err;
          }
        },
        defaultMessage: (args) => {
          try {
            validateRubric((args as ValidationArguments).value, (args as ValidationArguments).property);
          } catch (err) {
            if (err instanceof RubricValidationError) return err.message;
          }
          return `${(args as ValidationArguments).property}: 잘못된 채점기준표 구조입니다.`;
        },
      },
    });
  };
}
