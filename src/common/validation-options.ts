import type { ValidatorOptions } from 'class-validator';

/**
 * 요청 본문 검증 규칙의 **정본**. 전역 ValidationPipe(main.ts)와 배치 항목별 검증
 * (`common/dto/batch-validation.ts`)이 같은 이 값을 읽는다.
 *
 * 한곳에 둔 이유: 배치는 항목을 파이프 밖에서 직접 검증한다(하나가 깨져도 나머지를
 * 살리기 위해). 두 자리가 서로 다른 옵션을 쓰면 **배치가 단건 경로의 검증을 우회하는
 * 샛길**이 된다 — 특히 forbidNonWhitelisted를 한쪽에서만 켜면 선언되지 않은 속성이
 * 배치로만 통과한다. 상수를 나눠 갖는 것으로 그 드리프트를 구조적으로 막는다.
 */
export const VALIDATOR_OPTIONS: ValidatorOptions = {
  /** DTO에 선언되지 않은 속성은 제거한다. */
  whitelist: true,
  /** 제거로 끝내지 않고 400으로 알린다(오탈자 필드가 조용히 무시되지 않게). */
  forbidNonWhitelisted: true,
};

/** 평문 → DTO 변환 옵션. 쿼리스트링·JSON의 숫자/불리언 암묵 변환을 포함한다. */
export const TRANSFORM_OPTIONS = { enableImplicitConversion: true } as const;
