/**
 * XP / 레벨 규칙 (미니멀 게이미피케이션).
 *
 * 랭킹·티어·리그 없이 개인 성장에만 집중하는 설계. User에는 xp/level 두 필드만 둔다.
 * 이 파일이 적립 규칙과 레벨 임계값의 단일 출처다 — 적립/판정 코드는 여기만 참조한다.
 */

/** 행동별 획득 XP. 적립 로직(정답 채점 등)이 이 값을 더한다. */
export const XP_RULES = {
  /** 문제 1개 정답 */
  CORRECT: 10,
  /** 오답 복습 문제 정답 (추가 동기) */
  REVIEW_CORRECT: 15,
  /** 데일리 챌린지 완료 보너스 */
  DAILY_CHALLENGE: 50,
  /** 연속 5문제 정답 콤보 */
  COMBO_5: 20,
  /** 연속 10문제 정답 콤보 */
  COMBO_10: 50,
  /** 스트릭 7일 달성 */
  STREAK_7: 100,
  /** 스트릭 30일 달성 */
  STREAK_30: 500,
  /** 취약 유형(하위 20% 정답률) 격파 */
  WEAK_TYPE: 25,
} as const;

export type XpRule = keyof typeof XP_RULES;

/**
 * 레벨 임계값 — (level, minXp, title). 오름차순 정렬 유지.
 *
 * ⚠️ 프롬프트에 명시된 티어만 정의한다. 명시 안 된 중간 레벨(6~9, 11~19)은
 *    아직 미정의이며, 근거 없이 숫자를 보간하지 않는다(정밀 수치 날조 방지).
 *    중간 티어가 필요해지면 이 배열에 행만 추가하면 된다.
 */
export const LEVEL_TIERS: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  // 타이틀은 과목 무관 — 어떤 과목을 풀든 통용되는 귀여운 성장 사다리.
  { level: 1, minXp: 0, title: '자라나는 새싹' },
  { level: 2, minXp: 100, title: '귀여운 병아리' },
  { level: 3, minXp: 300, title: '씩씩한 토끼' },
  { level: 4, minXp: 600, title: '날쌘 사슴' },
  { level: 5, minXp: 1000, title: '지혜로운 부엉이' },
  { level: 10, minXp: 5000, title: '늠름한 호랑이' },
  { level: 20, minXp: 15000, title: '전설의 불사조' },
];

/** XP 원장(xp_history)의 reason 값 — 적립 이벤트 종류. */
export const XP_REASON = {
  /** 세션 제출 채점 적립(정답+콤보+취약+스트릭+데일리 합산). */
  SESSION_SUBMIT: 'SESSION_SUBMIT',
  /** 서술형 자기채점 확정/정정 적립(하향 시 음수). */
  SELF_GRADE: 'SELF_GRADE',
  /** 공개 문제집 발행에 따른 저자 보상 적립(하루 캡 있음). */
  AUTHOR_PUBLISH: 'AUTHOR_PUBLISH',
} as const;
export type XpReason = (typeof XP_REASON)[keyof typeof XP_REASON];

/**
 * 마일스톤 정의 — 진행률/의존성/달성 추적의 단일 출처.
 *   kind   = LEVEL(누적 xp 임계) | STREAK(연속 학습일).
 *   target = 달성 임계값 (LEVEL은 minXp, STREAK은 일수).
 *   dependsOn = 선행 마일스톤 key(체인). 미달성이면 locked. 첫 단계는 null.
 * LEVEL은 LEVEL_TIERS에서 파생(레벨1 기준선은 마일스톤 아님). STREAK은 7/30.
 */
export type MilestoneKind = 'LEVEL' | 'STREAK';
export interface MilestoneDef {
  key: string;
  kind: MilestoneKind;
  label: string;
  target: number;
  dependsOn: string | null;
}

export const MILESTONES: ReadonlyArray<MilestoneDef> = (() => {
  const defs: MilestoneDef[] = [];
  // 레벨 마일스톤: 기준선(첫 티어, minXp 0)을 제외한 상위 티어. 의존성은 직전 레벨 티어.
  const upper = LEVEL_TIERS.slice(1);
  upper.forEach((tier, i) => {
    defs.push({
      key: `LEVEL_${tier.level}`,
      kind: 'LEVEL',
      label: `${tier.title} (Lv.${tier.level})`,
      target: tier.minXp,
      dependsOn: i === 0 ? null : `LEVEL_${upper[i - 1].level}`,
    });
  });
  // 스트릭 마일스톤: 7일 → 30일 체인.
  defs.push({ key: 'STREAK_7', kind: 'STREAK', label: '7일 연속 학습', target: 7, dependsOn: null });
  defs.push({
    key: 'STREAK_30',
    kind: 'STREAK',
    label: '30일 연속 학습',
    target: 30,
    dependsOn: 'STREAK_7',
  });
  return defs;
})();

/**
 * 현재 지표로 '달성 조건을 만족한' 마일스톤 key 목록.
 *   LEVEL  → 누적 xp가 target(minXp) 이상.
 *   STREAK → 역대 최장 스트릭이 target 이상(리셋돼도 이미 달성한 건 유지).
 * 멱등 기록(createMany skipDuplicates)의 입력으로 쓴다 — 매번 전체 만족 집합을 넘겨도
 * 새로 달성한 것만 삽입된다.
 */
export function satisfiedMilestoneKeys(xp: number, longestStreak: number): string[] {
  return MILESTONES.filter((m) =>
    m.kind === 'LEVEL' ? xp >= m.target : longestStreak >= m.target,
  ).map((m) => m.key);
}

/**
 * 읽기용 마일스톤 진행 상태. 달성 이력(achievedKeys/achievedAt)과 현재 지표를 합쳐
 *   - achieved/achievedAt: 달성 여부·시각
 *   - progress: 현재값/목표/비율(0~1)
 *   - locked: 선행(dependsOn) 미달성 여부
 * 을 정의 순서대로 반환한다.
 */
export function milestoneProgress(
  xp: number,
  longestStreak: number,
  achieved: Map<string, Date>,
): Array<
  MilestoneDef & {
    achieved: boolean;
    achievedAt: Date | null;
    progress: { current: number; target: number; ratio: number };
    locked: boolean;
  }
> {
  return MILESTONES.map((m) => {
    const metric = m.kind === 'LEVEL' ? xp : longestStreak;
    const current = Math.min(metric, m.target);
    const ratio = m.target > 0 ? Math.min(1, metric / m.target) : 1;
    return {
      ...m,
      achieved: achieved.has(m.key),
      achievedAt: achieved.get(m.key) ?? null,
      progress: { current, target: m.target, ratio: Math.round(ratio * 1000) / 1000 },
      locked: m.dependsOn != null && !achieved.has(m.dependsOn),
    };
  });
}

/** xp로 현재 레벨을 구한다 — minXp가 xp 이하인 티어 중 최고 레벨. */
export function levelForXp(xp: number): number {
  let level = LEVEL_TIERS[0].level;
  for (const tier of LEVEL_TIERS) {
    if (xp >= tier.minXp) level = tier.level;
    else break;
  }
  return level;
}

/** 레벨의 타이틀 — 정의된 티어가 없으면 그 이하 최고 티어의 타이틀. */
export function titleForLevel(level: number): string {
  let title = LEVEL_TIERS[0].title;
  for (const tier of LEVEL_TIERS) {
    if (level >= tier.level) title = tier.title;
    else break;
  }
  return title;
}

/** 다음 티어까지 남은 xp (최고 티어에 도달했으면 null). 진행바 표시용. */
export function xpToNextTier(xp: number): number | null {
  for (const tier of LEVEL_TIERS) {
    if (xp < tier.minXp) return tier.minXp - xp;
  }
  return null;
}

// --- 스트릭 / 콤보 / 부스터 규칙 (순수 함수) ---------------------------------
// DB·시각에 의존하지 않도록 today/now를 인자로 받는다 → 결정적 단위 테스트 가능.

/** XP 2배 부스터 배수. */
export const BOOST_MULTIPLIER = 2;

/** 로컬 달력 기준 하루 단위 정수 인덱스. 두 날짜의 '일수 차'를 tz 흔들림 없이 구한다. */
function dayIndex(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * 스트릭 전이. 오늘 학습(채점)이 일어났을 때 새 연속일수를 구한다.
 *   - 오늘 이미 학습함(diff<=0): 변화 없음(counted=false).
 *   - 어제 학습함(diff===1): +1.
 *   - 하루 공백(diff===2)이고 shieldCount>0: '연속학습 보호권' 1개 소모해 스트릭 유지 + 오늘 +1.
 *   - 그 외(첫 학습이거나 이틀 이상 공백/shield 없음): 1로 리셋.
 * shieldCount는 기본값 0 — 기존 3-인자 호출부는 shieldConsumed:false로 동일하게 동작(하위호환).
 */
export function computeStreak(
  lastActive: Date | null | undefined,
  currentStreak: number,
  today: Date,
  shieldCount = 0,
): { currentStreak: number; counted: boolean; shieldConsumed: boolean } {
  if (!lastActive) return { currentStreak: 1, counted: true, shieldConsumed: false };
  const diff = dayIndex(today) - dayIndex(lastActive);
  if (diff <= 0) return { currentStreak, counted: false, shieldConsumed: false };
  if (diff === 1) return { currentStreak: currentStreak + 1, counted: true, shieldConsumed: false };
  // diff >= 2: 하루 이상 공백. shield 1개로 1일 결석만 방어(스트릭 유지 + 오늘 +1).
  if (diff === 2 && shieldCount > 0) {
    return { currentStreak: currentStreak + 1, counted: true, shieldConsumed: true };
  }
  return { currentStreak: 1, counted: true, shieldConsumed: false };
}

/** 스트릭 마일스톤 보너스. 정확히 7일·30일에 도달한 날에만 발동(+부스터 부여). */
export function streakMilestoneXp(streak: number): { xp: number; grantBoost: boolean } {
  if (streak === 30) return { xp: XP_RULES.STREAK_30, grantBoost: true };
  if (streak === 7) return { xp: XP_RULES.STREAK_7, grantBoost: true };
  return { xp: 0, grantBoost: false };
}

/**
 * 세션 내 콤보 보너스. 정답 순서 배열을 훑어 연속 정답이 5·10에 도달할 때마다 보너스.
 * 오답을 만나면 연속 카운트를 0으로 리셋한다.
 */
export function comboBonusXp(correctFlags: boolean[]): number {
  let run = 0;
  let xp = 0;
  for (const ok of correctFlags) {
    if (ok) {
      run += 1;
      if (run === 5) xp += XP_RULES.COMBO_5;
      if (run === 10) xp += XP_RULES.COMBO_10;
    } else {
      run = 0;
    }
  }
  return xp;
}

/** 부스터가 지금 유효한가. */
export function isBoostActive(until: Date | null | undefined, now: Date): boolean {
  return !!until && now.getTime() < until.getTime();
}

/** 부스터 만료 시각 = "다음날 하루" 끝 = 로컬 기준 이틀 뒤 자정. */
export function boostExpiry(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + 2);
  return d;
}

/**
 * 취약 유형(세부과목) 판정 — 사용자의 과목별 정답률 중 하위 bottomRatio(기본 20%).
 *
 * - minSample: 표본이 이보다 적은 과목은 제외(1~2문제 과목이 취약으로 뽑히는 노이즈 방지).
 * - minSubjects: 비교 대상 과목이 이보다 적으면 '하위 20%'가 무의미하므로 빈 집합 반환
 *   (과목 하나뿐인 사용자가 항상 취약 보너스를 받는 퇴화 방지).
 * 정답률 오름차순으로 정렬해 상위(=낮은 정답률) ceil(N*bottomRatio)개를 취약으로 본다.
 */
export function weakSubjectIds(
  stats: { subjectId: string; total: number; correct: number }[],
  opts: { minSample?: number; bottomRatio?: number; minSubjects?: number } = {},
): Set<string> {
  const minSample = opts.minSample ?? 5;
  const bottomRatio = opts.bottomRatio ?? 0.2;
  const minSubjects = opts.minSubjects ?? 3;

  const eligible = stats
    .filter((s) => s.total >= minSample)
    .map((s) => ({ subjectId: s.subjectId, acc: s.correct / s.total }));
  if (eligible.length < minSubjects) return new Set();

  eligible.sort((a, b) => a.acc - b.acc);
  const count = Math.max(1, Math.ceil(eligible.length * bottomRatio));
  return new Set(eligible.slice(0, count).map((x) => x.subjectId));
}
