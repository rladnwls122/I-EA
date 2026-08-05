import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import type { ClassConstructor } from 'class-transformer';
import { TRANSFORM_OPTIONS, VALIDATOR_OPTIONS } from '../validation-options';
import type { BatchItemResult } from './batch-result';

/**
 * 배치 항목의 **DTO 형식 검증을 항목별로** 돌린다 (#33 도그푸딩 잔여 4).
 *
 * 왜 필요한가: 배치를 만들 때 서비스 계층 실패(권한·존재하지 않는 지문·규칙 위반)는
 * 항목별로 격리했는데, **형식 검증만 전부-아니면-전무**로 남아 있었다.
 * `@ValidateNested({ each: true })`는 전역 ValidationPipe가 도는 자리라, 20문항 중
 * 한 문항의 difficulty가 6이면 나머지 19문항까지 400 하나로 되돌아왔다.
 * 이건 배치가 없애기로 한 바로 그 실패 모드다 — "문항 하나 때문에 나머지를 되돌리는 건
 * 저장이 아니라 사고"(batch-result.ts).
 *
 * 그래서 배치 DTO는 `items`를 **검증 없이** 받고(배열 자체·상한만 파이프가 본다),
 * 항목 하나하나를 여기서 단건 DTO로 검증한다. 통과한 것만 서비스로 내려가고,
 * 걸린 것은 그 자리의 index를 단 실패 항목이 된다.
 *
 * ⚠️ 검증 규칙이 단건 경로와 **같아야** 한다 — 배치가 검증을 우회하는 샛길이 되면
 * 단건 PATCH로는 못 넣는 값이 배치로는 들어간다. 그래서 (1) DTO 클래스를 그대로 쓰고,
 * (2) 옵션도 전역 파이프가 읽는 정본(`common/validation-options.ts`)을 그대로 쓴다.
 */

/**
 * 검증 오류 트리를 사람이 읽을 한 줄로 접는다.
 *
 * 중첩(`choices.0.content`)까지 경로를 붙이는 이유: 배치 응답은 "몇 번째 카드가 왜
 * 실패했는지"를 그대로 화면에 옮기는 자리라, 필드를 못 짚으면 사용자가 고칠 데를 찾지 못한다.
 * 단건 경로의 400 메시지가 constraints 문장 배열인 것과 같은 재료를 쓴다.
 */
export function formatValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  const out: string[] = [];
  for (const err of errors) {
    const path = parentPath ? `${parentPath}.${err.property}` : err.property;
    if (err.constraints) {
      for (const message of Object.values(err.constraints)) out.push(message);
    }
    if (err.children?.length) out.push(...formatValidationErrors(err.children, path));
  }
  return out;
}

/** 항목별 검증 결과 — 통과분(원래 자리 index를 달고)과 실패분(그대로 응답에 실린다). */
export interface BatchValidation<T> {
  valid: { index: number; dto: T }[];
  failures: BatchItemResult[];
}

/**
 * 배치 항목을 단건 DTO로 하나씩 검증한다.
 *
 * 실패 항목은 `BatchItemResult`(status: 'failed')로 돌려주고, 통과 항목만 서비스가 본다.
 * index는 **요청 배열에서의 자리**다 — 통과분만 추려도 자리가 보존돼야 클라이언트가
 * 몇 번째 카드인지 되짚을 수 있다.
 */
export function validateBatchItems<T extends object>(
  items: unknown[],
  cls: ClassConstructor<T>,
): BatchValidation<T> {
  const valid: { index: number; dto: T }[] = [];
  const failures: BatchItemResult[] = [];

  for (const [index, raw] of items.entries()) {
    // 객체가 아닌 원소(문자열·null 등)는 DTO로 변환할 수 없다 — 여기서 끊지 않으면
    // plainToInstance가 빈 인스턴스를 만들어 "필수 필드 누락" 같은 엉뚱한 사유가 나간다.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      failures.push({ index, status: 'failed', error: '항목이 객체가 아닙니다.' });
      continue;
    }
    const dto = plainToInstance(cls, raw, TRANSFORM_OPTIONS);
    const errors = validateSync(dto, VALIDATOR_OPTIONS);
    if (errors.length > 0) {
      failures.push({ index, status: 'failed', error: formatValidationErrors(errors).join(', ') });
      continue;
    }
    valid.push({ index, dto });
  }

  return { valid, failures };
}
