import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * P2000(값이 컬럼 길이를 초과)은 요청이 만든 오류다. 500으로 나가면 클라이언트는
 * 재시도할 장애로 읽고, 사용자는 무엇을 줄여야 하는지 알 수 없다 — 같은 값을 다시
 * 보내면 똑같이 실패한다. 커넥션 장애를 503으로 가른 것과 같은 판단이다.
 */
function makeHost(url = '/api/exam-sessions/questions/x/answer') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { headersSent: false, status, end: jest.fn() };
  const req = { method: 'POST', url };
  return {
    host: { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) },
    status,
    json,
  };
}

const valueTooLong = (message: string) =>
  new Prisma.PrismaClientKnownRequestError(message, { code: 'P2000', clientVersion: 'test' });

describe('AllExceptionsFilter — 값 길이 초과', () => {
  it('P2000은 400으로 내보낸다', () => {
    const { host, status, json } = makeHost();

    new AllExceptionsFilter(true).catch(valueTooLong('value too long'), host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('너무 깁니다'),
      }),
    );
  });

  it('400 응답에도 컬럼명을 싣지 않는다(운영) — 필터의 존재 이유가 스키마 유출 차단이다', () => {
    const { host, json } = makeHost();
    const err = valueTooLong(
      "The provided value for the column is too long. Column: answer_text",
    );

    new AllExceptionsFilter(true).catch(err, host as never);

    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('answer_text');
  });

  it('개발 환경에서는 원본을 debug로 남긴다(상태 코드는 그대로 400)', () => {
    const { host, status, json } = makeHost();

    new AllExceptionsFilter(false).catch(valueTooLong('column too long'), host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json.mock.calls[0][0]).toHaveProperty('debug', expect.stringContaining('P2000'));
  });

  it('다른 Prisma 오류(P2002)는 여전히 500이다 — 400으로 넓히지 않는다', () => {
    const { host, status } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: 'test',
    });

    new AllExceptionsFilter(true).catch(err, host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
