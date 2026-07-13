# 저자 리워드(출제자 보상) Implementation Plan

**Goal:** 콘텐츠 기여자(저자)에게 코인/EXP 보상. (1) 공개 문제집에 문항 발행 시 +20 EXP·+20 코인, **하루 최대 3회**까지만. (2) 내 문제집이 포크되면 원작자에게 +5~10 코인. (3) 내 문제가 누적 10회 풀리면 원작자에게 1회성 +20 코인.

**Architecture:** 방금 구축된 상점/코인 원장(`CoinHistory`, `User.coins`, `$transaction` 크레딧 패턴)을 재사용. 보상 상수는 `src/common/constants/shop.ts`에 추가. EXP는 기존 XP 지급 메커니즘(awardForSubmit이 쓰는 것과 동일)을 재사용. 트리거 3곳: `workbooks.service.ts`(발행·포크), `exam-sessions.service.ts`(10솔브 마일스톤, 증가 지점 2곳).

**Base:** 0f1bdc01 (상점 시스템 14태스크 완료 지점).

## Global Constraints
- 주석·메시지 **한국어**. class-validator DTO 필수(신규 요청 body가 있으면). 전역 JwtAuthGuard.
- `PrismaService` 전역 주입. 프로덕션 `prisma db push` — schema.prisma authoritative, 편집 후 `npm run prisma:generate`.
- 잔고/카운터 변경은 **원자적 `$transaction`**. 랜덤은 주입 가능한 `rng: () => number = Math.random`.
- 코인 크레딧 패턴은 상점 코드(`loot-boxes.service.ts` open, `shop.service.ts` purchase)와 동일하게: `tx.user.update({ data: { coins: { increment } } })` + `tx.coinHistory.create({ userId, amount, reason, referenceId, balanceAfter })`.
- 경로 alias `@/*` → `src/*`. 테스트 `npm test -- <조각>`.
- **코드리뷰·빌드는 각 태스크에서 실행하지 않음** — 전체 태스크 종료 후 컨트롤러가 whole-branch 리뷰 + `npm run build` 일괄 실행.

---

### Task A: 스키마 — enum 값 + User 캡 필드 + Question 플래그

**Files:** Modify `prisma/schema.prisma`

**Interfaces:** `CoinHistoryReason`에 `AUTHOR_PUBLISH`/`WORKBOOK_FORK`/`SOLVE_MILESTONE`; `User.authorRewardDate`/`authorRewardCount`; `Question.solveBonusAwarded`.

- [ ] Step 1: `enum CoinHistoryReason { BOX_OPEN PURCHASE }` → 뒤에 `AUTHOR_PUBLISH`, `WORKBOOK_FORK`, `SOLVE_MILESTONE` 3개 추가.
- [ ] Step 2: `model User`의 `hintFreeUsed` 줄 아래에:
```prisma
  // 저자 발행 보상 하루 캡(날짜 바뀌면 리셋). hintFreeDate/hintFreeUsed와 동일 패턴.
  authorRewardDate  DateTime? @map("author_reward_date") @db.Date
  authorRewardCount Int       @default(0) @map("author_reward_count")
```
- [ ] Step 3: `model Question`의 `correctSolvedCount` 줄 아래에:
```prisma
  // 누적 10솔브 1회성 저자 보너스(+20코인) 지급 여부. 임계 체크만으로는 매 풀이마다 재발동하므로 플래그로 최초 1회만.
  solveBonusAwarded  Boolean @default(false) @map("solve_bonus_awarded")
```
- [ ] Step 4: `npm run prisma:generate` — 에러 없이 생성 확인.
- [ ] Step 5: 커밋 `feat(rewards): 저자 리워드 스키마 — enum 값·발행캡·솔브플래그` (git add prisma/schema.prisma).

---

### Task B: 보상 규칙 상수 + 발행 캡 헬퍼 + XP reason

**Files:** Modify `src/common/constants/shop.ts`; Modify `src/common/constants/xp.ts` (XP_REASON에 AUTHOR_PUBLISH); Test `src/common/constants/rewards.spec.ts`

**Interfaces (shop.ts 끝에 추가):**
- `AUTHOR_PUBLISH_REWARD = { exp: 20, coins: 20 }`, `AUTHOR_PUBLISH_DAILY_CAP = 3`
- `resolveAuthorRewardQuota(rewardDate, rewardCount, today): { allow: boolean; newCount: number }` — hint-quota와 동형(날짜 리셋).
- `FORK_COIN_MIN = 5`, `FORK_COIN_MAX = 10`, `rollForkCoins(rng = Math.random): number` — [5,10] 균등 정수.
- `SOLVE_MILESTONE_THRESHOLD = 10`, `SOLVE_MILESTONE_COINS = 20`.

- [ ] Step 1: 실패 테스트 `src/common/constants/rewards.spec.ts`:
```ts
import {
  resolveAuthorRewardQuota, rollForkCoins,
  AUTHOR_PUBLISH_DAILY_CAP, SOLVE_MILESTONE_THRESHOLD,
} from '@/common/constants/shop';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('resolveAuthorRewardQuota', () => {
  it('오늘 0/3 → 허용, count 1', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-13'), 0, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
  it('날짜 바뀌면 카운트 리셋 → 허용', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-12'), 3, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
  it('오늘 3/3 → 차단, count 3 유지', () => {
    expect(resolveAuthorRewardQuota(d('2026-07-13'), 3, d('2026-07-13')))
      .toEqual({ allow: false, newCount: 3 });
  });
  it('rewardDate null → 허용', () => {
    expect(resolveAuthorRewardQuota(null, 0, d('2026-07-13')))
      .toEqual({ allow: true, newCount: 1 });
  });
});

describe('rollForkCoins', () => {
  it('[5,10] 경계', () => {
    expect(rollForkCoins(() => 0)).toBe(5);
    expect(rollForkCoins(() => 0.999)).toBe(10);
  });
});

describe('상수', () => {
  it('캡 3, 마일스톤 10', () => {
    expect(AUTHOR_PUBLISH_DAILY_CAP).toBe(3);
    expect(SOLVE_MILESTONE_THRESHOLD).toBe(10);
  });
});
```
- [ ] Step 2: `npm test -- rewards.spec` → FAIL.
- [ ] Step 3: 구현 — `shop.ts` 끝에 추가:
```ts
// ─── 저자 리워드(출제자 보상) 규칙 ───
export const AUTHOR_PUBLISH_REWARD = { exp: 20, coins: 20 } as const;
export const AUTHOR_PUBLISH_DAILY_CAP = 3;

function rewardDayNum(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** 공개 문제집 발행 보상 하루 캡. 날짜 바뀌면 카운트 리셋. */
export function resolveAuthorRewardQuota(
  rewardDate: Date | null | undefined,
  rewardCount: number,
  today: Date,
): { allow: boolean; newCount: number } {
  const sameDay = !!rewardDate && rewardDayNum(rewardDate) === rewardDayNum(today);
  const usedToday = sameDay ? rewardCount : 0;
  if (usedToday < AUTHOR_PUBLISH_DAILY_CAP) return { allow: true, newCount: usedToday + 1 };
  return { allow: false, newCount: AUTHOR_PUBLISH_DAILY_CAP };
}

export const FORK_COIN_MIN = 5;
export const FORK_COIN_MAX = 10;
/** 포크 보상 코인 [5,10] 균등 정수. */
export function rollForkCoins(rng: () => number = Math.random): number {
  return FORK_COIN_MIN + Math.floor(rng() * (FORK_COIN_MAX - FORK_COIN_MIN + 1));
}

export const SOLVE_MILESTONE_THRESHOLD = 10;
export const SOLVE_MILESTONE_COINS = 20;
```
`xp.ts`의 `XP_REASON` 객체에 `AUTHOR_PUBLISH: 'AUTHOR_PUBLISH'` 한 줄 추가(기존 스타일 그대로). 만약 `XP_REASON`이 없고 다른 이름이면 실제 이름에 맞춰 추가하고 리포트에 기록.
- [ ] Step 4: `npm test -- rewards.spec` → PASS. `npm test -- shop.spec` 회귀 확인(같은 파일).
- [ ] Step 5: 커밋 `feat(rewards): 발행캡·포크코인·솔브마일스톤 상수 + 헬퍼`.

---

### Task C: 공개 문제집 발행 보상 (workbooks.service)

**Files:** Modify `src/modules/workbooks/workbooks.service.ts`; Test `src/modules/workbooks/workbooks.author-reward.spec.ts`

**설계 결정(사람 확인 대기 중이나 취침으로 기본값 채택):** "공개 발행" = 문항이 PUBLIC 문제집의 일부가 되는 순간. 두 경로 모두에서 보상:
- `addQuestion()` — 대상 문제집이 **이미 PUBLIC**일 때, 추가되는 문항 저자(문항 `creatorId`)에게 발행 보상 1회(캡 소진).
- `update()`의 becomingPublic 전환 — 문제집이 PRIVATE→PUBLIC 될 때, 안의 각 문항에 대해 보상(문항 저자별, 캡까지). 캡 초과분은 무보상.
- 보상 대상은 **문항 저자(`Question.creatorId`)**. 캡·EXP·코인은 저자별 계정에 적용.

**Interfaces:** private 헬퍼 `awardPublishReward(tx, authorUserId, referenceId, now, rng?)` → 캡 확인 후 허용 시 `+20 코인`(coinHistory reason=`AUTHOR_PUBLISH`) + `+20 EXP`(기존 XP 지급 방식 재사용) + `user.authorRewardDate/Count` 갱신. 캡 초과면 아무것도 안 함. 반환 `{ rewarded: boolean }`.

- [ ] Step 1: 실패 테스트 — 헬퍼를 순수하게 테스트하기 위해 mock tx로 `awardPublishReward` 직접 호출:
```ts
import { WorkbooksService } from '@/modules/workbooks/workbooks.service';

function makeTx(over: any = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: null, authorRewardCount: 0 }),
      update: jest.fn().mockResolvedValue({ coins: 120 }),
    },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    xpHistory: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

describe('WorkbooksService.awardPublishReward', () => {
  it('캡 미달이면 코인+EXP 지급 + authorRewardCount 갱신', async () => {
    const tx = makeTx();
    const svc = new WorkbooksService({} as any);
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'AUTHOR_PUBLISH', amount: 20 }),
    }));
    expect(r.rewarded).toBe(true);
  });

  it('오늘 캡(3/3) 소진이면 미지급', async () => {
    const tx = makeTx({
      user: {
        findUnique: jest.fn().mockResolvedValue({ coins: 100, authorRewardDate: new Date('2026-07-13T00:00:00'), authorRewardCount: 3 }),
        update: jest.fn(),
      },
    });
    const svc = new WorkbooksService({} as any);
    const r = await (svc as any).awardPublishReward(tx, 'author1', 'wb1', new Date('2026-07-13T00:00:00'));
    expect(r.rewarded).toBe(false);
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
  });
});
```
(주의: `WorkbooksService` 생성자 인자가 여러 개면 mock을 맞춰 조정하고 리포트에 기록.)
- [ ] Step 2: `npm test -- workbooks.author-reward` → FAIL.
- [ ] Step 3: 구현 — `awardPublishReward` 헬퍼 작성. **EXP 지급은 실제 코드에서 awardForSubmit가 XP를 주는 방식을 먼저 읽고 동일 메커니즘 재사용**(공유 awarder가 있으면 그것, 없으면 `tx.user.update({ xp: increment })` + `tx.xpHistory.create({ reason: XP_REASON.AUTHOR_PUBLISH, amount: 20, ... })` 패턴 — 실제 User XP 필드명·XpHistory 필드명 확인). 레벨업/마일스톤 재계산 로직이 awardForSubmit에 있으면 그 부분도 고려해 리포트에 남길 것.
- [ ] Step 4: `addQuestion()`·`update()` 트리거 연결 — 각 서비스 메서드의 기존 `$transaction` 안에서, 해당 문항이 공개가 되는 조건일 때 `awardPublishReward` 호출. `addQuestion`은 대상 workbook.visibility가 'PUBLIC'일 때만. `update` becomingPublic 분기는 문제집 소속 문항을 순회하며 각 문항 저자에게 호출(캡은 헬퍼가 관리). 트랜잭션 경계·기존 반환 shape 유지.
- [ ] Step 5: `npm test -- workbooks.author-reward` → PASS. `npm test -- workbooks` 회귀. 커밋 `feat(rewards): 공개 문제집 발행 시 저자 +20EXP·+20코인(하루 3회)`.

---

### Task D: 문제집 포크 보상 (workbooks.service.fork)

**Files:** Modify `src/modules/workbooks/workbooks.service.ts`; Test `src/modules/workbooks/workbooks.fork-reward.spec.ts`

**Interfaces:** `fork()`의 기존 `$transaction`(원본 forkCount increment 하는 곳) 안에서, **원본 문제집 소유자(`Workbook.ownerId`)** 에게 `rollForkCoins()` 코인 지급(coinHistory reason=`WORKBOOK_FORK`, referenceId=새 fork workbook id). 포크한 사람이 원작자 본인이면(ownerId===forker) 무지급.

- [ ] Step 1: 실패 테스트 — fork 트랜잭션 후 원작자에게 코인 지급되는지. 실제 fork()가 크므로, 포크 보상 로직을 private 헬퍼 `awardForkReward(tx, ownerUserId, forkWorkbookId, rng?)`로 뽑아 순수 테스트:
```ts
import { WorkbooksService } from '@/modules/workbooks/workbooks.service';

describe('WorkbooksService.awardForkReward', () => {
  it('원작자에게 [5,10] 코인 + WORKBOOK_FORK 원장', async () => {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({ coins: 55 }) },
      coinHistory: { create: jest.fn().mockResolvedValue({}) },
    } as any;
    const svc = new WorkbooksService({} as any);
    await (svc as any).awardForkReward(tx, 'owner1', 'forkwb1', () => 0); // 5코인
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { coins: { increment: 5 } },
    }));
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'WORKBOOK_FORK', referenceId: 'forkwb1' }),
    }));
  });
});
```
- [ ] Step 2: `npm test -- workbooks.fork-reward` → FAIL.
- [ ] Step 3: 구현 — `awardForkReward` 헬퍼(coins increment + coinHistory.create, balanceAfter는 update 반환 coins). `fork()`의 기존 트랜잭션에서 `copy` 생성·`forkCount` increment 직후, `if (source.ownerId !== forkerUserId) await this.awardForkReward(tx, source.ownerId, copy.id, ...)`. 실제 변수명(source/원본 owner, forker userId, copy)에 맞춰 연결.
- [ ] Step 4: `npm test -- workbooks.fork-reward` → PASS. `npm test -- workbooks` 회귀. 커밋 `feat(rewards): 문제집 포크 시 원작자 +5~10코인`.

---

### Task E: 누적 10솔브 1회성 보너스 (exam-sessions)

**Files:** Modify `src/modules/exam-sessions/exam-sessions.service.ts`; Test `src/modules/exam-sessions/exam-sessions.solve-milestone.spec.ts`

**Interfaces:** private 헬퍼 `awardSolveMilestone(tx, questionId, rng?)` 아님 — 카운터 증가와 함께 판정이 필요하므로: `totalSolvedCount` increment 하는 두 지점(`:412-419` 제출, `:509-522` 자기채점)에서, increment 후 값이 `SOLVE_MILESTONE_THRESHOLD` 이상이고 `solveBonusAwarded===false`이면 문항 저자(`creatorId`)에게 `SOLVE_MILESTONE_COINS` 코인 지급 + `solveBonusAwarded=true` 세팅. 원자적. 테스트 가능하게 헬퍼 `maybeAwardSolveMilestone(tx, question, now)`로 분리(question={id, creatorId, totalSolvedCount(증가후), solveBonusAwarded}).

- [ ] Step 1: 실패 테스트:
```ts
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';

function makeTx() {
  return {
    user: { update: jest.fn().mockResolvedValue({ coins: 40 }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    question: { update: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe('ExamSessionsService.maybeAwardSolveMilestone', () => {
  const svc = new ExamSessionsService({} as any);
  it('증가후 10 도달 + 미지급 → 저자 +20코인, 플래그 set', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 10, solveBonusAwarded: false }, new Date());
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'SOLVE_MILESTONE', amount: 20, referenceId: 'q1' }),
    }));
    expect(tx.question.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { solveBonusAwarded: true },
    }));
    expect(r.awarded).toBe(true);
  });
  it('이미 지급(flag true) → 무지급', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 15, solveBonusAwarded: true }, new Date());
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
    expect(r.awarded).toBe(false);
  });
  it('아직 10 미만 → 무지급', async () => {
    const tx = makeTx();
    const r = await (svc as any).maybeAwardSolveMilestone(tx, { id: 'q1', creatorId: 'author1', totalSolvedCount: 9, solveBonusAwarded: false }, new Date());
    expect(r.awarded).toBe(false);
  });
});
```
- [ ] Step 2: `npm test -- exam-sessions.solve-milestone` → FAIL.
- [ ] Step 3: 구현 — `maybeAwardSolveMilestone` 헬퍼. balanceAfter는 user.update 반환 coins. 저자에게 지급(문항 creatorId). 자기 문제를 자기가 풀어 10 도달한 경우도 저자=푸는사람이면 지급(스펙상 저자 보상이므로 지급; 악용 방지 필요하면 별도 결정 — 리포트에 플래그).
- [ ] Step 4: 두 increment 지점 연결 — `totalSolvedCount` increment 하는 `question.update`가 이미 있으므로, 그 문항의 증가후 카운트·현재 solveBonusAwarded를 알아야 함. 기존 increment를 `select: { totalSolvedCount, solveBonusAwarded, creatorId }` 반환하도록 하거나 별도 조회 후 `maybeAwardSolveMilestone` 호출. 두 지점(제출·자기채점) 모두 적용. 실제 코드 구조에 맞춰 최소 변경으로 연결하고 리포트에 방식 기록.
- [ ] Step 5: `npm test -- exam-sessions.solve-milestone` → PASS. `npm test -- exam-sessions` 회귀. 커밋 `feat(rewards): 문제 누적 10솔브 시 저자 1회성 +20코인`.

---

## 최종(컨트롤러가 전체 태스크 후 일괄)
- whole-branch 코드리뷰(qidea-reviewer) — 상점 14태스크 + 저자리워드 5태스크 전체 diff.
- `npm run build`(nest) 타입에러 없음.
- `cd web && npx tsc --noEmit` (web build은 미커밋 리디자인이 있어 실패 가능 — 그 경우 내 코드 무관함을 구분해 보고).
