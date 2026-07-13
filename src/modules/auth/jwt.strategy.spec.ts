import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '@/prisma/prisma.service';

/** 커넥션 끊김 오류를 생성자 시그니처에 의존하지 않고 만든다(버전 안정). */
function connectionError(code: 'P1017' | 'P1001') {
  const err = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;
  Object.assign(err, { code, clientVersion: 'test', message: `mock ${code}` });
  return err;
}

const CLAIMS = { sub: 'user-1', email: 'a@b.com' };
const USER_ROW = {
  id: 'user-1',
  email: 'a@b.com',
  roles: [{ role: 'CREATOR' }],
};

function makeStrategy(prisma: Partial<PrismaService>) {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  return new JwtStrategy(config, prisma as PrismaService);
}

describe('JwtStrategy.validate', () => {
  it('사용자를 찾으면 role 배열을 담은 페이로드를 반환한다', async () => {
    const strategy = makeStrategy({
      user: { findUnique: jest.fn().mockResolvedValue(USER_ROW) } as any,
    });

    await expect(strategy.validate(CLAIMS)).resolves.toEqual({
      id: 'user-1',
      email: 'a@b.com',
      roles: ['CREATOR'],
    });
  });

  it('사용자가 없으면 401(UnauthorizedException)', async () => {
    const strategy = makeStrategy({
      user: { findUnique: jest.fn().mockResolvedValue(null) } as any,
    });

    await expect(strategy.validate(CLAIMS)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('커넥션 끊김(P1017)은 재연결 후 재시도해 성공하면 정상 반환', async () => {
    const findUnique = jest
      .fn()
      .mockRejectedValueOnce(connectionError('P1017'))
      .mockResolvedValueOnce(USER_ROW);
    const $connect = jest.fn().mockResolvedValue(undefined);
    const strategy = makeStrategy({ user: { findUnique } as any, $connect } as any);

    await expect(strategy.validate(CLAIMS)).resolves.toMatchObject({ id: 'user-1' });
    expect($connect).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('재시도까지 실패하면 401이 아니라 503(ServiceUnavailable)', async () => {
    const findUnique = jest.fn().mockRejectedValue(connectionError('P1017'));
    const $connect = jest.fn().mockResolvedValue(undefined);
    const strategy = makeStrategy({ user: { findUnique } as any, $connect } as any);

    await expect(strategy.validate(CLAIMS)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('커넥션 오류가 아닌 예외는 재시도 없이 그대로 전파', async () => {
    const boom = new Error('보통 오류');
    const findUnique = jest.fn().mockRejectedValue(boom);
    const $connect = jest.fn();
    const strategy = makeStrategy({ user: { findUnique } as any, $connect } as any);

    await expect(strategy.validate(CLAIMS)).rejects.toBe(boom);
    expect($connect).not.toHaveBeenCalled();
  });
});
