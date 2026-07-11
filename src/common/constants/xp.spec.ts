import {
  levelForXp,
  titleForLevel,
  xpToNextTier,
  LEVEL_TIERS,
  computeStreak,
  streakMilestoneXp,
  comboBonusXp,
  isBoostActive,
  boostExpiry,
  weakSubjectIds,
  XP_RULES,
  MILESTONES,
  satisfiedMilestoneKeys,
  milestoneProgress,
} from './xp';

describe('xp — levelForXp', () => {
  it('0 XP는 레벨 1', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('임계값 경계에서 레벨이 오른다', () => {
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(299)).toBe(2);
    expect(levelForXp(300)).toBe(3);
    expect(levelForXp(1000)).toBe(5);
  });

  it('정의된 최고 티어(20)까지 도달한다', () => {
    expect(levelForXp(5000)).toBe(10);
    expect(levelForXp(15000)).toBe(20);
    expect(levelForXp(999999)).toBe(20);
  });

  it('명시 안 된 중간 구간은 아래 티어에 머문다 (보간 없음)', () => {
    // 1000~4999는 레벨 5, 5000에서야 10으로 점프 (프롬프트 스펙 그대로).
    expect(levelForXp(4999)).toBe(5);
  });
});

describe('xp — titleForLevel', () => {
  it('레벨에 맞는 타이틀', () => {
    expect(titleForLevel(1)).toBe('국어 입문자');
    expect(titleForLevel(5)).toBe('국어 달인');
    expect(titleForLevel(20)).toBe('수능 정복자');
  });

  it('정의 안 된 레벨은 그 이하 최고 티어 타이틀', () => {
    expect(titleForLevel(7)).toBe('국어 달인'); // 5~9는 레벨5 타이틀
  });
});

describe('xp — xpToNextTier', () => {
  it('다음 티어까지 남은 XP', () => {
    expect(xpToNextTier(0)).toBe(100);
    expect(xpToNextTier(250)).toBe(50);
  });

  it('최고 티어면 null', () => {
    expect(xpToNextTier(15000)).toBeNull();
    expect(xpToNextTier(20000)).toBeNull();
  });
});

describe('xp — LEVEL_TIERS 무결성', () => {
  it('minXp가 오름차순이다 (levelForXp 전제)', () => {
    for (let i = 1; i < LEVEL_TIERS.length; i++) {
      expect(LEVEL_TIERS[i].minXp).toBeGreaterThan(LEVEL_TIERS[i - 1].minXp);
    }
  });
});

describe('xp — computeStreak', () => {
  const d = (s: string) => new Date(s + 'T12:00:00');

  it('첫 학습이면 streak 1', () => {
    expect(computeStreak(null, 0, d('2026-07-11'))).toEqual({ currentStreak: 1, counted: true });
  });

  it('어제 학습했으면 +1', () => {
    expect(computeStreak(d('2026-07-10'), 3, d('2026-07-11'))).toEqual({
      currentStreak: 4,
      counted: true,
    });
  });

  it('오늘 이미 학습했으면 변화 없음', () => {
    expect(computeStreak(d('2026-07-11'), 4, d('2026-07-11'))).toEqual({
      currentStreak: 4,
      counted: false,
    });
  });

  it('하루 이상 공백이면 1로 리셋', () => {
    expect(computeStreak(d('2026-07-08'), 9, d('2026-07-11'))).toEqual({
      currentStreak: 1,
      counted: true,
    });
  });
});

describe('xp — streakMilestoneXp', () => {
  it('7일 달성 시 STREAK_7 + 부스터', () => {
    expect(streakMilestoneXp(7)).toEqual({ xp: XP_RULES.STREAK_7, grantBoost: true });
  });
  it('30일 달성 시 STREAK_30 + 부스터', () => {
    expect(streakMilestoneXp(30)).toEqual({ xp: XP_RULES.STREAK_30, grantBoost: true });
  });
  it('그 외 날은 보너스 없음', () => {
    expect(streakMilestoneXp(6)).toEqual({ xp: 0, grantBoost: false });
    expect(streakMilestoneXp(8)).toEqual({ xp: 0, grantBoost: false });
  });
});

describe('xp — comboBonusXp', () => {
  it('연속 5정답에 COMBO_5', () => {
    expect(comboBonusXp([true, true, true, true, true])).toBe(XP_RULES.COMBO_5);
  });
  it('연속 10정답에 COMBO_5 + COMBO_10', () => {
    const flags = Array(10).fill(true);
    expect(comboBonusXp(flags)).toBe(XP_RULES.COMBO_5 + XP_RULES.COMBO_10);
  });
  it('오답이 콤보를 끊는다', () => {
    // 4연속 → 오답 → 4연속: 어느 쪽도 5 미달
    expect(comboBonusXp([true, true, true, true, false, true, true, true, true])).toBe(0);
  });
  it('끊긴 뒤 다시 5연속이면 COMBO_5', () => {
    expect(comboBonusXp([true, false, true, true, true, true, true])).toBe(XP_RULES.COMBO_5);
  });
});

describe('xp — 부스터', () => {
  it('만료 전이면 활성', () => {
    const now = new Date('2026-07-11T12:00:00');
    const until = new Date('2026-07-12T00:00:00');
    expect(isBoostActive(until, now)).toBe(true);
  });
  it('만료 후/미설정이면 비활성', () => {
    const now = new Date('2026-07-13T12:00:00');
    expect(isBoostActive(new Date('2026-07-12T00:00:00'), now)).toBe(false);
    expect(isBoostActive(null, now)).toBe(false);
  });
  it('만료 시각은 이틀 뒤 자정(다음날 하루 끝)', () => {
    const exp = boostExpiry(new Date('2026-07-11T15:30:00'));
    expect(exp.getFullYear()).toBe(2026);
    expect(exp.getMonth()).toBe(6); // 7월(0-index)
    expect(exp.getDate()).toBe(13);
    expect(exp.getHours()).toBe(0);
  });
});

describe('xp — weakSubjectIds', () => {
  it('하위 20%(정답률 최저) 과목을 뽑는다', () => {
    const stats = [
      { subjectId: 'a', total: 10, correct: 2 }, // 20% ← 최저
      { subjectId: 'b', total: 10, correct: 5 }, // 50%
      { subjectId: 'c', total: 10, correct: 7 }, // 70%
      { subjectId: 'd', total: 10, correct: 9 }, // 90%
      { subjectId: 'e', total: 10, correct: 8 }, // 80%
    ];
    // 5과목 × 20% = 1과목 → 최저 정답률 'a'
    const weak = weakSubjectIds(stats);
    expect([...weak]).toEqual(['a']);
  });

  it('표본 미달(minSample) 과목은 제외', () => {
    const stats = [
      { subjectId: 'a', total: 2, correct: 0 }, // 0%지만 표본 2 → 제외
      { subjectId: 'b', total: 10, correct: 3 },
      { subjectId: 'c', total: 10, correct: 6 },
      { subjectId: 'd', total: 10, correct: 9 },
    ];
    const weak = weakSubjectIds(stats);
    expect(weak.has('a')).toBe(false);
    expect(weak.has('b')).toBe(true); // 유효 3과목 중 최저
  });

  it('비교 과목이 minSubjects 미만이면 빈 집합', () => {
    const stats = [
      { subjectId: 'a', total: 10, correct: 1 },
      { subjectId: 'b', total: 10, correct: 9 },
    ];
    expect(weakSubjectIds(stats).size).toBe(0); // 2과목뿐 → 판정 안 함
  });

  it('데이터 없으면 빈 집합', () => {
    expect(weakSubjectIds([]).size).toBe(0);
  });
});

describe('xp — MILESTONES 정의', () => {
  it('레벨1(기준선)은 마일스톤이 아니고, 상위 레벨 티어 + STREAK_7/30을 포함한다', () => {
    const keys = MILESTONES.map((m) => m.key);
    expect(keys).not.toContain('LEVEL_1');
    expect(keys).toContain('LEVEL_2');
    expect(keys).toContain('STREAK_7');
    expect(keys).toContain('STREAK_30');
  });

  it('의존성 체인: 첫 레벨 티어와 STREAK_7은 dependsOn=null, 그 다음은 직전 단계', () => {
    const byKey = new Map(MILESTONES.map((m) => [m.key, m]));
    expect(byKey.get('LEVEL_2')!.dependsOn).toBeNull();
    expect(byKey.get('LEVEL_3')!.dependsOn).toBe('LEVEL_2');
    expect(byKey.get('STREAK_7')!.dependsOn).toBeNull();
    expect(byKey.get('STREAK_30')!.dependsOn).toBe('STREAK_7');
  });
});

describe('xp — satisfiedMilestoneKeys', () => {
  it('xp/스트릭 0이면 아무것도 만족 안 함', () => {
    expect(satisfiedMilestoneKeys(0, 0)).toEqual([]);
  });

  it('레벨은 누적 xp 임계 기준 — xp 1000이면 LEVEL_2~5 만족(LEVEL_10 미달)', () => {
    const keys = satisfiedMilestoneKeys(1000, 0);
    expect(keys).toEqual(['LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5']);
  });

  it('스트릭은 역대 최장 기준 — 30이면 7·30 둘 다 만족', () => {
    const keys = satisfiedMilestoneKeys(0, 30);
    expect(keys).toContain('STREAK_7');
    expect(keys).toContain('STREAK_30');
  });

  it('최장 스트릭 7이면 STREAK_7만(30 미달)', () => {
    const keys = satisfiedMilestoneKeys(0, 7);
    expect(keys).toContain('STREAK_7');
    expect(keys).not.toContain('STREAK_30');
  });
});

describe('xp — milestoneProgress', () => {
  it('진행률: 미달 시 ratio<1, 달성 임계에서 1로 캡', () => {
    const rows = milestoneProgress(50, 0, new Map());
    const lv2 = rows.find((r) => r.key === 'LEVEL_2')!;
    expect(lv2.progress).toEqual({ current: 50, target: 100, ratio: 0.5 });
    const rowsFull = milestoneProgress(100, 0, new Map());
    expect(rowsFull.find((r) => r.key === 'LEVEL_2')!.progress.ratio).toBe(1);
  });

  it('locked: 선행(dependsOn) 미달성이면 잠금, 달성 이력 있으면 해제', () => {
    // 달성 이력 없음 → LEVEL_2는 dependsOn=null이라 안 잠기고, LEVEL_3은 LEVEL_2 미달성이라 잠김.
    const none = milestoneProgress(0, 0, new Map());
    expect(none.find((r) => r.key === 'LEVEL_2')!.locked).toBe(false);
    expect(none.find((r) => r.key === 'LEVEL_3')!.locked).toBe(true);

    // LEVEL_2 달성 이력 → LEVEL_3 잠금 해제 + achievedAt 노출.
    const at = new Date(2026, 0, 1);
    const some = milestoneProgress(300, 0, new Map([['LEVEL_2', at]]));
    const lv2 = some.find((r) => r.key === 'LEVEL_2')!;
    expect(lv2.achieved).toBe(true);
    expect(lv2.achievedAt).toBe(at);
    expect(some.find((r) => r.key === 'LEVEL_3')!.locked).toBe(false);
  });
});
