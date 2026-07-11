import { Test } from '@nestjs/testing';
import { ExamSessionsService } from './exam-sessions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { XP_RULES } from '@/common/constants/xp';

/**
 * readChoiceIds는 Json 컬럼(selected_choice_ids)을 읽는 방어 로직이다.
 * DB가 무엇을 담고 있든 선지 분포 카운터를 오염시키지 않아야 한다.
 */
describe('ExamSessionsService.readChoiceIds', () => {
  let read: (raw: unknown) => string[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ExamSessionsService, { provide: PrismaService, useValue: {} }],
    }).compile();
    const service = module.get(ExamSessionsService);
    // private 헬퍼 — 분포 집계의 유일한 입력 정제 지점이라 직접 검증한다.
    read = (raw: unknown) => (service as unknown as { readChoiceIds(r: unknown): string[] }).readChoiceIds(raw);
  });

  it('문자열 배열을 그대로 통과시킨다', () => {
    expect(read(['c1', 'c3'])).toEqual(['c1', 'c3']);
  });

  it('중복 선택을 한 번만 센다 (분포 부풀리기 방지)', () => {
    expect(read(['c2', 'c2', 'c2'])).toEqual(['c2']);
  });

  it('배열이 아니면 빈 배열 (null / 객체 / 숫자)', () => {
    expect(read(null)).toEqual([]);
    expect(read(undefined)).toEqual([]);
    expect(read({ c1: true })).toEqual([]);
    expect(read(42)).toEqual([]);
  });

  it('배열 안의 비문자열·빈문자열을 걸러낸다', () => {
    expect(read(['c1', 3, null, '', { id: 'c2' }, 'c4'])).toEqual(['c1', 'c4']);
  });
});

/**
 * 데일리 챌린지(+50) 지급 게이트 회귀 테스트.
 *
 * 비즈니스 규칙: 당일 첫 채점 제출(st.counted === true)에만 고정 50 XP, 부스터 미적용.
 * 같은 날 두 번째 제출부터는 0. st.counted는 lastActiveDate 대비 now로 결정되므로,
 * 그 둘만 조작하고 정답·콤보·취약(solve/combo/weak)을 0으로 두면 gained == dailyXp가 되어
 * 데일리 보너스만 고립 검증할 수 있다. tx는 user.findUnique/update만 스텁하면 충분하다.
 */
describe('ExamSessionsService.awardForSubmit — 데일리 챌린지 게이트', () => {
  let service: ExamSessionsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      // awardForSubmit은 tx를 인자로 받으므로 PrismaService 자체는 쓰지 않는다 → 빈 스텁.
      providers: [ExamSessionsService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = module.get(ExamSessionsService);
  });

  /**
   * 최소 tx 스텁 — user.findUnique/update + 원장/마일스톤 기록(recordXpEvent가 호출).
   * xpHistory.create / milestoneAchievement.createMany도 스텁해야 recordXpEvent가 에러 없이 돈다.
   */
  function makeTx(user: Record<string, unknown>) {
    const update = jest.fn().mockResolvedValue({});
    const xpHistoryCreate = jest.fn().mockResolvedValue({});
    const milestoneCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue(user), update },
      xpHistory: { create: xpHistoryCreate },
      milestoneAchievement: { createMany: milestoneCreateMany },
    };
    return { tx, update, xpHistoryCreate, milestoneCreateMany };
  }

  /** private 메서드 직접 호출. solve/combo/weak = 0으로 두어 gained == dailyXp가 되게 한다. */
  function award(tx: unknown, now: Date) {
    return (
      service as unknown as {
        awardForSubmit(
          tx: unknown,
          userId: string,
          correctCount: number,
          correctFlags: boolean[],
          now: Date,
          perCorrectXp: number,
          weakCorrectCount: number,
          examSessionId: string,
        ): Promise<{
          xp: number;
          gained: number;
          breakdown: { dailyXp: number };
        }>;
      }
    ).awardForSubmit(tx, 'u1', 0, [], now, XP_RULES.CORRECT, 0, 'sess-1');
  }

  it('상수 sanity — DAILY_CHALLENGE는 50 고정', () => {
    expect(XP_RULES.DAILY_CHALLENGE).toBe(50);
  });

  it('Case 1: 당일 첫 제출(st.counted=true)이면 dailyXp=50 지급', async () => {
    const now = new Date(2026, 6, 11, 10, 0, 0);
    // lastActiveDate=null → 첫 학습 → counted=true. streak는 1로 전이돼 마일스톤 0(오염 없음).
    const user = {
      xp: 100,
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: null,
      xpBoostUntil: null,
    };
    const { tx, update, xpHistoryCreate } = makeTx(user);

    const reward = await award(tx, now);

    expect(reward.breakdown.dailyXp).toBe(50);
    expect(reward.gained).toBe(50); // solve/combo/weak/streak 모두 0 → 데일리만 남음
    expect(reward.xp).toBe(150); // 100 + 50

    // 저장된 xp도 150, 그리고 첫 학습이라 lastActiveDate가 now로 갱신돼야 한다.
    const saved = update.mock.calls[0][0].data;
    expect(saved.xp).toBe(150);
    expect(saved.lastActiveDate).toBe(now);

    // 원장 1행: 이번 이벤트 +50, 사유 SESSION_SUBMIT, 잔액 150, 출처 세션 기록.
    expect(xpHistoryCreate).toHaveBeenCalledTimes(1);
    const ledger = xpHistoryCreate.mock.calls[0][0].data;
    expect(ledger.amount).toBe(50);
    expect(ledger.reason).toBe('SESSION_SUBMIT');
    expect(ledger.balanceAfter).toBe(150);
    expect(ledger.examSessionId).toBe('sess-1');
  });

  it('Case 2: 같은 날 두 번째 제출(st.counted=false)이면 dailyXp=0', async () => {
    const now = new Date(2026, 6, 11, 10, 0, 0);
    // lastActiveDate가 오늘(같은 달력일) → diff=0 → counted=false → 데일리 미지급, 스트릭 유지.
    const user = {
      xp: 100,
      currentStreak: 3,
      longestStreak: 5,
      lastActiveDate: new Date(2026, 6, 11, 8, 0, 0),
      xpBoostUntil: null,
    };
    const { tx, update, xpHistoryCreate } = makeTx(user);

    const reward = await award(tx, now);

    expect(reward.breakdown.dailyXp).toBe(0);
    expect(reward.gained).toBe(0);
    expect(reward.xp).toBe(100); // 변화 없음

    // counted=false면 lastActiveDate 키 자체가 update data에서 빠져야 한다(스프레드 생략).
    const saved = update.mock.calls[0][0].data;
    expect(saved.xp).toBe(100);
    expect('lastActiveDate' in saved).toBe(false);

    // 순증감 0이면 원장 행을 남기지 않는다(노이즈 방지).
    expect(xpHistoryCreate).not.toHaveBeenCalled();
  });
});
