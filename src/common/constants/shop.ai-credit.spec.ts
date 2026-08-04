import {
  AI_FREE_PER_DAY,
  aiFreeRemainingToday,
  resolveAiCreditQuota,
} from '@/common/constants/shop';

const TODAY = new Date('2026-08-04T09:00:00Z');
const YESTERDAY = new Date('2026-08-03T23:59:00Z');

describe('resolveAiCreditQuota — AI 크레딧 소모 판정', () => {
  it('오늘 처음이면 무료분을 쓴다(크레딧 보유와 무관)', () => {
    expect(resolveAiCreditQuota(null, 0, 99, TODAY)).toEqual({
      allow: true,
      useCredit: false,
      newFreeUsed: 1,
    });
  });

  it('무료분이 남아 있으면 크레딧을 먼저 태우지 않는다 — 매일 리셋되는 쪽부터 쓴다', () => {
    const q = resolveAiCreditQuota(TODAY, AI_FREE_PER_DAY - 1, 5, TODAY);
    expect(q.useCredit).toBe(false);
    expect(q.newFreeUsed).toBe(AI_FREE_PER_DAY);
  });

  it('무료분을 다 쓰면 크레딧으로 넘어간다', () => {
    expect(resolveAiCreditQuota(TODAY, AI_FREE_PER_DAY, 1, TODAY)).toEqual({
      allow: true,
      useCredit: true,
      newFreeUsed: AI_FREE_PER_DAY,
    });
  });

  it('무료분도 크레딧도 없으면 막는다', () => {
    expect(resolveAiCreditQuota(TODAY, AI_FREE_PER_DAY, 0, TODAY).allow).toBe(false);
  });

  it('날짜가 바뀌면 어제 다 썼어도 무료분이 되살아난다', () => {
    const q = resolveAiCreditQuota(YESTERDAY, AI_FREE_PER_DAY, 0, TODAY);
    expect(q).toEqual({ allow: true, useCredit: false, newFreeUsed: 1 });
  });

  it('저장된 카운트가 상한을 넘어 있어도 막힌 상태를 유지한다(음수 잔량 방지)', () => {
    expect(resolveAiCreditQuota(TODAY, AI_FREE_PER_DAY + 3, 0, TODAY).allow).toBe(false);
  });
});

describe('aiFreeRemainingToday — 지갑 표시용 잔여 무료 턴', () => {
  it('한 번도 안 썼으면 전부 남는다', () => {
    expect(aiFreeRemainingToday(null, 0, TODAY)).toBe(AI_FREE_PER_DAY);
  });

  it('어제 기록은 오늘 잔량에 영향을 주지 않는다', () => {
    expect(aiFreeRemainingToday(YESTERDAY, AI_FREE_PER_DAY, TODAY)).toBe(AI_FREE_PER_DAY);
  });

  it('쓴 만큼 줄어든다', () => {
    expect(aiFreeRemainingToday(TODAY, 2, TODAY)).toBe(AI_FREE_PER_DAY - 2);
  });

  it('절대 음수가 되지 않는다', () => {
    expect(aiFreeRemainingToday(TODAY, AI_FREE_PER_DAY + 5, TODAY)).toBe(0);
  });
});
