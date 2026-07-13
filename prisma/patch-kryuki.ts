/**
 * patch-kryuki.ts
 * ---------------------------------------------------------------------------
 * kryukihide2009@gmail.com (닉네임: 김우진) 계정 셋업/보강 스크립트.
 *   - 계정이 없으면 생성(이전 시드 clean 과정에서 삭제됨).
 *   - 오답(틀린 답) 세션 + 오답노트(어떤 키워드에서 틀렸는지) 채우기
 *   - "고퀄" 제목 포함 퍼블릭 문제집 1개(문항 5개, 정상 연결)
 *   - 코인 10000, 레벨 10(xp 5000), 칭호 "전설의 불사조" 장착
 *
 * 멱등: 재실행 시 이 계정에서 파생된 데이터(세션/오답노트/문제집/원장/상자)를
 *       지우고 다시 만든다.
 *
 * 실행: npx ts-node prisma/patch-kryuki.ts
 */
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAIL = 'kryukihide2009@gmail.com';
const NICKNAME = '김우진';
const DEMO_PASSWORD = 'demo1234!';
const EQUIPPED_TITLE = '전설의 불사조';
const TARGET_XP = 5000; // levelForXp(5000) === 10
const TARGET_LEVEL = 10;
const TARGET_COINS = 10000;

type ChoiceJson = { id: string; isCorrect?: boolean };

async function main() {
  console.log('🔎 계정 확인...');
  let user = await prisma.user.findFirst({ where: { email: EMAIL } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  if (!user) {
    console.log('   계정 없음 → 생성 (이전 시드 clean 과정에서 삭제된 것으로 보임)');
    user = await prisma.user.create({
      data: { id: randomUUID(), email: EMAIL, nickname: NICKNAME, passwordHash },
    });
  }
  const uid = user.id;

  // --- 멱등: 이 계정 파생 데이터 정리 ---------------------------------------
  console.log('🧹 기존 파생 데이터 정리...');
  // 세션 체인(FK NoAction → 수동 역순 삭제)
  const sessions = await prisma.examSession.findMany({ where: { userId: uid }, select: { id: true } });
  const sids = sessions.map((s) => s.id);
  if (sids.length) {
    const sqs = await prisma.examSessionQuestion.findMany({ where: { examSessionId: { in: sids } }, select: { id: true } });
    const sqIds = sqs.map((q) => q.id);
    if (sqIds.length) await prisma.examSessionAnswer.deleteMany({ where: { examSessionQuestionId: { in: sqIds } } });
    await prisma.examSessionQuestion.deleteMany({ where: { examSessionId: { in: sids } } });
    await prisma.examSession.deleteMany({ where: { id: { in: sids } } });
  }
  // 문제집 체인
  const wbs = await prisma.workbook.findMany({ where: { ownerId: uid }, select: { id: true } });
  const wbIds = wbs.map((w) => w.id);
  if (wbIds.length) {
    await prisma.workbookQuestion.deleteMany({ where: { workbookId: { in: wbIds } } });
    await prisma.workbookTag.deleteMany({ where: { workbookId: { in: wbIds } } });
    await prisma.workbook.deleteMany({ where: { id: { in: wbIds } } });
  }
  await prisma.userQuestionAnnotation.deleteMany({ where: { userId: uid } });
  await prisma.xpHistory.deleteMany({ where: { userId: uid } });
  await prisma.coinHistory.deleteMany({ where: { userId: uid } });
  await prisma.milestoneAchievement.deleteMany({ where: { userId: uid } });
  await prisma.lootBox.deleteMany({ where: { userId: uid } });

  // --- 역할(CONSUMER + CREATOR) -------------------------------------------
  for (const role of ['CONSUMER', 'CREATOR'] as const) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId: uid, role } },
      create: { userId: uid, role },
      update: {},
    });
  }

  // --- 대상 문항 로드(전부 PUBLISHED 객관식) --------------------------------
  const questions = await prisma.question.findMany({
    where: { status: 'PUBLISHED' as any, questionType: '객관식' },
    select: {
      id: true, creatorId: true, questionType: true, stem: true, choices: true,
      explanation: true, difficulty: true, points: true, searchText: true, passageId: true,
      subject: { select: { examCategory: true, name: true } },
    },
  });
  if (questions.length < 6) throw new Error(`문항 부족: ${questions.length}개 (>=6 필요)`);

  const wrongPicks = questions.slice(0, 6); // 오답 세션용 6개
  const wbPicks = questions.slice(6, 11).length === 5 ? questions.slice(6, 11) : questions.slice(0, 5); // 문제집용 5개

  // 각 문항의 오답 키워드(검색어 첫 토큰 → 없으면 소분류명)
  const keywordOf = (q: (typeof questions)[number]) =>
    (q.searchText?.trim().split(/\s+/)[0] || q.subject?.name || '핵심개념');

  // --- 오답 세션 -----------------------------------------------------------
  console.log('📝 오답 세션 생성 (6문항 전부 오답)...');
  const sid = randomUUID();
  const now = Date.now();
  await prisma.examSession.create({
    data: {
      id: sid,
      userId: uid,
      subjectId: null,
      isReview: false,
      filterCriteria: { source: 'filter', questionCount: wrongPicks.length, note: '오답 복습 대상' },
      status: 'SUBMITTED' as any,
      startedAt: new Date(now - 3600_000),
      submittedAt: new Date(now - 3000_000),
      durationSec: 840,
    },
  });
  const REASONS = ['CONCEPT', 'MISTAKE', 'TIME'] as const;
  const MEMO = (kw: string, reason: string) => {
    if (reason === 'TIME') return `'${kw}' 문항에서 시간이 부족해 급하게 찍음. 시간 배분 연습 필요.`;
    if (reason === 'MISTAKE') return `'${kw}' 개념은 알았는데 매력적 오답에 낚임. 선지 끝까지 읽기!`;
    return `'${kw}' 개념 이해가 부족해서 틀림. 복습노트에 정리하자.`;
  };

  let order = 0;
  for (const q of wrongPicks) {
    const sqId = randomUUID();
    await prisma.examSessionQuestion.create({
      data: {
        id: sqId,
        examSessionId: sid,
        questionId: q.id,
        displayOrder: ++order,
        snapshot: {
          questionType: q.questionType,
          stem: q.stem,
          choices: q.choices ?? undefined,
          explanation: q.explanation ?? undefined,
          points: q.points,
          difficulty: q.difficulty,
        },
        isHintUsed: order % 2 === 0,
      },
    });
    // 오답 선지 = 정답이 아닌 선지 하나
    const choices = (Array.isArray(q.choices) ? q.choices : []) as ChoiceJson[];
    const wrong = choices.find((c) => !c.isCorrect) ?? choices[0] ?? { id: 'c1' };
    await prisma.examSessionAnswer.create({
      data: {
        id: randomUUID(),
        examSessionQuestionId: sqId,
        selectedChoiceIds: [wrong.id],
        isCorrect: false,
        timeSpentSec: 40 + order * 12,
        answeredAt: new Date(now - 3100_000),
      },
    });

    // 오답노트(어떤 키워드에서 틀렸는지)
    const kw = keywordOf(q);
    const reason = REASONS[order % REASONS.length];
    await prisma.userQuestionAnnotation.create({
      data: {
        id: randomUUID(),
        userId: uid,
        questionId: q.id,
        target: 'STEM',
        markStyle: 'HIGHLIGHT',
        color: 'pink',
        selectedText: kw,
        reasonCode: reason,
        memoText: MEMO(kw, reason),
      },
    });
  }

  // --- 오답 키워드 태그(#키워드) → 문항에 연결 ------------------------------
  console.log('🏷️  오답 키워드 태그 연결...');
  const wrongKeywords = [...new Set(wrongPicks.map(keywordOf))];
  for (const q of wrongPicks) {
    const kw = keywordOf(q);
    let tag = await prisma.tag.findFirst({ where: { name: kw, category: 'weakness' } });
    if (!tag) tag = await prisma.tag.create({ data: { id: randomUUID(), name: kw, category: 'weakness' } });
    await prisma.questionTag.upsert({
      where: { questionId_tagId: { questionId: q.id, tagId: tag.id } },
      create: { questionId: q.id, tagId: tag.id },
      update: {},
    });
  }

  // --- 고퀄 퍼블릭 문제집(문항 5개, 정상 연결) ------------------------------
  console.log('📓 고퀄 퍼블릭 문제집 생성...');
  const wbId = randomUUID();
  await prisma.workbook.create({
    data: {
      id: wbId,
      ownerId: uid,
      title: '[고퀄] 수능 오답 정복 5선 🔥',
      description: '오답률 높은 핵심 문항만 선별한 고퀄리티 문제집. 취약 키워드 복습용.',
      visibility: 'PUBLIC',
      questionCount: wbPicks.length,
      viewCount: 128,
      forkCount: 7,
      publishedAt: new Date(now),
    },
  });
  let wbOrder = 0;
  for (const q of wbPicks) {
    await prisma.workbookQuestion.create({
      data: { workbookId: wbId, questionId: q.id, displayOrder: ++wbOrder },
    });
  }
  // 문제집 키워드 태그: '고퀄' + 취약 키워드 일부
  const wbTagNames = ['고퀄', ...wrongKeywords.slice(0, 2)];
  for (const name of [...new Set(wbTagNames)]) {
    let tag = await prisma.tag.findFirst({ where: { name } });
    if (!tag) tag = await prisma.tag.create({ data: { id: randomUUID(), name, category: 'concept' } });
    await prisma.workbookTag.upsert({
      where: { workbookId_tagId: { workbookId: wbId, tagId: tag.id } },
      create: { workbookId: wbId, tagId: tag.id },
      update: {},
    });
  }

  // --- 코인/레벨/칭호 + 원장 ------------------------------------------------
  console.log('💰 코인/레벨/칭호 세팅...');
  await prisma.user.update({
    where: { id: uid },
    data: {
      passwordHash,
      nickname: NICKNAME,
      coins: TARGET_COINS,
      xp: TARGET_XP,
      level: TARGET_LEVEL,
      equippedTitle: EQUIPPED_TITLE,
      nameColor: '#f59e0b',
      currentStreak: 12,
      longestStreak: 30,
    },
  });
  await prisma.xpHistory.create({
    data: {
      id: randomUUID(),
      userId: uid,
      amount: TARGET_XP,
      reason: 'SEED_ADJUST',
      balanceAfter: TARGET_XP,
      breakdown: { seed: TARGET_XP },
    },
  });
  await prisma.coinHistory.create({
    data: {
      id: randomUUID(),
      userId: uid,
      amount: TARGET_COINS,
      reason: 'SOLVE_MILESTONE' as any,
      balanceAfter: TARGET_COINS,
    },
  });
  // 마일스톤(레벨/스트릭)
  const msKeys = ['LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5', 'LEVEL_10', 'STREAK_7', 'STREAK_30'];
  for (const milestoneKey of msKeys) {
    await prisma.milestoneAchievement.upsert({
      where: { userId_milestoneKey: { userId: uid, milestoneKey } },
      create: { userId: uid, milestoneKey },
      update: {},
    });
  }
  // 미개봉 상자 2개(100% 드롭 기능 시연용)
  await prisma.lootBox.createMany({
    data: [
      { id: randomUUID(), userId: uid, tier: 'LEGENDARY' as any },
      { id: randomUUID(), userId: uid, tier: 'RARE' as any },
    ],
  });

  console.log('✅ patch-kryuki 완료', {
    userId: uid,
    email: EMAIL,
    coins: TARGET_COINS,
    level: TARGET_LEVEL,
    title: EQUIPPED_TITLE,
    wrongAnswers: wrongPicks.length,
    wrongKeywords,
    workbook: '[고퀄] 수능 오답 정복 5선 🔥',
    workbookQuestions: wbPicks.length,
    unopenedBoxes: 2,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
