import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '@/prisma/prisma.service';

// bcryptjs의 export는 재정의가 안 돼 jest.spyOn이 통하지 않는다.
// 실제 구현을 감싼 모듈 목으로 호출 횟수만 관찰한다.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs');
  return {
    ...actual,
    compare: jest.fn(actual.compare),
    // 서비스의 DUMMY_HASH(hashSync, SALT_ROUNDS=12)가 병렬 테스트 부하에서 느리다.
    // 테스트에서만 라운드를 4로 낮춘다 — compare는 실제 구현 그대로라 검증 의미(호출 여부·결과)는 유지된다.
    hashSync: jest.fn((data: string) => actual.hashSync(data, 4)),
  };
});
const compareMock = bcrypt.compare as unknown as jest.Mock;

const PASSWORD = 'correct-horse-battery';

function makeService(userRow: unknown, update = jest.fn()) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(userRow), update },
  } as unknown as PrismaService;
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as JwtService;
  return { service: new AuthService(prisma, jwt), jwt };
}

describe('AuthService.login', () => {
  it('토큰 클레임에 발급 시점 tokenVersion(tv)을 심는다', async () => {
    const { service, jwt } = makeService({
      id: 'u1',
      email: 'a@b.com',
      nickname: 'a',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      tokenVersion: 7,
      roles: [{ role: 'CONSUMER' }],
    });

    await service.login({ email: 'a@b.com', password: PASSWORD });

    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', email: 'a@b.com', tv: 7 });
  });

  // 실제 bcrypt 비교 4회 — 머신 부하 시 5초 기본 타임아웃을 넘길 수 있어 개별 상향
  it('없는 계정과 틀린 비밀번호가 같은 예외·같은 메시지를 낸다(계정 열거 차단)', async () => {
    const wrongPasswordRow = {
      id: 'u1',
      email: 'a@b.com',
      nickname: 'a',
      passwordHash: await bcrypt.hash('another-password', 4),
      tokenVersion: 0,
      roles: [],
    };
    const missing = () =>
      makeService(null).service.login({ email: 'nope@b.com', password: PASSWORD });
    const wrong = () =>
      makeService(wrongPasswordRow).service.login({ email: 'a@b.com', password: PASSWORD });

    await expect(missing()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(wrong()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(missing()).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다.');
    await expect(wrong()).rejects.toThrow('이메일 또는 비밀번호가 올바르지 않습니다.');
  }, 15000);

  it('없는 계정에서도 bcrypt 비교 비용을 치른다(타이밍 차이 제거)', async () => {
    compareMock.mockClear();

    await expect(
      makeService(null).service.login({ email: 'nope@b.com', password: PASSWORD }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // 더미 해시와 한 번 비교했어야 한다 — 즉시 반환했다면 호출이 0이다.
    expect(compareMock).toHaveBeenCalledTimes(1);
  }, 15000);
});

describe('AuthService.logoutAll', () => {
  it('tokenVersion을 증가시켜 기존 토큰을 무효화한다', async () => {
    const update = jest.fn().mockResolvedValue({ tokenVersion: 8 });
    const { service } = makeService(null, update);

    await expect(service.logoutAll('u1')).resolves.toEqual({ revoked: true, tokenVersion: 8 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
  });
});
