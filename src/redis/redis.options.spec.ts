import type { ConfigService } from '@nestjs/config';
import { redisConnectionOptions, sharedRedisOptions } from './redis.options';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

describe('redisConnectionOptions', () => {
  it('env를 그대로 읽는다', () => {
    const out = redisConnectionOptions(
      cfg({ REDIS_HOST: 'valkey.example', REDIS_PORT: '26253', REDIS_PASSWORD: 'pw' }),
    );
    expect(out).toMatchObject({ host: 'valkey.example', port: 26253, password: 'pw' });
  });

  it('REDIS_TLS=true 일 때만 TLS를 켠다(관리형 Redis는 필수, 로컬은 붙지 않는다)', () => {
    expect(redisConnectionOptions(cfg({ REDIS_TLS: 'true' })).tls).toEqual({});
    expect(redisConnectionOptions(cfg({})).tls).toBeUndefined();
    expect(redisConnectionOptions(cfg({ REDIS_TLS: 'false' })).tls).toBeUndefined();
  });

  it('빈 비밀번호는 undefined로 넘긴다(빈 문자열로 AUTH를 보내지 않게)', () => {
    expect(redisConnectionOptions(cfg({ REDIS_PASSWORD: '' })).password).toBeUndefined();
  });
});

describe('sharedRedisOptions', () => {
  /**
   * 이 상한들이 사라지면 조용히 아주 나쁜 일이 생긴다: 레이트리밋 저장소가 이 클라이언트를
   * 쓰고, 그건 전역 가드가 모든 요청에서 부른다. Redis가 응답하지 않을 때 커맨드가 무한정
   * 매달리면 요청이 함수 시간 한도까지 붙잡히고, 저장소의 fail-open은 예외를 못 받아
   * 영영 실행되지 않는다.
   */
  it('커맨드·연결에 시간 상한을 건다', () => {
    const out = sharedRedisOptions(cfg({}));
    expect(out.commandTimeout).toBeGreaterThan(0);
    expect(out.connectTimeout).toBeGreaterThan(0);
  });

  it('재시도를 무제한으로 두지 않는다(null은 무제한이라는 뜻이다)', () => {
    const out = sharedRedisOptions(cfg({}));
    expect(out.maxRetriesPerRequest).not.toBeNull();
    expect(typeof out.maxRetriesPerRequest).toBe('number');
  });

  it('접속 정보는 공용 함수와 같은 값을 쓴다', () => {
    const env = { REDIS_HOST: 'h', REDIS_PORT: '1234', REDIS_TLS: 'true' };
    expect(sharedRedisOptions(cfg(env))).toMatchObject(redisConnectionOptions(cfg(env)));
  });
});
