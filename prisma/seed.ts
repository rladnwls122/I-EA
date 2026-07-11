/**
 * Q-Idea 데모/테스트 시드.
 *   - "시드 데이터 작성 가이드"의 모델 커버리지·의존성 순서를 따르되 볼륨은 축소했다.
 *   - 매 실행마다 시드 도메인을 FK 역순으로 비우고 다시 채운다(멱등: 재생성 방식).
 *     로컬/개발 DB 전용 — 운영 DB에 절대 실행하지 말 것.
 *   - Faker 미사용(무의존): 아래 순수 랜덤 헬퍼로 데이터를 만든다.
 */
import {
  PrismaClient,
  UserRoleType,
  QuestionStatus,
  PassageStatus,
  GenerationStatus,
  MediaAssetType,
  ExamSessionStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const OBJECTIVE = '객관식';
const SUBJECTIVE = '주관식';
const DEMO_PASSWORD = 'demo1234!';

// --- 랜덤 헬퍼 (Faker 대체) ------------------------------------------------
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
const sample = <T>(a: T[], n: number): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c.slice(0, Math.min(n, c.length));
};
// ProseMirror(Tiptap) 최소 문서
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const multiDoc = (paras: string[]) => ({
  type: 'doc',
  content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })),
});

// xp → level (xp.ts LEVEL_TIERS 인라인 복제; 시드에서 @/ 별칭 해석을 피한다)
const TIERS: [number, number][] = [
  [0, 1],
  [100, 2],
  [300, 3],
  [600, 4],
  [1000, 5],
  [5000, 10],
  [15000, 20],
];
const levelForXp = (xp: number) => TIERS.reduce((lv, [min, l]) => (xp >= min ? l : lv), 1);

async function chunkCreate<T>(model: { createMany: Function }, rows: T[], size = 200) {
  for (let i = 0; i < rows.length; i += size) {
    await (model.createMany as any)({ data: rows.slice(i, i + size), skipDuplicates: true });
  }
}

// --- 1. 시드 도메인 초기화 (FK 역순) ---------------------------------------
async function clean() {
  await prisma.examSessionAnswer.deleteMany();
  await prisma.examSessionQuestion.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.userQuestionAnnotation.deleteMany();
  await prisma.questionComment.deleteMany();
  await prisma.questionReview.deleteMany();
  await prisma.questionChoiceStat.deleteMany();
  await prisma.workbookQuestion.deleteMany();
  await prisma.workbook.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.questionTag.deleteMany();
  await prisma.question.deleteMany();
  await prisma.passage.deleteMany();
  await prisma.aiGeneration.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.milestoneAchievement.deleteMany();
  await prisma.xpHistory.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log('🧹 기존 시드 초기화...');
  await clean();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- 2. Users (고정 3 + 랜덤 7) ------------------------------------------
  console.log('👤 users...');
  type U = { id: string; email: string; nickname: string; roles: UserRoleType[]; xp: number };
  const users: U[] = [];
  const R = UserRoleType;
  const fixed: Omit<U, 'id' | 'xp'>[] = [
    { email: 'admin@demo.io', nickname: '관리자', roles: [R.ADMIN, R.CREATOR, R.CONSUMER] },
    { email: 'creator@demo.io', nickname: '데모출제자', roles: [R.CREATOR, R.CONSUMER] },
    { email: 'consumer@demo.io', nickname: '열공하는수험생', roles: [R.CONSUMER] },
  ];
  const nickPool = ['국어러버', '수학왕', '밤샘수험생', '오답장인', '만점기원', '조용한노력', '기출마스터'];
  const defs = [
    ...fixed.map((f) => ({ ...f, xp: f.email === 'consumer@demo.io' ? 1200 : randInt(200, 800) })),
    ...Array.from({ length: 7 }, (_, i) => ({
      email: `user${i + 1}@demo.io`,
      nickname: nickPool[i],
      roles: i < 2 ? [R.CREATOR, R.CONSUMER] : [R.CONSUMER],
      xp: randInt(0, 3000),
    })),
  ];
  for (const d of defs) {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: d.email,
        passwordHash,
        nickname: d.nickname,
        creatorBio: d.roles.includes(R.CREATOR) ? '데모 출제자입니다.' : null,
        xp: d.xp,
        level: levelForXp(d.xp),
        currentStreak: randInt(0, 15),
        longestStreak: randInt(5, 30),
        lastActiveDate: new Date(),
        roles: { create: d.roles.map((role) => ({ role })) },
      },
    });
    users.push({ id, email: d.email, nickname: d.nickname, roles: d.roles, xp: d.xp });
  }
  const creators = users.filter((u) => u.roles.includes(R.CREATOR));
  const consumers = users.filter((u) => u.roles.includes(R.CONSUMER));
  const byEmail = (e: string) => users.find((u) => u.email === e)!;

  // --- 3. Subjects (3단 분류: 시험 → 대분류 → 소분류) -----------------------
  console.log('📚 subjects...');
  // 시험별 대분류 → 소분류 매핑(현실적 조합만 생성). 시험/단원을 넉넉히 확장.
  const EXAM_MAP: Record<string, Record<string, string[]>> = {
    수능: {
      국어: ['문학', '독서', '화법과작문', '언어와매체'],
      수학: ['수학I', '수학II', '미적분', '확률과통계', '기하'],
      영어: ['독해', '어법', '어휘', '듣기'],
      한국사: ['전근대', '근현대'],
      사회탐구: [
        '생활과윤리',
        '윤리와사상',
        '한국지리',
        '세계지리',
        '동아시아사',
        '세계사',
        '정치와법',
        '경제',
        '사회문화',
      ],
      과학탐구: [
        '물리학I',
        '물리학II',
        '화학I',
        '화학II',
        '생명과학I',
        '생명과학II',
        '지구과학I',
        '지구과학II',
      ],
    },
    내신: {
      국어: ['문학', '독서', '화법과작문', '언어와매체'],
      수학: ['수학I', '수학II', '미적분', '확률과통계', '기하'],
      영어: ['독해', '어법', '듣기'],
      통합사회: ['정치', '경제', '사회', '문화', '윤리'],
      통합과학: ['물리', '화학', '생명', '지구과학'],
    },
    '공무원 9급': {
      국어: ['문법', '독해', '문학', '어휘'],
      영어: ['독해', '어휘', '문법', '생활영어'],
      한국사: ['전근대', '근현대'],
      행정법: ['총론', '각론'],
      행정학: ['총론'],
    },
    '공무원 7급': {
      헌법: ['총론', '기본권', '통치구조'],
      경제학: ['미시', '거시'],
      행정법: ['총론', '각론'],
      국어: ['문법', '독해'],
      영어: ['독해', '어휘'],
      한국사: ['전근대', '근현대'],
    },
    공기업: {
      NCS직업기초: [
        '의사소통능력',
        '수리능력',
        '문제해결능력',
        '자원관리능력',
        '정보능력',
        '조직이해능력',
        '직업윤리',
      ],
      전공: ['경영', '경제', '행정', '법'],
    },
    한능검: {
      한국사: ['선사', '고대', '고려', '조선', '근대', '일제강점기', '현대'],
    },
    토익: {
      LC: ['Part1_사진', 'Part2_응답', 'Part3_대화', 'Part4_설명문'],
      RC: ['Part5_문법', 'Part6_빈칸', 'Part7_독해'],
    },
  };
  type Subj = { id: string; name: string };
  const subjects: Subj[] = [];
  const subjectRows: any[] = [];
  let so = 0;
  for (const [examType, cats] of Object.entries(EXAM_MAP)) {
    for (const [examCategory, subs] of Object.entries(cats)) {
      for (const name of subs) {
        const id = randomUUID();
        subjectRows.push({ id, examType, examCategory, name, sortOrder: so++ });
        subjects.push({ id, name: `${examType}/${examCategory}/${name}` });
      }
    }
  }
  await chunkCreate(prisma.subject, subjectRows);

  // --- 4. Tags (출처/난이도/유형/단원/과목, 대폭 확장) ----------------------
  console.log('🏷️  tags...');
  const TAG_CATS: Record<string, string[]> = {
    출처: ['기출', '평가원', '교육청', 'EBS', '사설', 'N제', '수능특강', '수능완성', 'LEET', '모의고사', '교과서'],
    난이도: ['최고난도', '고난도', '중상', '중간', '기본', '심화', '개념'],
    유형: [
      '킬러',
      '준킬러',
      '계산',
      '그래프',
      '추론',
      '빈칸',
      '순서',
      '문장삽입',
      '단답형',
      '서술형',
      '자료해석',
      '사례적용',
      '어법',
      '어휘',
      '주제파악',
      '세부내용',
    ],
    단원: [
      '문학',
      '독서',
      '화법과작문',
      '언어와매체',
      '미적분',
      '확률과통계',
      '기하',
      '수학I',
      '수학II',
      '역학',
      '전자기',
      '유전',
      '생태',
      '지구시스템',
      '사료',
      '도표',
    ],
    과목: ['국어', '수학', '영어', '한국사', '사회', '과학', '행정법', '행정학'],
  };
  const tags: { id: string; name: string }[] = [];
  const tagRows: any[] = [];
  for (const [category, names] of Object.entries(TAG_CATS)) {
    for (const name of names) {
      const id = randomUUID();
      tagRows.push({ id, name, category });
      tags.push({ id, name });
    }
  }
  await chunkCreate(prisma.tag, tagRows);

  // --- 5. AiGeneration (~10) -----------------------------------------------
  console.log('🤖 ai_generations...');
  const MODELS = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'];
  const genIds: string[] = [];
  const genRows = Array.from({ length: 10 }, () => {
    const id = randomUUID();
    genIds.push(id);
    const r = Math.random();
    return {
      id,
      creatorId: pick(creators).id,
      subjectId: pick(subjects).id,
      inputParams: {
        type: 'question-generation',
        count: randInt(1, 10),
        difficulty: randInt(1, 5),
      },
      model: pick(MODELS),
      status: r < 0.7 ? GenerationStatus.COMPLETED : r < 0.9 ? GenerationStatus.PENDING : GenerationStatus.FAILED,
    };
  });
  await chunkCreate(prisma.aiGeneration, genRows);

  // --- 6. Passages (~15) ----------------------------------------------------
  console.log('📄 passages...');
  const passageIds: string[] = [];
  const passageRows = Array.from({ length: 15 }, (_, i) => {
    const id = randomUUID();
    passageIds.push(id);
    return {
      id,
      creatorId: pick(creators).id,
      generationId: chance(0.5) ? pick(genIds) : null,
      content: multiDoc([
        `데모 지문 ${i + 1} — 첫 단락. 글쓴이는 주제를 제시한다.`,
        '둘째 단락. 근거와 예시를 들어 논지를 전개한다.',
        '셋째 단락. 앞선 논의를 종합하여 결론을 내린다.',
      ]),
      status: chance(0.8) ? PassageStatus.PUBLISHED : PassageStatus.DRAFT,
    };
  });
  await chunkCreate(prisma.passage, passageRows);

  // --- 7. Questions (~80: 70% 객관식 / 20% 단답 / 10% 서술) ------------------
  console.log('❓ questions...');
  const DIFF_POOL = [1, 2, 3, 3, 3, 4, 5];
  const SHORT_ANS = ['서울', '고향', '은유', '수미상관', '기승전결', '역설', '대비'];
  const choicesArr = (correctIdx: number) =>
    ['c1', 'c2', 'c3', 'c4', 'c5'].map((cid, i) => ({
      id: cid,
      content: doc(`보기 ${i + 1}`),
      isCorrect: i === correctIdx,
    }));
  type Q = { id: string; type: string; correctIdx: number; correctAnswerText: string | null };
  const questions: Q[] = [];
  const questionRows: any[] = [];
  for (let i = 0; i < 80; i++) {
    const id = randomUUID();
    const r = Math.random();
    const type = r < 0.7 ? OBJECTIVE : SUBJECTIVE;
    const shortAns = type === SUBJECTIVE && r < 0.9; // 주관식 중 단답형(자동채점)
    const correctIdx = randInt(0, 4);
    const correctAnswerText = type === OBJECTIVE ? null : shortAns ? pick(SHORT_ANS) : null;
    const total = randInt(0, 200);
    const correct = total ? randInt(Math.floor(total * 0.3), Math.floor(total * 0.9)) : 0;
    const stemText = `데모 ${type} ${i + 1}: 윗글에 대한 설명으로 적절한 것은?`;
    questions.push({ id, type, correctIdx, correctAnswerText });
    questionRows.push({
      id,
      creatorId: pick(creators).id,
      subjectId: pick(subjects).id,
      generationId: chance(0.3) ? pick(genIds) : null,
      passageId: chance(0.4) ? pick(passageIds) : null,
      questionType: type,
      stem: doc(stemText),
      choices: type === OBJECTIVE ? choicesArr(correctIdx) : undefined,
      correctAnswerText,
      explanation: doc('해설: 지문의 근거를 참고하세요.'),
      hintContent: chance(0.5) ? '핵심 소재의 의미에 주목하세요.' : null,
      difficulty: pick(DIFF_POOL),
      points: pick([1, 1, 2, 3]),
      status: chance(0.85) ? QuestionStatus.PUBLISHED : QuestionStatus.DRAFT,
      publishedAt: new Date(),
      searchText: stemText,
      totalSolvedCount: total,
      correctSolvedCount: correct,
      viewCount: total * 3 + randInt(0, 50),
      totalTimeSpentSec: total * 70,
      timedSolvedCount: total,
    });
  }
  await chunkCreate(prisma.question, questionRows);
  const publishedQ = questions; // 데모 단순화: 스냅샷/문제집은 published 여부 무시하고 사용
  const objQ = questions.filter((q) => q.type === OBJECTIVE);

  // 태그 매핑 (문항당 0~3개)
  const qtRows: any[] = [];
  const qtSeen = new Set<string>();
  for (const q of questions) {
    for (const t of sample(tags, randInt(0, 3))) {
      const k = `${q.id}:${t.id}`;
      if (qtSeen.has(k)) continue;
      qtSeen.add(k);
      qtRows.push({ questionId: q.id, tagId: t.id });
    }
  }
  await chunkCreate(prisma.questionTag, qtRows);

  // 선지 분포 캐시 (객관식 일부)
  const csRows: any[] = [];
  for (const q of sample(objQ, 15)) {
    for (const cid of ['c1', 'c2', 'c3', 'c4', 'c5']) {
      csRows.push({ questionId: q.id, choiceId: cid, count: randInt(0, 40) });
    }
  }
  await chunkCreate(prisma.questionChoiceStat, csRows);

  // --- 8. MediaAsset (~15) --------------------------------------------------
  console.log('🖼️  media_assets...');
  const mediaRows = Array.from({ length: 15 }, () => {
    const r = Math.random();
    return {
      id: randomUUID(),
      uploaderId: pick(users).id,
      assetType: MediaAssetType.IMAGE,
      storageUrl: `https://demo.supabase.co/storage/v1/object/public/media/${randomUUID()}.png`,
      widthPx: randInt(400, 1200),
      heightPx: randInt(300, 900),
      passageId: r < 0.3 ? pick(passageIds) : null,
      questionId: r >= 0.3 && r < 0.6 ? pick(questions).id : null,
      generationId: r >= 0.6 && r < 0.8 ? pick(genIds) : null,
    };
  });
  await chunkCreate(prisma.mediaAsset, mediaRows);

  // --- 9. Workbooks (~12) + WorkbookQuestion --------------------------------
  console.log('📓 workbooks...');
  const wbIds: string[] = [];
  const wbRows: any[] = [];
  const wqRows: any[] = [];
  for (let i = 0; i < 12; i++) {
    const id = randomUUID();
    wbIds.push(id);
    const picks = sample(publishedQ, randInt(5, 15));
    const attempts = randInt(0, 20);
    wbRows.push({
      id,
      ownerId: pick(creators).id,
      title: `데모 문제집 ${i + 1}`,
      description: '시현/테스트용 데모 문제집.',
      visibility: chance(0.7) ? 'PUBLIC' : 'PRIVATE',
      viewCount: randInt(0, 500),
      forkCount: randInt(0, 20),
      questionCount: picks.length,
      attemptCount: attempts,
      scoreSumPercent: attempts ? attempts * randInt(40, 90) : 0,
      publishedAt: new Date(),
    });
    picks.forEach((q, idx) => wqRows.push({ workbookId: id, questionId: q.id, displayOrder: idx + 1 }));
  }
  await chunkCreate(prisma.workbook, wbRows);
  await chunkCreate(prisma.workbookQuestion, wqRows);

  // --- 10. ExamSession + Questions + Answers (~12) --------------------------
  console.log('📝 exam_sessions...');
  const snap = (q: Q) => ({
    questionType: q.type,
    stem: doc(q.id),
    choices: q.type === OBJECTIVE ? choicesArr(q.correctIdx) : undefined,
    explanation: doc('해설'),
    correctAnswerText: q.correctAnswerText,
    points: 1,
    difficulty: 3,
  });
  // 세션별 (userId, xp증가) 기록 → XP 원장/유저 xp 갱신에 사용
  const sessionsForXp: { userId: string; sessionId: string; gained: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const sid = randomUUID();
    const user = pick(consumers);
    const useWb = chance(0.5);
    const wbId = useWb ? pick(wbIds) : null;
    const submitted = chance(0.75);
    const picks = sample(publishedQ, randInt(3, 6));
    await prisma.examSession.create({
      data: {
        id: sid,
        userId: user.id,
        subjectId: chance(0.5) ? pick(subjects).id : null,
        workbookId: wbId,
        isReview: chance(0.2),
        filterCriteria: { source: useWb ? 'workbook' : 'filter', questionCount: picks.length },
        status: submitted ? ExamSessionStatus.SUBMITTED : ExamSessionStatus.IN_PROGRESS,
        startedAt: new Date(Date.now() - 3600_000),
        submittedAt: submitted ? new Date(Date.now() - 3000_000) : null,
        durationSec: submitted ? randInt(300, 1200) : null,
      },
    });
    const sqRows: any[] = [];
    const ansRows: any[] = [];
    let gained = 0;
    picks.forEach((q, idx) => {
      const sqId = randomUUID();
      sqRows.push({
        id: sqId,
        examSessionId: sid,
        questionId: q.id,
        displayOrder: idx + 1,
        snapshot: snap(q),
        isHintUsed: chance(0.2),
      });
      if (!submitted) return;
      // 채점: 객관식=선택 vs 정답선지, 단답=문자열, 서술형=null(자기채점 전)
      let isCorrect: boolean | null;
      let selectedChoiceIds: string[] | null = null;
      let answerText: string | null = null;
      if (q.type === OBJECTIVE) {
        const selIdx = randInt(0, 4);
        selectedChoiceIds = [`c${selIdx + 1}`];
        isCorrect = selIdx === q.correctIdx;
      } else if (q.correctAnswerText) {
        answerText = chance(0.5) ? q.correctAnswerText : '오답';
        isCorrect = answerText === q.correctAnswerText;
      } else {
        answerText = '서술형 답안 예시입니다.';
        isCorrect = null;
      }
      if (isCorrect) gained += 10;
      ansRows.push({
        id: randomUUID(),
        examSessionQuestionId: sqId,
        selectedChoiceIds,
        answerText,
        isCorrect,
        timeSpentSec: randInt(30, 180),
        answeredAt: new Date(Date.now() - 3100_000),
      });
    });
    await chunkCreate(prisma.examSessionQuestion, sqRows);
    await chunkCreate(prisma.examSessionAnswer, ansRows);
    if (submitted && gained) sessionsForXp.push({ userId: user.id, sessionId: sid, gained });
  }

  // --- 11. XpHistory + 유저 xp/level 동기화 + Milestones --------------------
  console.log('⭐ xp_history / milestones...');
  const xpRows: any[] = [];
  const balByUser = new Map<string, number>();
  for (const s of sessionsForXp) {
    const bal = (balByUser.get(s.userId) ?? 0) + s.gained;
    balByUser.set(s.userId, bal);
    xpRows.push({
      id: randomUUID(),
      userId: s.userId,
      amount: s.gained,
      reason: 'SESSION_SUBMIT',
      balanceAfter: bal,
      breakdown: { solve: s.gained },
      examSessionId: s.sessionId,
    });
  }
  await chunkCreate(prisma.xpHistory, xpRows);
  // 원장 최종 잔액으로 유저 xp/level 재동기화(있는 사용자만)
  for (const [userId, bal] of balByUser) {
    await prisma.user.update({ where: { id: userId }, data: { xp: bal, level: levelForXp(bal) } });
  }

  // 마일스톤: 각 컨슈머의 현재 xp/최장스트릭 기준 달성분 기록
  const MS_LEVEL: [string, number][] = [
    ['LEVEL_2', 100],
    ['LEVEL_3', 300],
    ['LEVEL_4', 600],
    ['LEVEL_5', 1000],
    ['LEVEL_10', 5000],
    ['LEVEL_20', 15000],
  ];
  const msRows: any[] = [];
  const freshUsers = await prisma.user.findMany({
    where: { id: { in: consumers.map((c) => c.id) } },
    select: { id: true, xp: true, longestStreak: true },
  });
  for (const u of freshUsers) {
    for (const [key, min] of MS_LEVEL) if (u.xp >= min) msRows.push({ userId: u.id, milestoneKey: key });
    if (u.longestStreak >= 7) msRows.push({ userId: u.id, milestoneKey: 'STREAK_7' });
    if (u.longestStreak >= 30) msRows.push({ userId: u.id, milestoneKey: 'STREAK_30' });
  }
  await chunkCreate(prisma.milestoneAchievement, msRows);

  // --- 12. Reviews / Comments / Annotations (~30씩) -------------------------
  console.log('💬 reviews / comments / annotations...');
  const reviewRows: any[] = [];
  const revSeen = new Set<string>();
  while (reviewRows.length < 30) {
    const q = pick(questions);
    const u = pick(consumers);
    const k = `${q.id}:${u.id}`;
    if (revSeen.has(k)) continue;
    revSeen.add(k);
    reviewRows.push({
      id: randomUUID(),
      questionId: q.id,
      reviewerId: u.id,
      rating: randInt(3, 5),
      perceivedDifficulty: randInt(1, 5),
      reviewText: pick(['좋은 문제네요.', '근거가 명확합니다.', '조금 헷갈렸어요.', null]),
    });
  }
  await chunkCreate(prisma.questionReview, reviewRows);

  const commentRows = Array.from({ length: 30 }, () => ({
    id: randomUUID(),
    questionId: pick(questions).id,
    authorId: pick(consumers).id,
    content: pick(['이 선지가 헷갈렸어요.', '해설 감사합니다.', '난이도 적절하네요.', '2번이 답 아닌가요?']),
  }));
  await chunkCreate(prisma.questionComment, commentRows);

  const REASONS = ['CONCEPT', 'MISTAKE', 'TIME', 'OTHER'];
  const annoRows = Array.from({ length: 30 }, () => ({
    id: randomUUID(),
    userId: pick(consumers).id,
    questionId: pick(questions).id,
    target: pick(['STEM', 'CHOICES', 'PASSAGE', 'EXPLANATION']),
    markStyle: pick(['HIGHLIGHT', 'UNDERLINE']),
    color: pick(['yellow', 'pink', 'blue', 'green']),
    selectedText: '헷갈린 부분',
    reasonCode: pick(REASONS),
    memoText: pick(['개념 복습 필요', '실수 주의', '시간 배분 실패', null]),
  }));
  await chunkCreate(prisma.userQuestionAnnotation, annoRows);

  // --- 요약 ----------------------------------------------------------------
  const c = {
    users: users.length,
    subjects: subjectRows.length,
    tags: tagRows.length,
    aiGenerations: genRows.length,
    passages: passageRows.length,
    questions: questionRows.length,
    workbooks: wbRows.length,
    reviews: reviewRows.length,
  };
  console.log('✅ seed done', c);
  console.log(`   로그인: admin@ / creator@ / consumer@demo.io  (pw: ${DEMO_PASSWORD})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
