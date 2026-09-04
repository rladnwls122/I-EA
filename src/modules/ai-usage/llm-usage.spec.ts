import { estimateCostMicros, MICROS_PER_USD, parsePrices } from './llm-pricing';
import { EMPTY_TOKEN_USAGE, parseUsageMetadata } from './llm-usage.recorder';
import { rangeStart, usageDateOf, USAGE_MAX_RANGE_DAYS } from './llm-usage.constants';

describe('parseUsageMetadata — Gemini usageMetadata → 토큰 수', () => {
  it('네 필드를 그대로 읽는다', () => {
    expect(
      parseUsageMetadata({
        promptTokenCount: 1200,
        candidatesTokenCount: 800,
        thoughtsTokenCount: 300,
        totalTokenCount: 2300,
      }),
    ).toEqual({
      promptTokens: 1200,
      outputTokens: 800,
      thinkingTokens: 300,
      totalTokens: 2300,
    });
  });

  it('totalTokenCount가 없으면 우리가 아는 것만 더한다', () => {
    expect(parseUsageMetadata({ promptTokenCount: 100, candidatesTokenCount: 50 })?.totalTokens).toBe(
      150,
    );
  });

  it('thinking 토큰은 따로 남긴다 — 출력에 합쳐 두면 사고 비용을 볼 수 없다', () => {
    const usage = parseUsageMetadata({ candidatesTokenCount: 10, thoughtsTokenCount: 900 });
    expect(usage).toMatchObject({ outputTokens: 10, thinkingTokens: 900 });
  });

  it('usageMetadata가 없거나 비어 있으면 null — 0으로 지어내지 않는다', () => {
    expect(parseUsageMetadata(undefined)).toBeNull();
    expect(parseUsageMetadata(null)).toBeNull();
    expect(parseUsageMetadata({})).toBeNull();
    expect(parseUsageMetadata('nope')).toBeNull();
  });

  it('숫자가 아닌 값은 0으로 접는다(문자열 토큰 수를 그대로 저장하지 않는다)', () => {
    expect(parseUsageMetadata({ promptTokenCount: '12', totalTokenCount: 12 })).toEqual({
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 12,
    });
  });
});

describe('estimateCostMicros — 토큰 → 추정 원가', () => {
  const prices = { inputPerMTok: 0.3, outputPerMTok: 2.5 };

  it('입력·출력 단가를 각각 적용한다', () => {
    // 1M 입력 = $0.30 = 300,000 마이크로
    expect(
      estimateCostMicros(
        { promptTokens: 1_000_000, outputTokens: 0, thinkingTokens: 0 },
        prices,
      ),
    ).toBe(300_000);
    expect(
      estimateCostMicros(
        { promptTokens: 0, outputTokens: 1_000_000, thinkingTokens: 0 },
        prices,
      ),
    ).toBe(2_500_000);
  });

  it('thinking 토큰은 출력 단가로 친다(Gemini 과금 방식)', () => {
    const withThinking = estimateCostMicros(
      { promptTokens: 0, outputTokens: 0, thinkingTokens: 1_000_000 },
      prices,
    );
    expect(withThinking).toBe(2_500_000);
  });

  it('단가를 모르면 null — 0으로 적으면 "원가가 없다"는 거짓이 된다', () => {
    expect(
      estimateCostMicros({ promptTokens: 5000, outputTokens: 5000, thinkingTokens: 0 }, null),
    ).toBeNull();
  });

  it('작은 호출도 마이크로 단위에서 살아남는다', () => {
    const cost = estimateCostMicros(
      { promptTokens: 2000, outputTokens: 3000, thinkingTokens: 0 },
      prices,
    );
    expect(cost).toBeGreaterThan(0);
    expect(cost! / MICROS_PER_USD).toBeCloseTo(0.0081, 6);
  });
});

describe('parsePrices — 단가 env 파싱', () => {
  it('둘 다 있으면 읽는다', () => {
    expect(parsePrices('0.3', '2.5')).toEqual({ inputPerMTok: 0.3, outputPerMTok: 2.5 });
  });

  it('한쪽만 있으면 null — 반쪽 단가로 계산한 원가는 틀린 값이다', () => {
    expect(parsePrices('0.3', undefined)).toBeNull();
    expect(parsePrices(undefined, '2.5')).toBeNull();
  });

  it('숫자가 아니거나 음수면 null', () => {
    expect(parsePrices('공짜', '2.5')).toBeNull();
    expect(parsePrices('-1', '2.5')).toBeNull();
  });

  it('0은 유효하다 — 무료 티어를 쓰는 운영도 있다', () => {
    expect(parsePrices('0', '0')).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
  });
});

describe('날짜 축', () => {
  it('usageDate는 서버 로컬 기준 YYYY-MM-DD다 — 무료 크레딧·스트릭과 같은 하루 경계', () => {
    expect(usageDateOf(new Date(2026, 8, 4, 23, 59))).toBe('2026-09-04');
    expect(usageDateOf(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('rangeStart는 오늘을 포함해 days일을 덮는다', () => {
    const now = new Date(2026, 8, 4, 15, 30);
    expect(usageDateOf(rangeStart(1, now))).toBe('2026-09-04');
    expect(usageDateOf(rangeStart(7, now))).toBe('2026-08-29');
  });

  it('rangeStart는 그 날 0시다 — 하루가 잘려 들어오지 않는다', () => {
    const start = rangeStart(3, new Date(2026, 8, 4, 15, 30));
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('조회 상한이 정의돼 있다 — 원장 전량 스캔을 막는 유일한 방어선', () => {
    expect(USAGE_MAX_RANGE_DAYS).toBeGreaterThan(0);
  });
});

describe('EMPTY_TOKEN_USAGE', () => {
  it('전부 0이다 — usageMetadata를 못 읽은 호출도 행은 남긴다', () => {
    expect(EMPTY_TOKEN_USAGE).toEqual({
      promptTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
    });
  });
});
