import { PrismaClient, UserRoleType, QuestionStatus } from '@prisma/client';

const prisma = new PrismaClient();

// 유형은 VARCHAR("객관식" | "주관식")로 저장한다.
const OBJECTIVE = '객관식';
const SUBJECTIVE = '주관식';

async function main() {
  // 데모 유저
  const creator = await prisma.user.upsert({
    where: { email: 'creator@demo.io' },
    update: {},
    create: {
      email: 'creator@demo.io',
      passwordHash: '$2a$10$seeddemohashplaceholderseeddemohashplaceholderxxxxxx',
      nickname: '데모출제자',
      roles: { create: [{ role: UserRoleType.CREATOR }, { role: UserRoleType.CONSUMER }] },
    },
  });
  await prisma.user.upsert({
    where: { email: 'consumer@demo.io' },
    update: {},
    create: {
      email: 'consumer@demo.io',
      passwordHash: '$2a$10$seeddemohashplaceholderseeddemohashplaceholderxxxxxx',
      nickname: '데모응시자',
      roles: { create: [{ role: UserRoleType.CONSUMER }] },
    },
  });

  // 세부과목 시드 (exam_category=대분류, name=세부과목)
  const 문학 = await prisma.subject.upsert({
    where: { id: 'seed-subj-lit' },
    update: {},
    create: { id: 'seed-subj-lit', name: '문학', examCategory: '국어', sortOrder: 1 },
  });
  const 언매 = await prisma.subject.upsert({
    where: { id: 'seed-subj-lang' },
    update: {},
    create: { id: 'seed-subj-lang', name: '언어와매체', examCategory: '국어', sortOrder: 2 },
  });

  // PUBLISHED 문항 (ProseMirror JSON 최소형)
  const doc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  const choices = () => [
    { id: 'c1', content: doc('보기 1'), isCorrect: true },
    { id: 'c2', content: doc('보기 2'), isCorrect: false },
    { id: 'c3', content: doc('보기 3'), isCorrect: false },
    { id: 'c4', content: doc('보기 4'), isCorrect: false },
  ];

  // 객관식 4개
  for (let i = 0; i < 4; i++) {
    const id = `seed-q-obj-${i}`;
    await prisma.question.upsert({
      where: { id },
      update: {},
      create: {
        id,
        creatorId: creator.id,
        subjectId: i % 2 === 0 ? 문학.id : 언매.id,
        questionType: OBJECTIVE,
        stem: doc(`데모 객관식 ${i + 1}: 다음 중 옳은 것은?`),
        choices: choices(),
        explanation: doc('정답은 1번입니다.'),
        difficulty: (i % 5) + 1,
        status: QuestionStatus.PUBLISHED,
        publishedAt: new Date(),
        searchText: `데모 객관식 ${i + 1}`,
      },
    });
  }

  // 주관식 단답(자동채점용 정답 포함) 1개
  await prisma.question.upsert({
    where: { id: 'seed-q-subj-0' },
    update: {},
    create: {
      id: 'seed-q-subj-0',
      creatorId: creator.id,
      subjectId: 문학.id,
      questionType: SUBJECTIVE,
      stem: doc('데모 단답: 대한민국의 수도는?'),
      correctAnswerText: '서울',
      explanation: doc('정답은 서울입니다.'),
      difficulty: 2,
      status: QuestionStatus.PUBLISHED,
      publishedAt: new Date(),
      searchText: '데모 단답 수도',
    },
  });

  console.log('seed done');
}

main().finally(() => prisma.$disconnect());
