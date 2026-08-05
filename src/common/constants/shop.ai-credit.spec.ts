import {
  AI_FREE_PER_DAY,
  aiFreeRemainingToday,
  resolveAiCreditQuota,
} from '@/common/constants/shop';

/**
 * 무료분 리셋 경계는 **로컬 자정**이다(`aiDayNum`이 getFullYear/getMonth/getDate로 센다 —
 * 한국 사용자에게 리셋은 KST 자정이어야 한다). 그래서 픽스처도 로컬 생성자로 만든다.
 * UTC 문자열(`'2026-08-03T23:59:00Z'`)로 두면 KST에서는 그게 이미 8월 4일 아침이라
 * "어제"가 "오늘"이 되고, 개발자 머신에서만 두 테스트가 깨진다(CI는 UTC라 통과했다).
 */
const TODAY = new Date(2026, 7, 4, 9, 0, 0);
const YESTERDAY = new Date(2026, 7, 3, 23, 59, 0);

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
