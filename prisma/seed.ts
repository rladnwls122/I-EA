import { PrismaClient, UserRoleType, QuestionType, QuestionStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 데모 유저
  const creator = await prisma.user.upsert({
    where: { email: 'creator@demo.io' },
    update: {},
    create: {
      email: 'creator@demo.io',
      nickname: '데모출제자',
      roles: { create: [{ role: UserRoleType.CREATOR }, { role: UserRoleType.CONSUMER }] },
    },
  });
  await prisma.user.upsert({
    where: { email: 'consumer@demo.io' },
    update: {},
    create: {
      email: 'consumer@demo.io',
      nickname: '데모응시자',
      roles: { create: [{ role: UserRoleType.CONSUMER }] },
    },
  });

  // 과목 + 단원 트리
  const subject = await prisma.subject.upsert({
    where: { id: 'seed-subject-math' },
    update: {},
    create: { id: 'seed-subject-math', name: '수학', examCategory: '수능', sortOrder: 1 },
  });
  const unit = await prisma.unit.upsert({
    where: { id: 'seed-unit-func' },
    update: {},
    create: { id: 'seed-unit-func', subjectId: subject.id, name: '함수', depth: 0, isLeaf: true },
  });
  const unit2 = await prisma.unit.upsert({
    where: { id: 'seed-unit-geo' },
    update: {},
    create: { id: 'seed-unit-geo', subjectId: subject.id, name: '기하', depth: 0, isLeaf: true },
  });

  // PUBLISHED 문항 5개 (ProseMirror JSON 최소형)
  const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const choices = () => [
    { id: 'c1', content: doc('보기 1'), isCorrect: true },
    { id: 'c2', content: doc('보기 2'), isCorrect: false },
    { id: 'c3', content: doc('보기 3'), isCorrect: false },
    { id: 'c4', content: doc('보기 4'), isCorrect: false },
  ];
  for (let i = 0; i < 5; i++) {
    const id = `seed-q-${i}`;
    await prisma.question.upsert({
      where: { id },
      update: {},
      create: {
        id,
        creatorId: creator.id,
        primaryUnitId: i % 2 === 0 ? unit.id : unit2.id,
        questionType: QuestionType.SINGLE_CHOICE,
        stem: doc(`데모 문항 ${i + 1}: 다음 중 옳은 것은?`),
        choices: choices(),
        explanation: doc('정답은 1번입니다.'),
        difficulty: (i % 5) + 1,
        status: QuestionStatus.PUBLISHED,
        publishedAt: new Date(),
        searchText: `데모 문항 ${i + 1}`,
      },
    });
  }
  console.log('seed done');
}

main().finally(() => prisma.$disconnect());
