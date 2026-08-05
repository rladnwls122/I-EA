import { HttpException, Logger } from '@nestjs/common';

/**
 * 배치 엔드포인트의 **항목별** 결과 (#41 Phase 3 마감).
 *
 * 왜 항목별인가: 캔버스 저장은 지금도 문항 하나가 실패하면 그 문항만 실패로 세고,
 * 실패한 항목의 기준선을 갱신하지 않아 다음 저장에서 다시 시도한다. 배치가
 * "전부 성공 아니면 전부 실패"가 되면 그 정밀도가 통째로 사라진다 —
 * 20문항 중 1개가 규칙에 걸렸다는 이유로 나머지 19개를 되돌리는 건 저장이 아니라 사고다.
 *
 * `index`는 요청 배열의 위치다. 응답 순서에 기대지 않고 되짚을 수 있어야
 * 클라이언트가 "몇 번째 카드가 왜 실패했는지"를 그대로 화면에 옮길 수 있다.
 */
export interface BatchItemResult {
  index: number;
  status: 'ok' | 'failed';
  /** 성공 시 — 만들어졌거나 갱신된 문항 id. */
  questionId?: string;
  /** 성공 시 — 문제집에 담긴 자리(생성 배치 전용). */
  displayOrder?: number;
  /** 성공 시 — 등록된 미디어 id(미디어 배치 전용). 등록은 멱등이라 기존 행의 id일 수 있다. */
  mediaId?: string;
  /** 실패 시 — 사용자에게 그대로 보여도 되는 사유. */
  error?: string;
}

export interface BatchResult {
  results: BatchItemResult[];
  okCount: number;
  failedCount: number;
}

const logger = new Logger('BatchItem');

/**
 * 항목 실패 사유를 응답에 실을 문자열로 바꾼다.
 *
 * HttpException(우리가 의도적으로 던진 검증·권한 실패)만 문구를 그대로 내보낸다.
 * 그 밖의 예외는 Prisma 오류 문자열처럼 내부 구조가 드러나는 것들이라 일반 문구로
 * 덮고 서버 로그에만 남긴다 — 배치는 실패 사유를 대량으로 돌려주는 자리라
 * 단건 경로보다 유출 표면이 넓다.
 */
export function batchItemError(e: unknown): string {
  if (e instanceof HttpException) {
    const body = e.getResponse();
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }
    return e.message;
  }
  logger.error(e instanceof Error ? e.stack ?? e.message : String(e));
  return '저장 중 오류가 발생했습니다.';
}

/** 항목 결과 배열을 집계 응답으로 감싼다. */
export function toBatchResult(results: BatchItemResult[]): BatchResult {
  return {
    results,
    okCount: results.filter((r) => r.status === 'ok').length,
    failedCount: results.filter((r) => r.status === 'failed').length,
  };
}
