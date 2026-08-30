import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * 커넥션 장애를 500으로 내보내면 안 된다.
 *
 * TiDB Serverless가 유휴 커넥션을 끊으면 그 뒤 첫 요청이 실패한다. 이건 재시도하면
 * 되는 일시 장애지 우리 코드의 버그가 아니다. 500으로 나가면 클라이언트도 모니터링도
 * "고쳐야 할 버그"로 읽는다. jwt.strategy는 같은 상황을 이미 503으로 올리고 있었고,
 * 여기만 500이라 같은 장애가 경로에 따라 다른 얼굴로 나갔다.
 */
function makeHost(url = '/api/questions') {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { headersSent: false, status, end: jest.fn() };
  const req = { method: 'GET', url };
  return {
    host: {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
    },
    status,
    json,
  };
}

describe('AllExceptionsFilter — 커넥션 장애', () => {
  const filter = new AllExceptionsFilter(true);

  it('P1017(서버가 커넥션을 닫음)은 503으로 내보낸다', () => {
    const { host, status, json } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('Server has closed the connection.', {
      code: 'P1017',
      clientVersion: 'test',
    });

    filter.catch(err, host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HttpStatus.SERVICE_UNAVAILABLE }),
    );
  });

  it('P1001(서버 도달 불가)도 503', () => {
    const { host, status } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('Can\'t reach database server', {
      code: 'P1001',
      clientVersion: 'test',
    });

    filter.catch(err, host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('그 밖의 오류는 그대로 500', () => {
    const { host, status } = makeHost();

    filter.catch(new Error('진짜 버그'), host as never);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('503 응답에도 내부 메시지를 싣지 않는다(운영)', () => {
    const { host, json } = makeHost();
    const err = new Prisma.PrismaClientKnownRequestError('users 테이블 어쩌고', {
      code: 'P1017',
      clientVersion: 'test',
    });

    filter.catch(err, host as never);

    const body = JSON.stringify(json.mock.calls[0][0]);
    expect(body).not.toContain('users');
    expect(body).not.toContain('어쩌고');
  });
});
