/**
 * 마스터 데이터 주입 — **운영에서 돌릴 수 있는** 시드(#24 결정).
 *
 * `prisma/seed.ts`는 `deleteMany()`로 전체를 지우고 재생성하므로 운영에 못 돌린다.
 * 배포 명령은 `prisma db push --skip-generate && node dist/main.js`뿐이라 데이터 주입
 * 단계가 아예 없다. 그래서 upsert만 하는 별도 스크립트를 두고 배포 후 수동 실행한다.
 *
 *   npm run seed:master
 *
 * 규칙 셋:
 *   1. **지우지 않는다.** deleteMany 금지. 사용자 데이터가 섞인 테이블을 건드리는
 *      스크립트에 삭제를 두면 언젠가 사고가 난다.
 *   2. **몇 번 돌려도 같다.** 전부 upsert / 조건부 update. 배포마다 무심코 돌려도 안전해야
 *      "이번엔 돌려도 되나?"를 매번 판단하지 않는다.
 *   3. **무엇을 바꿨는지 센다.** 조용히 0건 처리하고 성공으로 끝나는 게 제일 나쁘다.
 */
import { PrismaClient } from '@prisma/client';
import { RENAMED_TAG_CATEGORIES, TAG_CATEGORIES } from '../src/common/constants/tag';

const prisma = new PrismaClient();

/**
 * 폐기된 태그 카테고리를 정본 이름으로 옮긴다(#24: '유형' → '출제기법').
 *
 * 단순 `UPDATE tags SET category=...`로는 안 된다. `@@unique([category, name])`이 있어서
 * ('유형','킬러')와 ('출제기법','킬러')가 둘 다 있으면 업데이트가 P2002로 터진다.
 * 그리고 그 충돌이야말로 흔한 경우다 — 이름을 바꾸기 시작한 뒤 만들어진 태그들이 있으니까.
 *
 * 그래서 충돌하면 **병합**한다: 붙어 있던 문항·문제집을 정본 태그로 옮기고 구 태그를 지운다.
 * 옮길 때 이미 같은 (문항, 정본태그) 행이 있을 수 있어 `skipDuplicates`가 필요하다 —
 * 한 문항에 두 이름의 같은 태그가 다 붙어 있던 경우다.
 */
async function migrateRenamedTagCategories(): Promise<void> {
  for (const [oldCategory, newCategory] of Object.entries(RENAMED_TAG_CATEGORIES)) {
    const stale = await prisma.tag.findMany({
      where: { category: oldCategory },
      select: { id: true, name: true },
    });
    if (stale.length === 0) {
      console.log(`  · '${oldCategory}' 태그 없음 — 건너뜀`);
      continue;
    }

    let renamed = 0;
    let merged = 0;
    for (const tag of stale) {
      const canonical = await prisma.tag.findUnique({
        where: { category_name: { category: newCategory, name: tag.name } },
        select: { id: true },
      });

      if (!canonical) {
        await prisma.tag.update({ where: { id: tag.id }, data: { category: newCategory } });
        renamed += 1;
        continue;
      }

      // 정본이 이미 있다 → 부착 관계를 옮기고 구 태그를 지운다.
      const [questionLinks, workbookLinks] = await Promise.all([
        prisma.questionTag.findMany({ where: { tagId: tag.id }, select: { questionId: true } }),
        prisma.workbookTag.findMany({ where: { tagId: tag.id }, select: { workbookId: true } }),
      ]);
      if (questionLinks.length) {
        await prisma.questionTag.createMany({
          data: questionLinks.map((l) => ({ questionId: l.questionId, tagId: canonical.id })),
          skipDuplicates: true,
        });
      }
      if (workbookLinks.length) {
        await prisma.workbookTag.createMany({
          data: workbookLinks.map((l) => ({ workbookId: l.workbookId, tagId: canonical.id })),
          skipDuplicates: true,
        });
      }
      // 구 태그 삭제 — question_tags/workbook_tags는 onDelete: Cascade라 함께 정리된다.
      await prisma.tag.delete({ where: { id: tag.id } });
      merged += 1;
    }
    console.log(
      `  · '${oldCategory}' → '${newCategory}': 개명 ${renamed}건, 정본으로 병합 ${merged}건`,
    );
  }
}

/** 정본 목록 밖의 카테고리가 남아 있으면 알린다(막지는 않는다 — 사람이 판단할 일). */
async function reportUnknownCategories(): Promise<void> {
  const rows = await prisma.tag.groupBy({ by: ['category'], _count: { _all: true } });
  const unknown = rows.filter((r) => !(TAG_CATEGORIES as readonly string[]).includes(r.category));
  if (unknown.length === 0) {
    console.log('  · 정본 밖 카테고리 없음');
    return;
  }
  console.log('  ⚠️  정본 목록에 없는 카테고리가 남아 있습니다:');
  for (const r of unknown) {
    console.log(`     - '${r.category}' (${r._count._all}건)`);
  }
  console.log(
    "     정본으로 옮길 것이면 src/common/constants/tag.ts 의 RENAMED_TAG_CATEGORIES에 추가하고 다시 실행하세요.",
  );
}

async function main(): Promise<void> {
  console.log('🏷️  태그 카테고리 정리...');
  await migrateRenamedTagCategories();
  await reportUnknownCategories();
  console.log('✅ 마스터 시드 완료');
}

main()
  .catch((e) => {
    console.error('❌ 마스터 시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
