import { GeminiKeyPool } from './gemini-key-pool';

/** 주입 가능한 가짜 시계 — 쿨다운 만료를 결정적으로 검증한다. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('GeminiKeyPool', () => {
  it('공백/빈값/중복 키를 정리하고 순서를 보존한다', () => {
    const pool = new GeminiKeyPool([' k1 ', '', 'k2', 'k1', '   ']);
    expect(pool.size).toBe(2);
    expect(pool.hasKeys).toBe(true);
    expect(pool.availableCount()).toBe(2);
  });

  it('키가 없으면 acquire는 null, hasKeys는 false', () => {
    const pool = new GeminiKeyPool(['', '  ']);
    expect(pool.hasKeys).toBe(false);
    expect(pool.acquire()).toBeNull();
  });

  it('라운드-로빈으로 키를 순환한다', () => {
    const pool = new GeminiKeyPool(['a', 'b', 'c']);
    expect(pool.acquire()).toBe('a');
    expect(pool.acquire()).toBe('b');
    expect(pool.acquire()).toBe('c');
    expect(pool.acquire()).toBe('a');
  });

  it('penalize된 키는 쿨다운 동안 건너뛴다', () => {
    const clock = fakeClock();
    const pool = new GeminiKeyPool(['a', 'b'], { now: clock.now, cooldownMs: 60_000 });

    const first = pool.acquire(); // 'a'
    expect(first).toBe('a');
    pool.penalize('a', 429);

    // a는 쿨다운 → b만 계속 나온다
    expect(pool.acquire()).toBe('b');
    expect(pool.acquire()).toBe('b');
    expect(pool.availableCount()).toBe(1);
  });

  it('쿨다운이 만료되면 키가 다시 가용해진다', () => {
    const clock = fakeClock();
    const pool = new GeminiKeyPool(['a'], { now: clock.now, cooldownMs: 60_000 });

    pool.penalize('a', 429);
    expect(pool.acquire()).toBeNull(); // 유일한 키가 쿨다운

    clock.advance(60_001);
    expect(pool.acquire()).toBe('a'); // 회복
  });

  it('403은 429보다 긴 쿨다운을 적용한다', () => {
    const clock = fakeClock();
    const pool = new GeminiKeyPool(['a'], {
      now: clock.now,
      cooldownMs: 60_000,
      cooldownQuotaMs: 900_000,
    });

    pool.penalize('a', 403);
    clock.advance(60_001); // 429 창은 지났지만
    expect(pool.acquire()).toBeNull(); // 403 창은 아직

    clock.advance(900_000);
    expect(pool.acquire()).toBe('a');
  });

  it('모든 키가 쿨다운이면 acquire는 null, 회복 후 다시 순환', () => {
    const clock = fakeClock();
    const pool = new GeminiKeyPool(['a', 'b'], { now: clock.now, cooldownMs: 60_000 });

    pool.penalize('a', 429);
    pool.penalize('b', 429);
    expect(pool.availableCount()).toBe(0);
    expect(pool.acquire()).toBeNull();

    clock.advance(60_001);
    expect(pool.availableCount()).toBe(2);
    expect(pool.acquire()).not.toBeNull();
  });
});
