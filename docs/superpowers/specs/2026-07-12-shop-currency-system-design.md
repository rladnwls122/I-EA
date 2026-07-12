# 상점 · 재화(코인) · 상자 시스템 설계

날짜: 2026-07-12
상태: 설계 승인됨 (구현 대기)

## Context

문제 풀이 보상이 지금은 XP 하나뿐이다. 사용자가 새 재화(**코인**)를 원한다:
문제를 풀면 랜덤 **상자**가 드롭되고, 상자를 열어 코인을 얻으며, 코인을 **상점**에서
소비한다. 상점에는 XP 부스터·연속학습 보호권 같은 디지털 아이템과, 실물 보상인
**배불리주먹밥 쿠폰(이모네)**이 있다.

기존 스키마는 의도적으로 미니멀하다(랭킹/티어/리그 없음, XP만). 이 설계는 그 원칙을
지키며 최소 테이블만 추가한다. 코인은 XP와 별개의 축이다.

배경 사실(코드 확인됨):
- `User`에 `xp/level/currentStreak/longestStreak/lastActiveDate/xpBoostUntil` 존재. 재화 필드 없음.
- XP 적립은 `exam-sessions.service.ts` `submit()` → `awardForSubmit()`에서 `$transaction`으로 지속화. 원장 `XpHistory`, 마일스톤 `MilestoneAchievement` 존재.
- 부스터 헬퍼 `isBoostActive`/`boostExpiry`/`BOOST_MULTIPLIER`, 스트릭 로직 `computeStreak`는 `src/common/constants/xp.ts`에 있음 — 재사용한다.
- 힌트(`revealHint`)는 현재 **무료·무제한**(`isHintUsed` 기록만). 힌트 토큰이 의미를 가지려면 게이팅이 필요 → 아래 D-3에서 정의.

## 핵심 원칙

- 코인은 **상자 개봉으로만** 발생한다(문제 풀이 → 상자 → 코인). 직접 XP↔코인 환전 없음.
- 상점 카탈로그는 DB가 아니라 **상수 파일**(`src/common/constants/shop.ts`). `xp.ts`/`question.ts` 패턴을 따른다.
- 모든 잔고 변경은 원자적 `$transaction` + 음수 방지 검증.
- 코인/구매/상자는 각각 원장 테이블로 감사 가능.

## A. 데이터 모델 (Prisma)

### User 필드 추가
```prisma
coins          Int      @default(0) @map("coins")
equippedTitle  String?  @map("equipped_title")   // 코스메틱 v1
nameColor      String?  @map("name_color")       // 코스메틱 v1
```
XP 부스터는 기존 `xpBoostUntil` 재사용(추가 필드 없음).

### enum (오타 방지 — String 대신 enum 사용)
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

### 신규 테이블
```prisma
model LootBox {                     // @@map("loot_boxes")
  id            String      @id @default(uuid())
  userId        String      @map("user_id")
  tier          LootBoxTier
  examSessionId String?     @map("exam_session_id")   // 드롭 출처
  rewardCoins   Int?        @map("reward_coins")        // 개봉 시 롤 결과(개봉 전 null)
  createdAt     DateTime    @default(now()) @map("created_at")
  openedAt      DateTime?   @map("opened_at")
  @@index([userId, openedAt])
}

model UserInventory {               // @@map("user_inventory")
  userId   String @map("user_id")
  itemKey  String @map("item_key")   // STREAK_SHIELD | HINT_TOKEN
  quantity Int    @default(0)
  @@id([userId, itemKey])
}

model Purchase {                    // @@map("purchases")
  id        String         @id @default(uuid())
  userId    String         @map("user_id")
  itemKey   String         @map("item_key")
  coinCost  Int            @map("coin_cost")
  status    PurchaseStatus @default(FULFILLED)   // 실물 쿠폰만 PENDING
  note      String?                               // 배송/처리 메모
  createdAt DateTime       @default(now()) @map("created_at")
  @@index([userId, createdAt])
  @@index([status])
}

model CoinHistory {                 // @@map("coin_history")
  id           String            @id @default(uuid())
  userId       String            @map("user_id")
  amount       Int                                  // +획득 / -소비
  reason       CoinHistoryReason
  // 이 코인의 출처 추적: BOX_OPEN→lootbox id, PURCHASE→purchase id.
  referenceId  String?           @map("reference_id")
  balanceAfter Int               @map("balance_after")
  createdAt    DateTime          @default(now()) @map("created_at")
  @@index([userId, createdAt])
}
```
프로덕션은 `prisma db push`(마이그레이션 아님) — `schema.prisma`가 authoritative.
`itemKey`는 여러 값(코스메틱 다수 포함)이라 enum이 아닌 String 유지 — `shop.ts` 상수가 유효값 단일 소스.

## B. 코인 획득 = 상자 드롭 (제출 시)

`src/common/constants/shop.ts`에 드롭 규칙:
```ts
export const BOX_DROP = {
  CHANCE: 0.6,                       // 제출당 상자 드롭 확률
  // 정답률(0~100)에 따른 등급 가중치. 높을수록 상위 등급↑.
  TIER_WEIGHTS: (scorePercent) => (
    scorePercent >= 80 ? { COMMON: 40, RARE: 45, LEGENDARY: 15 }
  : scorePercent >= 50 ? { COMMON: 60, RARE: 33, LEGENDARY: 7 }
  :                       { COMMON: 80, RARE: 18, LEGENDARY: 2 }
  ),
  COIN_RANGE: { COMMON: [10, 30], RARE: [40, 80], LEGENDARY: [120, 250] },
} as const;
```
- `submit()`의 `awardForSubmit` 직후(같은 트랜잭션) 드롭 롤. 히트 시 미개봉 `LootBox` 생성(코인은 아직 롤 안 함).
- reward payload에 `box: { id, tier } | null` 추가 → 결과 화면에서 "상자 획득" 표시.
- 개봉 `POST /loot-boxes/:id/open`: `$transaction` 안에서
  1. **원자적 중복 개봉 방지** — `updateMany({ where: { id, userId, openedAt: null }, data: { openedAt: now, rewardCoins: n } })`. 반환 `count === 0`이면 이미 개봉됨/없음 → 409(Conflict)로 중단. `openedAt IS NULL` 가드가 동시 이중 호출로 코인이 두 번 크레딧되는 것을 막는다.
  2. count===1일 때만 `user.coins += n`, `CoinHistory(reason=BOX_OPEN, referenceId=box.id)` 기록.
- 코인 롤은 업데이트 전에 서버측 `Math.random()`으로 산출(백엔드는 이 제약 없음 — 워크플로 스크립트 제약과 무관).

## C. 상점 카탈로그 (`shop.ts` 상수)

| itemKey | 이름 | 가격(코인) | 종류 |
|---|---|---|---|
| `XP_BOOST` | XP 부스터 | 100 | 즉시효과 |
| `XP_BOOST_LARGE` | 대형 XP 부스터 | 300 | 즉시효과 |
| `STREAK_SHIELD` | 연속학습 보호권 | 250 | 인벤토리 소모품 |
| `HINT_TOKEN` | 힌트 토큰 | 80 | 인벤토리 소모품 |
| `COSMETIC_TITLE_*` | 칭호 | 150 | 코스메틱(소유+장착) |
| `COSMETIC_NAMECOLOR_*` | 닉네임 색 | 200 | 코스메틱 |
| `RICEBALL_COUPON` | 배불리주먹밥 쿠폰(실물) | **7777** | 실물(PENDING) |

가격/드롭률은 상수라 조정 쉬움.

## D. 아이템 효과 로직

**D-1. 부스터** — 구매 시 `xpBoostUntil = boostExpiry(now)` 세팅. 대형은 72h 만료 헬퍼 추가(`xp.ts`의 `boostExpiry` 파라미터화 또는 `boostExpiryHours(now, h)`). 활성 판정은 기존 `isBoostActive`.

**D-2. 연속학습 보호권** — 구매 시 `UserInventory(STREAK_SHIELD).quantity += 1`.
소모 시점: 다음 제출의 `computeStreak`. 현재 로직은 `diff===1 → +1, else 1로 리셋`.
확장: `diff >= 2`(결석)일 때 보유 shield가 있으면 **1개 소모하고 스트릭 유지**(리셋 안 함), 오늘 학습분으로 `+1`. shield 없으면 기존대로 리셋.
- `computeStreak`는 순수함수 유지 — shield 개수를 인자로 받아 `{ currentStreak, counted, shieldConsumed }` 반환. 소모 반영(인벤토리 감소)은 `awardForSubmit` 트랜잭션에서 수행.
- gap이 2를 크게 초과해도 shield 1개로 1일 결석만 방어(단순화). 그 이상 결석은 리셋.

**D-3. 힌트 토큰** ⚠️ UX 변경.
- 힌트에 **하루 무료 3회** 도입. 무료 소진 후에는 `HINT_TOKEN` 1개 소모해 열람. 토큰도 없으면 402/409로 차단(메시지: "오늘 무료 힌트를 다 썼어요. 힌트 토큰이 필요합니다.").
- 하루 무료 카운트는 별도 컬럼 없이 `User`에 `hintFreeDate DateTime? @db.Date` + `hintFreeUsed Int @default(0)` 추가(날짜 바뀌면 리셋). (D-3만 User 2필드 추가.)
- `revealHint`에서 소진/토큰 판정 후 반환.

**D-4. 코스메틱** — 구매 시 `UserInventory(itemKey).quantity=1`(소유 표시). 장착 `POST /me/cosmetics/equip {itemKey}` → `equippedTitle`/`nameColor` 세팅. 소유한 것만 장착 가능.

**D-5. 배불리주먹밥 쿠폰(실물)** — 코인 7777 검증·차감, `Purchase(status=PENDING)` 생성, `CoinHistory(reason=PURCHASE, referenceId=purchase.id)` 기록. 관리자 배송 처리 전까지 PENDING. 사용자에게 "신청 완료, 배송 대기" 표시.

> 참고: 모든 구매(디지털 포함)는 `CoinHistory(PURCHASE, referenceId=purchase.id)`를 남긴다.

## E. API (신규 `shop` + `loot-boxes` 모듈, `me`/admin 확장)

- `GET /shop/items` — 카탈로그+가격(상수). `@Public()` 가능.
- `POST /shop/purchase { itemKey }` — 잔고 검증·차감·효과 적용·`Purchase`+`CoinHistory` 기록. 원자적.
- `GET /loot-boxes` — 미개봉 상자 목록.
- `POST /loot-boxes/:id/open` — 개봉·코인 크레딧.
- `GET /me/wallet` — `{ coins, inventory[], xpBoostUntil, cosmetics: { owned[], equippedTitle, nameColor }, unopenedBoxes }`. (또는 `GET /me` 확장 — 별도 엔드포인트 권장.)
- `GET /me/purchases` — 구매 이력(쿠폰 상태 포함).
- `POST /me/cosmetics/equip { itemKey }`.
- 관리자(`@Roles(ADMIN)`): `GET /admin/purchases?status=PENDING`, `PATCH /admin/purchases/:id/fulfill { note }` — 쿠폰 배송 완료 처리.
- 모든 body는 DTO + class-validator(전역 `whitelist`/`forbidNonWhitelisted`).

## F. 프론트 (`web/`)

- `/shop` 페이지 — 코인 잔고 헤더, 아이템 그리드, 구매 버튼(잔고 부족 시 비활성), 인벤토리(보호권·힌트토큰 개수), 코스메틱 소유/장착.
- 결과 화면: 상자 획득 시 개봉 CTA → 개봉 애니메이션 → 코인 보상. 대시보드에 미개봉 상자 배지.
- 지갑/코인 표시: 헤더 + `/me`. 실물 쿠폰 "배송 대기" 상태 노출.
- React Query: 구매/개봉 성공 시 `['wallet']`/`['me']`/`['milestones']` 무효화(방금 고친 XP 캐시 무효화 패턴 준수).
- lib/api.ts + lib/hooks.ts에 신규 훅. 토큰은 localStorage(클라이언트 컴포넌트만).

## G. 테스트

백엔드 jest(`*.spec.ts`):
- 드롭 확률·등급 가중 분포(시드/모킹으로 `Math.random` 제어).
- 상자 개봉: 미개봉→코인 크레딧·`openedAt`·`CoinHistory`, 중복 개봉 거부.
- 구매: 정상 차감·효과, 잔고 부족 거부(음수 방지), 존재하지 않는 itemKey 거부.
- 스트릭 보호권: 결석 시 shield 소모하고 스트릭 유지, shield 없으면 리셋.
- 부스터: `xpBoostUntil` 세팅·대형 72h.
- 힌트 게이팅: 무료 3회 후 토큰 소모, 토큰 없으면 차단, 날짜 롤오버 리셋.
- 쿠폰: PENDING 생성, 관리자 fulfill로 상태 전이.

프론트: 프론트 테스트 하네스 없음 → 수동 검증(로컬 세션 제출→상자→개봉→상점 구매 흐름).
`LOCAL_TEST_GUIDE.md`에 curl 흐름 추가.

## 스코프 밖(YAGNI) — 명시적으로 나중
사용자 확인: 아래는 v1 제외, 트리거 생기면 추가.
- `LootBox.rewardType` / 아이템 상자(코인 외 보상): 상자에 아이템 담을 때.
- `LootBox.expiresAt`: 이벤트성 아이템 생길 때.
- `Purchase` 가격 스냅샷 컬럼: 가격이 자주 바뀌기 시작할 때.
- `RandomService` 추상화: 지금은 `Math.random`으로 충분.
- `SHOP_VERSION`(카탈로그 캐싱): 캐싱 필요해질 때.
- 재고(`stock`): 실물 쿠폰 재고 관리 필요해질 때.
- `UserDailyUsage` 별도 테이블: 힌트 등 일일 사용량이 커질 때. (v1은 `User`에 `hintFreeDate`/`hintFreeUsed` 2컬럼으로 충분.)
- XP↔코인 환전, 코인 선물/거래, 상자 열쇠, 확률표 UI.
- 코스메틱은 칭호·닉네임색 최소 세트만. 아바타/테마 등은 후속.

## 열린 항목(구현 중 확정)
- 힌트 하루 무료 횟수(기본 3) — 조정 가능.
- 코스메틱 구체 목록(칭호 문구/색상 팔레트).
- 대형 부스터 지속시간(기본 72h).
