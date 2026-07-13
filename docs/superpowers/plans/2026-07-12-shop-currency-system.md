# 상점 · 코인 · 상자 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 문제 풀이 → 랜덤 상자 드롭 → 상자 개봉으로 코인 획득 → 상점에서 코인으로 아이템(XP 부스터·연속학습 보호권·힌트 토큰·코스메틱·실물 주먹밥 쿠폰) 구매.

**Architecture:** 백엔드 NestJS에 신규 `loot-boxes`·`shop` 모듈 추가, `exam-sessions`(상자 드롭·스트릭 보호권 소모·힌트 게이팅)·`me`(지갑) 확장. 상점 카탈로그·드롭 규칙은 `src/common/constants/shop.ts` 상수(단일 소스). 코인/상자/구매는 각각 원장 테이블로 감사. 프론트는 `/shop` 페이지 + 결과화면 상자 개봉 UI.

**Tech Stack:** NestJS 10, Prisma(MySQL, `db push`), BullMQ(무관), Next.js 14(web), TanStack Query, jest.

**Spec:** `docs/superpowers/specs/2026-07-12-shop-currency-system-design.md`

## Global Constraints

- 주석·사용자 메시지(검증 에러/예외)는 **한국어**.
- 모든 요청 body는 `class-validator` DTO 필수 — 전역 `ValidationPipe`가 `whitelist:true` + `forbidNonWhitelisted:true`.
- 인증은 전역 `JwtAuthGuard`. `@Roles`는 `@UseGuards(RolesGuard)`를 컨트롤러에 직접 붙여야 적용됨. 역할값: `UserRoleType.{CREATOR,CONSUMER,ADMIN}` (`@prisma/client`).
- `PrismaService`는 전역(`@Global() PrismaModule`) — 주입만 하면 됨(import 불필요).
- 프로덕션은 `prisma db push`(마이그레이션 아님). `schema.prisma`가 authoritative. 스키마 편집 후 `npm run prisma:generate` 필수.
- 경로 alias `@/*` → `src/*` (tsconfig + jest moduleNameMapper).
- 잔고 변경은 **원자적 `$transaction`** + 음수 방지 검증. 랜덤은 서버 `Math.random`(주입 가능하게).
- 백엔드 명령은 repo 루트에서. 테스트: `npm test -- <파일조각>`.
- 스키마 신규 enum은 기존 스타일(`enum Name { VALUE1 VALUE2 }`, bare, `@map` 없음).

---

# Phase 1 — 코인 + 상자 (독립 배포 가능)

### Task 1: Prisma 스키마 — enum·User 필드·신규 테이블

**Files:**
- Modify: `prisma/schema.prisma` (enum 블록 근처 `:29-63`, `model User` `:68-104`, 파일 끝에 신규 모델)

**Interfaces:**
- Produces: Prisma 모델 `LootBox`, `UserInventory`, `Purchase`, `CoinHistory`; enum `LootBoxTier`/`PurchaseStatus`/`CoinHistoryReason`; `User.coins`/`equippedTitle`/`nameColor`/`hintFreeDate`/`hintFreeUsed`.

- [ ] **Step 1: 기존 enum 블록 뒤에 신규 enum 추가**

`prisma/schema.prisma`의 enum 영역(마지막 enum `ExamSessionStatus` 뒤)에:
```prisma
enum LootBoxTier {
  COMMON
  RARE
  LEGENDARY
}

enum PurchaseStatus {
  PENDING
  FULFILLED
}

enum CoinHistoryReason {
  BOX_OPEN
  PURCHASE
}
```

- [ ] **Step 2: `model User`에 필드 + 역방향 관계 추가**

`xpBoostUntil` 줄 아래에 필드:
```prisma
  coins          Int       @default(0)
  equippedTitle  String?   @map("equipped_title") @db.VarChar(60)
  nameColor      String?   @map("name_color") @db.VarChar(20)
  // 힌트 하루 무료 소진 카운트(날짜 바뀌면 리셋). D-3 게이팅용.
  hintFreeDate   DateTime? @map("hint_free_date") @db.Date
  hintFreeUsed   Int       @default(0) @map("hint_free_used")
```
`milestones MilestoneAchievement[]` 아래에 관계:
```prisma
  lootBoxes    LootBox[]
  inventory    UserInventory[]
  purchases    Purchase[]
  coinHistory  CoinHistory[]
```

- [ ] **Step 3: 파일 끝(마지막 model 뒤)에 신규 모델 추가**

```prisma
model LootBox {
  id            String      @id @default(uuid()) @db.Char(36)
  userId        String      @map("user_id") @db.Char(36)
  tier          LootBoxTier
  examSessionId String?     @map("exam_session_id") @db.Char(36)
  rewardCoins   Int?        @map("reward_coins")
  createdAt     DateTime    @default(now()) @map("created_at")
  openedAt      DateTime?   @map("opened_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, openedAt])
  @@map("loot_boxes")
}

model UserInventory {
  userId   String @map("user_id") @db.Char(36)
  itemKey  String @map("item_key") @db.VarChar(50)
  quantity Int    @default(0)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, itemKey])
  @@map("user_inventory")
}

model Purchase {
  id        String         @id @default(uuid()) @db.Char(36)
  userId    String         @map("user_id") @db.Char(36)
  itemKey   String         @map("item_key") @db.VarChar(50)
  coinCost  Int            @map("coin_cost")
  status    PurchaseStatus @default(FULFILLED)
  note      String?        @db.VarChar(500)
  createdAt DateTime       @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([status])
  @@map("purchases")
}

model CoinHistory {
  id           String            @id @default(uuid()) @db.Char(36)
  userId       String            @map("user_id") @db.Char(36)
  amount       Int
  reason       CoinHistoryReason
  referenceId  String?           @map("reference_id") @db.Char(36)
  balanceAfter Int               @map("balance_after")
  createdAt    DateTime          @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@map("coin_history")
}
```

- [ ] **Step 4: 클라이언트 재생성 + 검증**

Run: `npm run prisma:generate`
Expected: 에러 없이 생성. `Prisma.ModelName` 에 새 모델 4개 포함.

- [ ] **Step 5: 커밋**

```bash
git add prisma/schema.prisma
git commit -m "feat(shop): 코인·상자·구매·인벤토리 스키마 + enum"
```

---

### Task 2: 상자 드롭 규칙 상수 (`shop.ts` 1부)

**Files:**
- Create: `src/common/constants/shop.ts`
- Test: `src/common/constants/shop.spec.ts`

**Interfaces:**
- Produces:
  - `type BoxTier = 'COMMON'|'RARE'|'LEGENDARY'`
  - `rollBoxTier(scorePercent: number, rng?: () => number): BoxTier | null` — 드롭 실패 시 null.
  - `rollCoins(tier: BoxTier, rng?: () => number): number`

- [ ] **Step 1: 실패 테스트 작성**

`src/common/constants/shop.spec.ts`:
```ts
import { rollBoxTier, rollCoins } from '@/common/constants/shop';

describe('rollBoxTier', () => {
  it('rng가 드롭확률 이상이면 null(미드롭)', () => {
    // BOX_DROP.CHANCE=0.6 → rng 0.9면 미드롭
    expect(rollBoxTier(100, () => 0.9)).toBeNull();
  });

  it('드롭 성공 시 가중치 첫 구간이면 COMMON', () => {
    // rng[0]=0.1(<0.6 드롭), rng[1]=0.0 → 누적 가중 첫 구간
    const seq = [0.1, 0.0];
    let i = 0;
    expect(rollBoxTier(30, () => seq[i++])).toBe('COMMON');
  });

  it('정답률 높으면 LEGENDARY 도달 가능(rng 끝값)', () => {
    const seq = [0.0, 0.999];
    let i = 0;
    expect(rollBoxTier(90, () => seq[i++])).toBe('LEGENDARY');
  });
});

describe('rollCoins', () => {
  it('COMMON 범위 [10,30] 경계', () => {
    expect(rollCoins('COMMON', () => 0)).toBe(10);
    expect(rollCoins('COMMON', () => 0.999)).toBe(30);
  });
  it('LEGENDARY 범위 [120,250]', () => {
    expect(rollCoins('LEGENDARY', () => 0)).toBe(120);
    expect(rollCoins('LEGENDARY', () => 0.999)).toBe(250);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- shop.spec`
Expected: FAIL — `rollBoxTier`/`rollCoins` 미정의.

- [ ] **Step 3: 구현**

`src/common/constants/shop.ts`:
```ts
// 상점·상자 시스템 단일 소스(가격·드롭률·아이템 효과). xp.ts/question.ts 패턴을 따른다.

export const BOX_TIERS = ['COMMON', 'RARE', 'LEGENDARY'] as const;
export type BoxTier = (typeof BOX_TIERS)[number];

/** 제출당 상자 드롭 확률. */
export const BOX_DROP_CHANCE = 0.6;

/** 정답률(0~100)별 등급 가중치. 높을수록 상위 등급↑. */
export function tierWeights(scorePercent: number): Record<BoxTier, number> {
  if (scorePercent >= 80) return { COMMON: 40, RARE: 45, LEGENDARY: 15 };
  if (scorePercent >= 50) return { COMMON: 60, RARE: 33, LEGENDARY: 7 };
  return { COMMON: 80, RARE: 18, LEGENDARY: 2 };
}

/** 등급별 코인 범위(포함). */
export const COIN_RANGE: Record<BoxTier, readonly [number, number]> = {
  COMMON: [10, 30],
  RARE: [40, 80],
  LEGENDARY: [120, 250],
};

/** 드롭 판정 + 등급 롤. 미드롭이면 null. rng는 [0,1). */
export function rollBoxTier(
  scorePercent: number,
  rng: () => number = Math.random,
): BoxTier | null {
  if (rng() >= BOX_DROP_CHANCE) return null;
  const weights = tierWeights(scorePercent);
  const total = BOX_TIERS.reduce((s, t) => s + weights[t], 0);
  let roll = rng() * total;
  for (const t of BOX_TIERS) {
    roll -= weights[t];
    if (roll < 0) return t;
  }
  return 'LEGENDARY'; // 부동소수 잔차 방어
}

/** 등급 범위 내 균등 정수 코인. */
export function rollCoins(tier: BoxTier, rng: () => number = Math.random): number {
  const [lo, hi] = COIN_RANGE[tier];
  return lo + Math.floor(rng() * (hi - lo + 1));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- shop.spec`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/common/constants/shop.ts src/common/constants/shop.spec.ts
git commit -m "feat(shop): 상자 드롭·코인 롤 규칙 상수"
```

---

### Task 3: 세션 제출 시 상자 드롭

**Files:**
- Modify: `src/modules/exam-sessions/exam-sessions.service.ts` (`submit` tx `:353-406`, 반환 `:408-418`)
- Test: `src/modules/exam-sessions/exam-sessions.box-drop.spec.ts`

**Interfaces:**
- Consumes: `rollBoxTier` (Task 2).
- Produces: `submit()` 반환에 `box: { id: string; tier: BoxTier } | null` 추가. `LootBox` 행(미개봉) 생성.

- [ ] **Step 1: 실패 테스트**

`exam-sessions.box-drop.spec.ts` — `awardForSubmit` 뒤 드롭 로직을 순수하게 뽑아 테스트하기 위해 헬퍼 `maybeDropBox(tx, userId, scorePercent, examSessionId, rng)`를 만들고 그걸 테스트:
```ts
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';

describe('maybeDropBox', () => {
  it('드롭 성공 시 lootBox.create 호출하고 {id,tier} 반환', async () => {
    const created = { id: 'box-1', tier: 'RARE' };
    const tx = { lootBox: { create: jest.fn().mockResolvedValue(created) } } as any;
    const svc = new ExamSessionsService({} as any);
    const box = await (svc as any).maybeDropBox(tx, 'u1', 60, 's1', () => 0.0);
    expect(tx.lootBox.create).toHaveBeenCalled();
    expect(box).toEqual({ id: 'box-1', tier: expect.any(String) });
  });

  it('미드롭이면 create 미호출·null 반환', async () => {
    const tx = { lootBox: { create: jest.fn() } } as any;
    const svc = new ExamSessionsService({} as any);
    const box = await (svc as any).maybeDropBox(tx, 'u1', 60, 's1', () => 0.9);
    expect(tx.lootBox.create).not.toHaveBeenCalled();
    expect(box).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- exam-sessions.box-drop`
Expected: FAIL — `maybeDropBox` 미정의.

- [ ] **Step 3: 구현 — 헬퍼 + submit 통합**

import 추가(파일 상단):
```ts
import { rollBoxTier, type BoxTier } from '@/common/constants/shop';
```
`awardForSubmit` 근처에 private 헬퍼:
```ts
/** 제출 후 상자 드롭 롤. 히트 시 미개봉 LootBox 생성. 코인은 개봉 때 롤. */
private async maybeDropBox(
  tx: Prisma.TransactionClient,
  userId: string,
  scorePercent: number,
  examSessionId: string,
  rng: () => number = Math.random,
): Promise<{ id: string; tier: BoxTier } | null> {
  const tier = rollBoxTier(scorePercent, rng);
  if (!tier) return null;
  const box = await tx.lootBox.create({
    data: { userId, tier, examSessionId },
    select: { id: true, tier: true },
  });
  return { id: box.id, tier: box.tier as BoxTier };
}
```
`submit`의 트랜잭션에서 `awardForSubmit` 반환을 받아 드롭 후 함께 반환. `:402-406` 교체:
```ts
      const perCorrectXp = session.isReview ? XP_RULES.REVIEW_CORRECT : XP_RULES.CORRECT;
      const reward = await this.awardForSubmit(tx, userId, correct, correctFlags, now, perCorrectXp, weakCorrect, id);
      const box = await this.maybeDropBox(tx, userId, scorePercent, id);
      return { reward, box };
    });

    return {
      id, status: 'SUBMITTED', total, answered, correct, scorePercent, durationSec,
      reward: reward.reward,
      box: reward.box,
    };
```
(트랜잭션 반환 변수명이 `reward`였으므로 위처럼 `{ reward, box }` 객체로 바꾸고 바깥에서 분해.)

- [ ] **Step 4: 통과 확인**

Run: `npm test -- exam-sessions.box-drop`
Expected: PASS. 이어서 `npm test -- exam-sessions` 로 기존 스펙 회귀 없음 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/modules/exam-sessions/exam-sessions.service.ts src/modules/exam-sessions/exam-sessions.box-drop.spec.ts
git commit -m "feat(shop): 세션 제출 시 상자 랜덤 드롭"
```

---

### Task 4: `loot-boxes` 모듈 — 목록 + 원자적 개봉

**Files:**
- Create: `src/modules/loot-boxes/loot-boxes.module.ts`, `loot-boxes.controller.ts`, `loot-boxes.service.ts`
- Modify: `src/app.module.ts` (imports에 `LootBoxesModule`)
- Test: `src/modules/loot-boxes/loot-boxes.service.spec.ts`

**Interfaces:**
- Consumes: `rollCoins`, `PrismaService`, `CurrentUserPayload`.
- Produces:
  - `GET /loot-boxes` → 미개봉 상자 `[{ id, tier, createdAt }]`
  - `POST /loot-boxes/:id/open` → `{ id, tier, rewardCoins, coins }` (coins=갱신 잔고). 이미 개봉/타인 소유면 `ConflictException`.

- [ ] **Step 1: 실패 테스트 — 원자성·이중개봉·크레딧**

`loot-boxes.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { LootBoxesService } from '@/modules/loot-boxes/loot-boxes.service';

function makeTx(over: any = {}) {
  return {
    lootBox: {
      findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'u1', tier: 'COMMON', openedAt: null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { update: jest.fn().mockResolvedValue({ coins: 25 }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    ...over,
  };
}

function makeService(tx: any) {
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) } as unknown as PrismaService;
  return new LootBoxesService(prisma);
}

describe('LootBoxesService.open', () => {
  it('개봉 성공: 코인 크레딧 + CoinHistory(referenceId=box) 기록', async () => {
    const tx = makeTx();
    const svc = makeService(tx);
    const res = await svc.open('b1', 'u1', () => 0.5); // COMMON [10,30] → 20
    expect(tx.lootBox.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', userId: 'u1', openedAt: null },
      data: expect.objectContaining({ rewardCoins: expect.any(Number) }),
    });
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { coins: { increment: expect.any(Number) } },
    }));
    expect(tx.coinHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'BOX_OPEN', referenceId: 'b1' }),
    }));
    expect(res.coins).toBe(25);
  });

  it('이미 개봉된 상자(updateMany count=0)면 ConflictException, 크레딧 안 함', async () => {
    const tx = makeTx({
      lootBox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'u1', tier: 'COMMON', openedAt: new Date() }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = makeService(tx);
    await expect(svc.open('b1', 'u1', () => 0.5)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('타인 소유 상자면 ConflictException', async () => {
    const tx = makeTx({
      lootBox: {
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', userId: 'other', tier: 'COMMON', openedAt: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    });
    const svc = makeService(tx);
    await expect(svc.open('b1', 'u1', () => 0.5)).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- loot-boxes.service`
Expected: FAIL — 모듈/서비스 미존재.

- [ ] **Step 3: 구현 — service**

`src/modules/loot-boxes/loot-boxes.service.ts`:
```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { rollCoins, type BoxTier } from '@/common/constants/shop';

@Injectable()
export class LootBoxesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 미개봉 상자 목록(최신순). */
  async listUnopened(userId: string) {
    return this.prisma.lootBox.findMany({
      where: { userId, openedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tier: true, createdAt: true },
    });
  }

  /**
   * 상자 개봉. openedAt IS NULL 가드로 동시 이중개봉을 원자적으로 차단한다.
   * updateMany count===0 이면 이미 열렸거나 내 것이 아님 → Conflict, 코인 크레딧 안 함.
   */
  async open(boxId: string, userId: string, rng: () => number = Math.random) {
    return this.prisma.$transaction(async (tx) => {
      const box = await tx.lootBox.findUnique({
        where: { id: boxId },
        select: { id: true, userId: true, tier: true, openedAt: true },
      });
      if (!box || box.userId !== userId || box.openedAt) {
        throw new ConflictException('이미 개봉했거나 존재하지 않는 상자입니다.');
      }
      const reward = rollCoins(box.tier as BoxTier, rng);
      const now = new Date();
      const upd = await tx.lootBox.updateMany({
        where: { id: boxId, userId, openedAt: null },
        data: { openedAt: now, rewardCoins: reward },
      });
      if (upd.count === 0) {
        throw new ConflictException('이미 개봉된 상자입니다.');
      }
      const user = await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: reward } },
        select: { coins: true },
      });
      await tx.coinHistory.create({
        data: {
          userId, amount: reward, reason: 'BOX_OPEN',
          referenceId: boxId, balanceAfter: user.coins,
        },
      });
      return { id: boxId, tier: box.tier as BoxTier, rewardCoins: reward, coins: user.coins };
    });
  }
}
```

- [ ] **Step 4: 구현 — controller + module + app.module 등록**

`src/modules/loot-boxes/loot-boxes.controller.ts`:
```ts
import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { LootBoxesService } from './loot-boxes.service';

@ApiTags('loot-boxes')
@ApiBearerAuth()
@Controller('loot-boxes')
export class LootBoxesController {
  constructor(private readonly service: LootBoxesService) {}

  @Get()
  @ApiOperation({ summary: '내 미개봉 상자 목록' })
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listUnopened(user.id);
  }

  @Post(':id/open')
  @ApiOperation({ summary: '상자 개봉 (코인 획득)' })
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.open(id, user.id);
  }
}
```
`src/modules/loot-boxes/loot-boxes.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { LootBoxesController } from './loot-boxes.controller';
import { LootBoxesService } from './loot-boxes.service';

@Module({ controllers: [LootBoxesController], providers: [LootBoxesService] })
export class LootBoxesModule {}
```
`app.module.ts` imports 배열에 `LootBoxesModule` 추가(+ import 라인).

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test -- loot-boxes.service`
Expected: PASS.
```bash
git add src/modules/loot-boxes src/app.module.ts
git commit -m "feat(shop): loot-boxes 모듈 — 목록 + 원자적 개봉"
```

---

### Task 5: 지갑 조회 (`me` 확장)

**Files:**
- Modify: `src/modules/me/me.service.ts` (신규 `wallet`), `src/modules/me/me.controller.ts` (신규 라우트)
- Test: `src/modules/me/me.wallet.spec.ts`

**Interfaces:**
- Produces: `GET /me/wallet` → `{ coins, xpBoostUntil, inventory: { STREAK_SHIELD: number, HINT_TOKEN: number }, cosmetics: { owned: string[], equippedTitle, nameColor }, unopenedBoxCount }`

- [ ] **Step 1: 실패 테스트**

`me.wallet.spec.ts`:
```ts
import { PrismaService } from '@/prisma/prisma.service';
import { MeService } from '@/modules/me/me.service';

function makeService() {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({
      coins: 120, xpBoostUntil: null, equippedTitle: null, nameColor: null,
    }) },
    userInventory: { findMany: jest.fn().mockResolvedValue([
      { itemKey: 'STREAK_SHIELD', quantity: 2 },
      { itemKey: 'COSMETIC_TITLE_MASTER', quantity: 1 },
    ]) },
    lootBox: { count: jest.fn().mockResolvedValue(3) },
  } as unknown as PrismaService;
  return new MeService(prisma);
}

describe('MeService.wallet', () => {
  it('코인·인벤토리·미개봉 상자수를 합쳐 반환', async () => {
    const w = await makeService().wallet('u1');
    expect(w.coins).toBe(120);
    expect(w.inventory.STREAK_SHIELD).toBe(2);
    expect(w.inventory.HINT_TOKEN).toBe(0);
    expect(w.cosmetics.owned).toContain('COSMETIC_TITLE_MASTER');
    expect(w.unopenedBoxCount).toBe(3);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- me.wallet` → FAIL(`wallet` 미정의).

- [ ] **Step 3: 구현** — `me.service.ts`에:
```ts
async wallet(userId: string) {
  const [user, inv, unopenedBoxCount] = await Promise.all([
    this.prisma.user.findUnique({
      where: { id: userId },
      select: { coins: true, xpBoostUntil: true, equippedTitle: true, nameColor: true },
    }),
    this.prisma.userInventory.findMany({
      where: { userId },
      select: { itemKey: true, quantity: true },
    }),
    this.prisma.lootBox.count({ where: { userId, openedAt: null } }),
  ]);
  if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
  const qty = (k: string) => inv.find((i) => i.itemKey === k)?.quantity ?? 0;
  return {
    coins: user.coins,
    xpBoostUntil: user.xpBoostUntil,
    inventory: { STREAK_SHIELD: qty('STREAK_SHIELD'), HINT_TOKEN: qty('HINT_TOKEN') },
    cosmetics: {
      owned: inv.filter((i) => i.itemKey.startsWith('COSMETIC_') && i.quantity > 0).map((i) => i.itemKey),
      equippedTitle: user.equippedTitle,
      nameColor: user.nameColor,
    },
    unopenedBoxCount,
  };
}
```
(`NotFoundException` import 이미 있음 — `milestones`가 사용 중.)
`me.controller.ts`에 라우트:
```ts
@Get('wallet')
@ApiOperation({ summary: '내 지갑(코인·인벤토리·상자수)' })
wallet(@CurrentUser() user: CurrentUserPayload) {
  return this.service.wallet(user.id);
}
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm test -- me.wallet` → PASS.
```bash
git add src/modules/me/me.service.ts src/modules/me/me.controller.ts src/modules/me/me.wallet.spec.ts
git commit -m "feat(shop): GET /me/wallet 지갑 조회"
```

**✅ Phase 1 종료** — 문제 풀면 상자 드롭·개봉으로 코인 획득·지갑 확인까지 동작(상점 없이도 검증 가능).

---

# Phase 2 — 상점 + 아이템 효과

### Task 6: 상점 카탈로그 상수 (`shop.ts` 2부)

**Files:**
- Modify: `src/common/constants/shop.ts`
- Test: `src/common/constants/shop.catalog.spec.ts`

**Interfaces:**
- Produces:
  - `type ShopItemKey`, `SHOP_ITEMS: Record<ShopItemKey, { name; price; kind; effect }>` 및 `getShopItem(key): item | undefined`.
  - `kind`: `'BOOST'|'CONSUMABLE'|'COSMETIC'|'PHYSICAL'`. `effect`: 타입별 파라미터(부스터 시간/인벤토리 키/쿠폰 등).

- [ ] **Step 1: 실패 테스트**
```ts
import { SHOP_ITEMS, getShopItem } from '@/common/constants/shop';

describe('SHOP_ITEMS', () => {
  it('주먹밥 쿠폰은 7777코인 PHYSICAL', () => {
    expect(SHOP_ITEMS.RICEBALL_COUPON.price).toBe(7777);
    expect(SHOP_ITEMS.RICEBALL_COUPON.kind).toBe('PHYSICAL');
  });
  it('XP 부스터는 100코인 BOOST', () => {
    expect(SHOP_ITEMS.XP_BOOST.price).toBe(100);
    expect(SHOP_ITEMS.XP_BOOST.kind).toBe('BOOST');
  });
  it('getShopItem 알 수 없는 키는 undefined', () => {
    expect(getShopItem('NOPE' as any)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- shop.catalog` → FAIL.

- [ ] **Step 3: 구현** — `shop.ts`에 추가:
```ts
export type ShopItemKind = 'BOOST' | 'CONSUMABLE' | 'COSMETIC' | 'PHYSICAL';

type BoostEffect = { type: 'BOOST'; hours: number };
type ConsumableEffect = { type: 'CONSUMABLE'; inventoryKey: 'STREAK_SHIELD' | 'HINT_TOKEN' };
type CosmeticEffect = { type: 'COSMETIC'; field: 'equippedTitle' | 'nameColor'; value: string };
type PhysicalEffect = { type: 'PHYSICAL' };
type ShopEffect = BoostEffect | ConsumableEffect | CosmeticEffect | PhysicalEffect;

export interface ShopItem {
  name: string;
  price: number;
  kind: ShopItemKind;
  effect: ShopEffect;
}

export const SHOP_ITEMS = {
  XP_BOOST:        { name: 'XP 부스터',       price: 100,  kind: 'BOOST',      effect: { type: 'BOOST', hours: 24 } },
  XP_BOOST_LARGE:  { name: '대형 XP 부스터',  price: 300,  kind: 'BOOST',      effect: { type: 'BOOST', hours: 72 } },
  STREAK_SHIELD:   { name: '연속학습 보호권', price: 250,  kind: 'CONSUMABLE', effect: { type: 'CONSUMABLE', inventoryKey: 'STREAK_SHIELD' } },
  HINT_TOKEN:      { name: '힌트 토큰',       price: 80,   kind: 'CONSUMABLE', effect: { type: 'CONSUMABLE', inventoryKey: 'HINT_TOKEN' } },
  COSMETIC_TITLE_MASTER:    { name: '칭호: 문제의 지배자', price: 150, kind: 'COSMETIC', effect: { type: 'COSMETIC', field: 'equippedTitle', value: '문제의 지배자' } },
  COSMETIC_NAMECOLOR_GOLD:  { name: '닉네임 색: 골드',     price: 200, kind: 'COSMETIC', effect: { type: 'COSMETIC', field: 'nameColor', value: '#E9B949' } },
  RICEBALL_COUPON: { name: '배불리주먹밥 쿠폰(실물)', price: 7777, kind: 'PHYSICAL', effect: { type: 'PHYSICAL' } },
} as const satisfies Record<string, ShopItem>;

export type ShopItemKey = keyof typeof SHOP_ITEMS;

export function getShopItem(key: ShopItemKey): ShopItem | undefined {
  return SHOP_ITEMS[key];
}

/** 대형 부스터용 시간 단위 만료(기존 boostExpiry는 날짜 단위). */
export function boostExpiryHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}

/** 힌트 하루 무료 횟수. */
export const HINT_FREE_PER_DAY = 3;
```

- [ ] **Step 4: 통과 확인 + 커밋**

Run: `npm test -- shop.catalog` → PASS.
```bash
git add src/common/constants/shop.ts src/common/constants/shop.catalog.spec.ts
git commit -m "feat(shop): 상점 카탈로그 상수 + 아이템 효과 타입"
```

---

### Task 7: `shop` 모듈 — 카탈로그 + 구매(효과 디스패치)

**Files:**
- Create: `src/modules/shop/shop.module.ts`, `shop.controller.ts`, `shop.service.ts`, `dto/purchase.dto.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/shop/shop.service.spec.ts`

**Interfaces:**
- Consumes: `SHOP_ITEMS`, `getShopItem`, `boostExpiryHours`, `PrismaService`.
- Produces:
  - `GET /shop/items` → `SHOP_ITEMS`를 배열로.
  - `POST /shop/purchase { itemKey }` → `{ itemKey, coins, status }`. 잔고 부족 시 `BadRequestException`, 없는 키 `NotFoundException`.
  - service `purchase(userId, itemKey)` — 원자적: 잔고검증·차감·효과적용·`Purchase`+`CoinHistory`.

- [ ] **Step 1: 실패 테스트 — 잔고검증·차감·효과·음수거부**
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ShopService } from '@/modules/shop/shop.service';

function makeTx(coins: number) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins }),
      update: jest.fn().mockResolvedValue({ coins: coins }),
    },
    userInventory: { upsert: jest.fn().mockResolvedValue({}) },
    purchase: { create: jest.fn().mockResolvedValue({ id: 'p1' }) },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
  };
}
function makeService(tx: any) {
  const prisma = { $transaction: jest.fn((cb: any) => cb(tx)) } as unknown as PrismaService;
  return new ShopService(prisma);
}

describe('ShopService.purchase', () => {
  it('잔고 부족이면 BadRequest, 차감 안 함', async () => {
    const tx = makeTx(50); // XP_BOOST 100
    await expect(makeService(tx).purchase('u1', 'XP_BOOST')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('없는 itemKey면 NotFound', async () => {
    const tx = makeTx(9999);
    await expect(makeService(tx).purchase('u1', 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('CONSUMABLE 구매: 코인 차감 + 인벤토리 upsert + Purchase(FULFILLED)', async () => {
    const tx = makeTx(500);
    await makeService(tx).purchase('u1', 'STREAK_SHIELD'); // 250
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { coins: { decrement: 250 } },
    }));
    expect(tx.userInventory.upsert).toHaveBeenCalled();
    expect(tx.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ itemKey: 'STREAK_SHIELD', status: 'FULFILLED' }),
    }));
  });

  it('PHYSICAL(쿠폰) 구매: Purchase status=PENDING', async () => {
    const tx = makeTx(9999);
    await makeService(tx).purchase('u1', 'RICEBALL_COUPON'); // 7777
    expect(tx.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING' }),
    }));
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- shop.service` → FAIL.

- [ ] **Step 3: 구현 — service (효과 디스패치)**

`src/modules/shop/shop.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  SHOP_ITEMS, getShopItem, boostExpiryHours, type ShopItemKey,
} from '@/common/constants/shop';

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  listItems() {
    return Object.entries(SHOP_ITEMS).map(([key, v]) => ({
      key, name: v.name, price: v.price, kind: v.kind,
    }));
  }

  /** 아이템 구매. 원자적: 잔고검증 → 차감 → 효과적용 → Purchase + CoinHistory. */
  async purchase(userId: string, itemKey: string) {
    const item = getShopItem(itemKey as ShopItemKey);
    if (!item) throw new NotFoundException('존재하지 않는 상품입니다.');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { coins: true } });
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
      if (user.coins < item.price) throw new BadRequestException('코인이 부족합니다.');

      const now = new Date();
      const status = item.kind === 'PHYSICAL' ? 'PENDING' : 'FULFILLED';

      // 1) 코인 차감
      const updated = await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: item.price } },
        select: { coins: true },
      });

      // 2) 효과 적용(부스터/인벤토리/코스메틱). PHYSICAL은 효과 없음(관리자 배송).
      const eff = item.effect;
      if (eff.type === 'BOOST') {
        await tx.user.update({
          where: { id: userId },
          data: { xpBoostUntil: boostExpiryHours(now, eff.hours) },
        });
      } else if (eff.type === 'CONSUMABLE') {
        await tx.userInventory.upsert({
          where: { userId_itemKey: { userId, itemKey: eff.inventoryKey } },
          create: { userId, itemKey: eff.inventoryKey, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
      } else if (eff.type === 'COSMETIC') {
        await tx.userInventory.upsert({
          where: { userId_itemKey: { userId, itemKey } },
          create: { userId, itemKey, quantity: 1 },
          update: { quantity: 1 },
        });
      }

      // 3) 구매 원장 + 코인 원장
      const purchase = await tx.purchase.create({
        data: { userId, itemKey, coinCost: item.price, status },
        select: { id: true },
      });
      await tx.coinHistory.create({
        data: {
          userId, amount: -item.price, reason: 'PURCHASE',
          referenceId: purchase.id, balanceAfter: updated.coins,
        },
      });

      return { itemKey, coins: updated.coins, status };
    });
  }
}
```

- [ ] **Step 4: 구현 — DTO + controller + module + 등록**

`dto/purchase.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SHOP_ITEMS } from '@/common/constants/shop';

const KEYS = Object.keys(SHOP_ITEMS);

export class PurchaseDto {
  @ApiProperty({ enum: KEYS, description: '구매할 상품 키' })
  @IsIn(KEYS)
  itemKey!: string;
}
```
`shop.controller.ts`:
```ts
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import type { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { ShopService } from './shop.service';
import { PurchaseDto } from './dto/purchase.dto';

@ApiTags('shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly service: ShopService) {}

  @Get('items')
  @Public()
  @ApiOperation({ summary: '상점 카탈로그' })
  items() {
    return this.service.listItems();
  }

  @Post('purchase')
  @ApiBearerAuth()
  @ApiOperation({ summary: '아이템 구매' })
  purchase(@CurrentUser() user: CurrentUserPayload, @Body() dto: PurchaseDto) {
    return this.service.purchase(user.id, dto.itemKey);
  }
}
```
`shop.module.ts`: `@Module({ controllers: [ShopController], providers: [ShopService] })`. `app.module.ts`에 `ShopModule` 등록.

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test -- shop.service` → PASS.
```bash
git add src/modules/shop src/app.module.ts
git commit -m "feat(shop): shop 모듈 — 카탈로그 + 구매(효과 디스패치)"
```

---

### Task 8: 연속학습 보호권 소모 (`computeStreak` 확장)

**Files:**
- Modify: `src/common/constants/xp.ts` (`computeStreak` `:189-199`)
- Modify: `src/modules/exam-sessions/exam-sessions.service.ts` (`awardForSubmit` `:632`, 인벤토리 조회·소모)
- Test: `src/common/constants/xp.streak-shield.spec.ts`

**Interfaces:**
- Produces: `computeStreak(lastActive, currentStreak, today, shieldCount=0)` → `{ currentStreak, counted, shieldConsumed }`. 기존 호출부(인자 3개)는 `shieldConsumed:false`로 하위호환.

- [ ] **Step 1: 실패 테스트**
```ts
import { computeStreak } from '@/common/constants/xp';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('computeStreak + shield', () => {
  it('하루 결석 + shield 있으면 스트릭 유지·소모', () => {
    // 마지막 학습 7/10, 오늘 7/12 (하루 공백), shield 1
    const r = computeStreak(d('2026-07-10'), 5, d('2026-07-12'), 1);
    expect(r.currentStreak).toBe(6);       // 유지+오늘
    expect(r.counted).toBe(true);
    expect(r.shieldConsumed).toBe(true);
  });

  it('하루 결석 + shield 없으면 리셋', () => {
    const r = computeStreak(d('2026-07-10'), 5, d('2026-07-12'), 0);
    expect(r.currentStreak).toBe(1);
    expect(r.shieldConsumed).toBe(false);
  });

  it('연속(어제 학습)이면 shield 소모 안 함', () => {
    const r = computeStreak(d('2026-07-11'), 5, d('2026-07-12'), 3);
    expect(r.currentStreak).toBe(6);
    expect(r.shieldConsumed).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- xp.streak-shield` → FAIL.

- [ ] **Step 3: 구현** — `xp.ts` `computeStreak` 교체:
```ts
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
```

- [ ] **Step 4: `awardForSubmit`에서 shield 조회·소모**

`awardForSubmit` `:632` 근처. 유저 조회에 인벤토리 shield 수량이 필요 → shield 조회 추가하고 `computeStreak` 호출을 4-인자로:
```ts
    const shield = await tx.userInventory.findUnique({
      where: { userId_itemKey: { userId, itemKey: 'STREAK_SHIELD' } },
      select: { quantity: true },
    });
    const st = computeStreak(user.lastActiveDate, user.currentStreak, now, shield?.quantity ?? 0);
```
그리고 `tx.user.update` 뒤에 소모 반영:
```ts
    if (st.shieldConsumed) {
      await tx.userInventory.update({
        where: { userId_itemKey: { userId, itemKey: 'STREAK_SHIELD' } },
        data: { quantity: { decrement: 1 } },
      });
    }
```

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test -- xp.streak-shield` 이어서 `npm test -- exam-sessions` (회귀).
Expected: PASS. (기존 `computeStreak` 3-인자 호출은 `shieldConsumed` 무시로 정상 동작.)
```bash
git add src/common/constants/xp.ts src/modules/exam-sessions/exam-sessions.service.ts src/common/constants/xp.streak-shield.spec.ts
git commit -m "feat(shop): 연속학습 보호권 — 하루 결석 자동 방어"
```

---

### Task 9: 힌트 게이팅 (하루 무료 3회 + 힌트 토큰)

**Files:**
- Modify: `src/modules/exam-sessions/exam-sessions.service.ts` (`revealHint` `:258-285`)
- Test: `src/modules/exam-sessions/exam-sessions.hint-gate.spec.ts`

**Interfaces:**
- Consumes: `HINT_FREE_PER_DAY`, `dayIndex`(xp.ts — export 필요 시 추가).
- Produces: `revealHint` — 무료 3회 초과 시 `HINT_TOKEN` 1개 소모, 토큰 없으면 `ConflictException`. 성공 시 기존 `{ sessionQuestionId, hint, isHintUsed, hintUsedAt }` 반환.

> 주의: `dayIndex`가 xp.ts에서 `function`(비export)이면 `export function dayIndex`로 승격.

- [ ] **Step 1: 실패 테스트** — `revealHint`의 게이팅 로직을 순수 헬퍼 `resolveHintQuota(hintFreeDate, hintFreeUsed, tokenQty, today)` → `{ allow, useToken, newFreeUsed }`로 분리해 테스트:
```ts
import { resolveHintQuota } from '@/modules/exam-sessions/hint-quota';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('resolveHintQuota', () => {
  it('오늘 무료 0/3 → 무료 사용', () => {
    expect(resolveHintQuota(d('2026-07-12'), 0, 0, d('2026-07-12')))
      .toEqual({ allow: true, useToken: false, newFreeUsed: 1 });
  });
  it('날짜 바뀌면 무료 카운트 리셋', () => {
    expect(resolveHintQuota(d('2026-07-11'), 3, 0, d('2026-07-12')))
      .toEqual({ allow: true, useToken: false, newFreeUsed: 1 });
  });
  it('무료 3/3 + 토큰 있으면 토큰 사용', () => {
    expect(resolveHintQuota(d('2026-07-12'), 3, 2, d('2026-07-12')))
      .toEqual({ allow: true, useToken: true, newFreeUsed: 3 });
  });
  it('무료 3/3 + 토큰 0 → 차단', () => {
    expect(resolveHintQuota(d('2026-07-12'), 3, 0, d('2026-07-12')))
      .toEqual({ allow: false, useToken: false, newFreeUsed: 3 });
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- exam-sessions.hint-gate` → FAIL.

- [ ] **Step 3: 구현 — 순수 헬퍼**

`src/modules/exam-sessions/hint-quota.ts`:
```ts
import { HINT_FREE_PER_DAY } from '@/common/constants/shop';

function dayNum(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/** 오늘 힌트를 열 수 있는지 + 토큰 소모 여부 + 갱신된 무료 사용수. */
export function resolveHintQuota(
  hintFreeDate: Date | null | undefined,
  hintFreeUsed: number,
  tokenQty: number,
  today: Date,
): { allow: boolean; useToken: boolean; newFreeUsed: number } {
  const sameDay = !!hintFreeDate && dayNum(hintFreeDate) === dayNum(today);
  const usedToday = sameDay ? hintFreeUsed : 0;
  if (usedToday < HINT_FREE_PER_DAY) {
    return { allow: true, useToken: false, newFreeUsed: usedToday + 1 };
  }
  if (tokenQty > 0) {
    return { allow: true, useToken: true, newFreeUsed: HINT_FREE_PER_DAY };
  }
  return { allow: false, useToken: false, newFreeUsed: HINT_FREE_PER_DAY };
}
```

- [ ] **Step 4: `revealHint`에 게이팅 연결**

`revealHint`에서 힌트 존재 확인 후, 반환 전에: 유저의 `hintFreeDate/hintFreeUsed` + `HINT_TOKEN` 수량 조회 → `resolveHintQuota` → `allow=false`면 `throw new ConflictException('오늘 무료 힌트를 다 썼어요. 힌트 토큰이 필요합니다.')`. 통과 시 `$transaction`으로: 무료면 `user.hintFreeDate=today, hintFreeUsed=newFreeUsed`; 토큰이면 인벤토리 `HINT_TOKEN` decrement + `hintFreeUsed` 갱신. (기존 `isHintUsed` 기록 로직은 유지.) `ConflictException` import 추가.

- [ ] **Step 5: 통과 확인 + 커밋**

Run: `npm test -- exam-sessions.hint-gate` 이어서 `npm test -- exam-sessions`.
```bash
git add src/modules/exam-sessions/hint-quota.ts src/modules/exam-sessions/exam-sessions.service.ts src/modules/exam-sessions/exam-sessions.hint-gate.spec.ts
git commit -m "feat(shop): 힌트 하루 무료 3회 + 힌트 토큰 게이팅"
```

---

### Task 10: 코스메틱 장착

**Files:**
- Modify: `src/modules/me/me.service.ts` (`equipCosmetic`), `me.controller.ts` (라우트), `dto/equip-cosmetic.dto.ts`(create)
- Test: `src/modules/me/me.cosmetic.spec.ts`

**Interfaces:**
- Produces: `POST /me/cosmetics/equip { itemKey }` → 소유 검증 후 `equippedTitle`/`nameColor` 세팅. 미소유 시 `BadRequestException`.

- [ ] **Step 1: 실패 테스트**
```ts
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { MeService } from '@/modules/me/me.service';

function makeService(owned: boolean) {
  const prisma = {
    userInventory: { findUnique: jest.fn().mockResolvedValue(owned ? { quantity: 1 } : null) },
    user: { update: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { svc: new MeService(prisma), prisma };
}

describe('MeService.equipCosmetic', () => {
  it('소유한 칭호 장착 → equippedTitle 세팅', async () => {
    const { svc, prisma } = makeService(true);
    await svc.equipCosmetic('u1', 'COSMETIC_TITLE_MASTER');
    expect((prisma as any).user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { equippedTitle: '문제의 지배자' },
    }));
  });
  it('미소유면 BadRequest', async () => {
    const { svc } = makeService(false);
    await expect(svc.equipCosmetic('u1', 'COSMETIC_TITLE_MASTER')).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2~4: 구현**

`me.service.ts`:
```ts
async equipCosmetic(userId: string, itemKey: string) {
  const item = getShopItem(itemKey as ShopItemKey);
  if (!item || item.effect.type !== 'COSMETIC') {
    throw new BadRequestException('꾸미기 아이템이 아닙니다.');
  }
  const owned = await this.prisma.userInventory.findUnique({
    where: { userId_itemKey: { userId, itemKey } },
    select: { quantity: true },
  });
  if (!owned || owned.quantity < 1) throw new BadRequestException('보유하지 않은 아이템입니다.');
  const eff = item.effect;
  await this.prisma.user.update({
    where: { id: userId },
    data: { [eff.field]: eff.value },
  });
  return { equipped: itemKey };
}
```
(`BadRequestException`, `getShopItem`, `ShopItemKey` import 추가.) DTO는 Task 7 `PurchaseDto`와 동형(`itemKey @IsIn(KEYS)`). controller에 `@Post('cosmetics/equip')` 라우트.

- [ ] **Step 5: 통과 + 커밋**

Run: `npm test -- me.cosmetic` → PASS.
```bash
git add src/modules/me src/common/constants/shop.ts
git commit -m "feat(shop): 코스메틱 장착 엔드포인트"
```

**✅ Phase 2 종료** — 상점 카탈로그·구매·부스터·보호권·힌트토큰·코스메틱 동작.

---

# Phase 3 — 실물 쿠폰 이력 + 관리자 배송

### Task 11: 내 구매 이력 + 관리자 fulfillment

**Files:**
- Modify: `src/modules/me/me.service.ts`+`me.controller.ts` (`GET /me/purchases`)
- Create: `src/modules/shop/admin-purchases.controller.ts`, `admin-purchases.service.ts`, `dto/fulfill.dto.ts`
- Modify: `src/modules/shop/shop.module.ts` (컨트롤러/서비스 등록)
- Test: `src/modules/shop/admin-purchases.service.spec.ts`

**Interfaces:**
- Produces:
  - `GET /me/purchases` → 내 구매 이력(쿠폰 상태 포함).
  - `GET /admin/purchases?status=PENDING` (ADMIN) → 대기 목록.
  - `PATCH /admin/purchases/:id/fulfill { note? }` (ADMIN) → `status=FULFILLED`, note 기록.

- [ ] **Step 1: 실패 테스트 (admin fulfill)**
```ts
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AdminPurchasesService } from '@/modules/shop/admin-purchases.service';

describe('AdminPurchasesService.fulfill', () => {
  it('PENDING → FULFILLED 전이 + note', async () => {
    const prisma = {
      purchase: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;
    const svc = new AdminPurchasesService(prisma);
    const r = await svc.fulfill('p1', '7/15 수령 완료');
    expect((prisma as any).purchase.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'PENDING' },
      data: { status: 'FULFILLED', note: '7/15 수령 완료' },
    });
    expect(r).toEqual({ id: 'p1', status: 'FULFILLED' });
  });

  it('대상 없거나 이미 처리(count=0)면 NotFound', async () => {
    const prisma = { purchase: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } } as unknown as PrismaService;
    await expect(new AdminPurchasesService(prisma).fulfill('p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- admin-purchases.service` → FAIL.

- [ ] **Step 3: 구현 — admin service**
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AdminPurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  listPending(status: 'PENDING' | 'FULFILLED' = 'PENDING') {
    return this.prisma.purchase.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, itemKey: true, coinCost: true, status: true, note: true, createdAt: true },
    });
  }

  /** PENDING만 전이(멱등·이중처리 방지). count===0 이면 없음/이미처리. */
  async fulfill(id: string, note?: string) {
    const upd = await this.prisma.purchase.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'FULFILLED', note: note ?? null },
    });
    if (upd.count === 0) throw new NotFoundException('처리 대상 구매가 없습니다.');
    return { id, status: 'FULFILLED' as const };
  }
}
```

- [ ] **Step 4: controller (ADMIN 가드) + me/purchases + module 등록**

`admin-purchases.controller.ts`:
```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleType } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { AdminPurchasesService } from './admin-purchases.service';
import { FulfillDto } from './dto/fulfill.dto';

@ApiTags('admin-purchases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('admin/purchases')
export class AdminPurchasesController {
  constructor(private readonly service: AdminPurchasesService) {}

  @Get()
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '구매 목록(기본 PENDING) — 실물 쿠폰 배송용' })
  list(@Query('status') status?: 'PENDING' | 'FULFILLED') {
    return this.service.listPending(status ?? 'PENDING');
  }

  @Patch(':id/fulfill')
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '구매 배송 완료 처리' })
  fulfill(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FulfillDto) {
    return this.service.fulfill(id, dto.note);
  }
}
```
`dto/fulfill.dto.ts`: `note?` `@IsOptional() @IsString() @MaxLength(500)`.
`me.service.ts`에 `purchases(userId)` = `prisma.purchase.findMany({ where:{userId}, orderBy:{createdAt:'desc'} })`, controller에 `@Get('purchases')`.
`shop.module.ts`에 `AdminPurchasesController`/`AdminPurchasesService` 추가.

- [ ] **Step 5: 통과 + 커밋**

Run: `npm test -- admin-purchases.service` → PASS.
```bash
git add src/modules/shop src/modules/me
git commit -m "feat(shop): 구매 이력 + 관리자 실물 쿠폰 배송 처리"
```

**✅ Phase 3 종료** — 실물 쿠폰 신청(PENDING)·관리자 배송(FULFILLED)까지.

---

# Phase 4 — 프론트 (`web/`)

> 프론트 테스트 하네스 없음 → 각 태스크는 `npm run lint` + `npx tsc --noEmit` + 수동 검증으로 마무리. 커밋은 태스크 단위.

### Task 12: API 클라이언트 + 훅

**Files:**
- Modify: `web/lib/api.ts` (신규 fetch 함수), `web/lib/types.ts` (타입), `web/lib/hooks.ts` (훅)

**Interfaces:**
- Produces: `fetchWallet`, `fetchShopItems`, `fetchLootBoxes`, `openLootBox(id)`, `purchaseItem(itemKey)`, `equipCosmetic(itemKey)`, `fetchMyPurchases`; 훅 `useWallet`, `useShopItems`, `useLootBoxes`, `useOpenBox`, `usePurchase`, `useEquipCosmetic`, `useMyPurchases`.

- [ ] **Step 1: 타입 추가** (`types.ts`) — `Wallet`, `ShopItem`, `LootBoxSummary`, `OpenBoxResult`, `PurchaseResult`, `MyPurchase`. 기존 스타일(interface, `id:string`) 준수.

- [ ] **Step 2: api 함수 추가** (`api.ts`) — 기존 `apiFetch` 헬퍼 사용(토큰 localStorage). 예:
```ts
export const fetchWallet = () => apiFetch<Wallet>('/me/wallet');
export const fetchShopItems = () => apiFetch<ShopItem[]>('/shop/items');
export const fetchLootBoxes = () => apiFetch<LootBoxSummary[]>('/loot-boxes');
export const openLootBox = (id: string) => apiFetch<OpenBoxResult>(`/loot-boxes/${id}/open`, { method: 'POST' });
export const purchaseItem = (itemKey: string) => apiFetch<PurchaseResult>('/shop/purchase', { method: 'POST', body: JSON.stringify({ itemKey }) });
export const equipCosmetic = (itemKey: string) => apiFetch('/me/cosmetics/equip', { method: 'POST', body: JSON.stringify({ itemKey }) });
export const fetchMyPurchases = () => apiFetch<MyPurchase[]>('/me/purchases');
```

- [ ] **Step 3: 훅 추가** (`hooks.ts`) — 조회 훅 + 뮤테이션. 뮤테이션 onSuccess는 **Phase 1에서 세운 무효화 패턴** 준수:
```ts
export function useOpenBox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => openLootBox(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['loot-boxes'] });
    },
  });
}
export function usePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemKey: string) => purchaseItem(itemKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['milestones'] });
      qc.invalidateQueries({ queryKey: ['my-purchases'] });
    },
  });
}
export function useWallet(enabled = true) {
  return useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, enabled });
}
// useShopItems(['shop-items']), useLootBoxes(['loot-boxes']),
// useEquipCosmetic(→ ['wallet']), useMyPurchases(['my-purchases'])
```

- [ ] **Step 4: 검증 + 커밋**

Run: `cd web && npm run lint && npx tsc --noEmit` → 통과.
```bash
git add web/lib/api.ts web/lib/types.ts web/lib/hooks.ts
git commit -m "feat(web/shop): 지갑·상점·상자 API 클라이언트 + 훅"
```

---

### Task 13: `/shop` 페이지

**Files:**
- Create: `web/app/shop/page.tsx`, `web/components/shop/ShopClient.tsx`, `ShopItemCard.tsx`, `WalletBadge.tsx`, `InventoryStrip.tsx`
- Modify: `web/components/layout/AppSidebar.tsx` (상점 링크 추가)

**Interfaces:**
- Consumes: `useWallet`, `useShopItems`, `usePurchase`, `useEquipCosmetic`, `useMyPurchases`.

- [ ] **Step 1: 페이지 셸** — `app/shop/page.tsx`는 클라이언트 컴포넌트 `ShopClient` 렌더(토큰 localStorage → 클라이언트 전용). CLAUDE.md 규칙: `<main>`으로 시작, 레이아웃 래퍼 재도입 금지.

- [ ] **Step 2: `ShopClient`** — 상단 `WalletBadge`(코인 잔고), 아이템 그리드(`ShopItemCard`), 하단 `InventoryStrip`(보호권/힌트토큰 수, 코스메틱 소유·장착), 실물 쿠폰 구매 시 확인 + "배송 대기" 안내. 구매 버튼은 `wallet.coins < price`면 비활성.

- [ ] **Step 3: 구매 상호작용** — `usePurchase().mutate(itemKey)`; 성공 토스트(`sonner`), 실패 시 서버 메시지("코인이 부족합니다.") 토스트. 코스메틱은 소유 시 "장착" 버튼(`useEquipCosmetic`).

- [ ] **Step 4: 사이드바 링크** — `AppSidebar.tsx`에 상점 항목(아이콘 예 `Store`/`ShoppingBag` lucide) + 미개봉 상자 있으면 배지.

- [ ] **Step 5: 검증 + 커밋** — `npm run lint && npx tsc --noEmit`; 수동: `/shop` 렌더·구매·장착·잔고 갱신.
```bash
git add web/app/shop web/components/shop web/components/layout/AppSidebar.tsx
git commit -m "feat(web/shop): 상점 페이지 — 카탈로그·구매·인벤토리"
```

---

### Task 14: 결과 화면 상자 개봉 + 코인 표시

**Files:**
- Modify: `web/components/exam-session/ResultBanner.tsx` 또는 `SessionPage.tsx`(결과 모드 `:122-192`) — 상자 획득 노출
- Create: `web/components/exam-session/BoxRewardCard.tsx`
- Modify: `web/components/dashboard/DashboardSide.tsx` 또는 헤더 — 코인·미개봉 상자 배지

**Interfaces:**
- Consumes: `submit` 결과의 `box: { id, tier } | null`(Task 3), `useOpenBox`, `useWallet`.

- [ ] **Step 1: `SubmitSessionResult` 타입에 `box` 추가** (`web/lib/types.ts`) — `box: { id: string; tier: 'COMMON'|'RARE'|'LEGENDARY' } | null`.

- [ ] **Step 2: `BoxRewardCard`** — 제출 결과에 `box`가 있으면 "상자 획득!" 카드 + 개봉 버튼. `useOpenBox().mutate(box.id)` → 반환 `rewardCoins` 애니메이션 표시(간단 카운트업), 개봉 후 카드 상태 전환. 이미 개봉(409)이면 조용히 무시.

- [ ] **Step 3: 결과 화면에 삽입** — `SessionPage` 결과 모드(`justSubmitted`)에서 `ResultBanner` 아래 `BoxRewardCard` 렌더(`justSubmitted?.box`).

- [ ] **Step 4: 코인/상자 배지** — 대시보드 사이드 또는 사이드바에 `useWallet()`으로 코인 잔고 + 미개봉 상자 수 배지.

- [ ] **Step 5: 검증 + 커밋** — `npm run lint && npx tsc --noEmit`; 수동: 세션 제출 → 상자 카드 → 개봉 → 코인 증가.
```bash
git add web/components/exam-session web/lib/types.ts web/components/dashboard
git commit -m "feat(web/shop): 결과 화면 상자 개봉 + 코인 표시"
```

---

## 최종 통합 검증

- [ ] 백엔드 전체 스펙: `npm test` → 전부 PASS.
- [ ] `npm run build`(nest) → 타입 에러 없음.
- [ ] 프론트: `cd web && npm run lint && npx tsc --noEmit`.
- [ ] 수동 E2E(로컬 MySQL+Redis, `LOCAL_TEST_GUIDE.md` 기반):
  1. 세션 생성·풀이·제출 → 상자 드롭 확인(반복 제출로 확률 체감).
  2. `POST /loot-boxes/:id/open` → 코인 증가, 재개봉 409.
  3. `GET /me/wallet` 잔고 반영.
  4. `POST /shop/purchase XP_BOOST` → 잔고 차감·`xpBoostUntil` 세팅. 잔고 부족 시 400.
  5. 보호권 구매 후 하루 건너뛰고 제출 → 스트릭 유지·인벤토리 감소.
  6. 힌트 4회째 → 토큰 소모/차단.
  7. 쿠폰 구매(PENDING) → 관리자 `PATCH /admin/purchases/:id/fulfill` → FULFILLED.
- [ ] `LOCAL_TEST_GUIDE.md`에 위 curl 흐름 추가.

## 자체검토 메모(작성자)
- 스펙 커버리지: A~G 전 항목 태스크 매핑됨(A→T1, B→T2·T3, C→T6, D-1→T7·T8, D-2→T8, D-3→T9, D-4→T10, D-5→T7·T11, E→T4·T5·T7·T11, F→T12~T14, G→각 태스크 테스트).
- 타입 일관성: `computeStreak` 4-인자·`shieldConsumed`가 T8에서 정의되고 `awardForSubmit`에서 소비. `getShopItem`/`SHOP_ITEMS`/`boostExpiryHours`는 T6 정의 → T7·T10 소비. `box` 필드는 T3(백)·T14(프론트) 일치.
- 하위호환: 기존 `computeStreak` 3-인자 호출부는 기본값 `shieldCount=0`로 회귀 없음.
