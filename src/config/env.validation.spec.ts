import { validateEnv } from './env.validation';

const GOOD_SECRET = 'x'.repeat(48);
const BASE = { DATABASE_URL: 'mysql://u:p@localhost:3306/qidea', JWT_SECRET: GOOD_SECRET };

describe('validateEnv', () => {
  it('필수 값이 모두 있으면 env를 그대로 돌려준다', () => {
    expect(validateEnv({ ...BASE })).toMatchObject(BASE);
  });

  it('JWT_SECRET이 없으면 부팅을 막는다', () => {
    expect(() => validateEnv({ DATABASE_URL: BASE.DATABASE_URL })).toThrow(/JWT_SECRET이 설정되지/);
  });

  it.each(['change-me', 'change-me-in-production', 'CHANGE-ME'])(
    '공개된 예시 시크릿(%s)은 거부한다',
    (secret) => {
      expect(() => validateEnv({ ...BASE, JWT_SECRET: secret })).toThrow(/공개된 예시 값/);
    },
  );

  it('DATABASE_URL이 없으면 부팅을 막는다', () => {
    expect(() => validateEnv({ JWT_SECRET: GOOD_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('개발 환경에서는 짧은 시크릿을 허용한다(로컬 편의)', () => {
    expect(() => validateEnv({ ...BASE, JWT_SECRET: 'short-but-not-example' })).not.toThrow();
  });

  it('운영에서는 32자 미만 시크릿을 거부한다', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        JWT_SECRET: 'short-but-not-example',
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://qidea.app',
      }),
    ).toThrow(/너무 짧습니다/);
  });

  it('운영에서 ALLOWED_ORIGINS가 비면 거부한다(CORS 전체 반사 방지)', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('개발 환경에서는 ALLOWED_ORIGINS를 요구하지 않는다', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'development' })).not.toThrow();
  });

  it('실패 사유를 한 번에 모아서 보고한다', () => {
    try {
      validateEnv({ NODE_ENV: 'production' });
      fail('throw 했어야 한다');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/JWT_SECRET/);
      expect(msg).toMatch(/DATABASE_URL/);
      expect(msg).toMatch(/ALLOWED_ORIGINS/);
    }
  });
});
