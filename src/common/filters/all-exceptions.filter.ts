import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * 처리되지 않은 예외의 최종 처리기.
 *
 * 기본 Nest 필터는 HttpException이 아닌 오류를 500으로 바꾸면서 메시지를 그대로
 * 흘린다. Prisma 오류가 그 경로를 타면 응답에 테이블·컬럼명과 쿼리 조각이 실려
 * 스키마가 외부로 새어 나간다. 여기서 운영 응답을 일반화한다.
 *
 * - HttpException(우리가 의도적으로 던진 4xx/5xx)은 그대로 통과시킨다.
 * - 그 밖의 오류는 500 + 고정 문구로 바꾸고, 원본은 서버 로그에만 남긴다.
 * - 개발 환경에서는 디버깅을 위해 원본 메시지를 응답에 포함한다.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // @Res()를 직접 쓰는 SSE 라우트(tutor/authoring chat)는 이미 헤더를 보냈을 수 있다.
    // 그 위에 JSON을 덧쓰면 스트림이 깨지므로 로그만 남기고 소켓을 닫는다.
    if (res.headersSent) {
      this.logger.error(`응답 전송 후 예외 (${req.method} ${req.url})`, toStack(exception));
      res.end();
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json(normalizeHttpBody(exception, status, req.url));
      return;
    }

    // 여기부터는 우리가 의도하지 않은 오류다 — 내부 정보를 노출하지 않는다.
    this.logger.error(
      `처리되지 않은 예외 (${req.method} ${req.url}): ${describe(exception)}`,
      toStack(exception),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '서버 내부 오류가 발생했습니다.',
      path: req.url,
      // 운영에서는 원본을 절대 싣지 않는다(Prisma 오류의 테이블·컬럼명 유출 차단).
      ...(this.isProduction ? {} : { debug: describe(exception) }),
    });
  }
}

/** HttpException 본문을 {statusCode, message, path} 형태로 통일한다. */
function normalizeHttpBody(exception: HttpException, status: number, path: string) {
  const body = exception.getResponse();
  if (typeof body === 'string') return { statusCode: status, message: body, path };
  return { ...(body as Record<string, unknown>), statusCode: status, path };
}

/** 로그·디버그용 요약. Prisma 오류는 코드까지 붙여 원인 추적을 쉽게 한다. */
function describe(exception: unknown): string {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return `PrismaClientKnownRequestError(${exception.code}): ${exception.message}`;
  }
  if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
  return String(exception);
}

function toStack(exception: unknown): string | undefined {
  return exception instanceof Error ? exception.stack : undefined;
}
