/**
 * load-exam-studio.ts
 * ---------------------------------------------------------------------------
 * exam_studio_db_seed_data.json (구 스키마: units / SINGLE_CHOICE 등)을
 * 현재 Prisma 스키마(subjects 3단 분류 / question_type VARCHAR)로 매핑하여
 * MySQL(TiDB)에 "순차적으로"(FK 의존 순서, 행 단위 create) 적재한다.
 *
 * 원본 JSON 특성:
 *   - JSONC(주석 포함) + 파일이 마지막 question 중간에서 잘려 있음(truncated).
 *     -> 관용 파서로 완결된 레코드만 살려서 적재하고, 버린 개수를 로그로 남긴다.
 *   - question.primary_unit_id(리프 unit) -> 현재 Subject 1행
 *       examType     = json subject.exam_category  (예: "수능")
 *       examCategory = json subject.name           (예: "국어")
 *       name         = unit.name                   (소분류, 예: "음운의 변동과 한글맞춤법")
 *
 * 실행: npx ts-node prisma/load-exam-studio.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234!';
const SEED_FILE = path.join(__dirname, '..', 'exam_studio_db_seed_data.json');
// seed.ts와 동일하게 보호되는 계정(삭제 금지)
const PROTECTED_USER_ID = 'd8fadd1b-8c52-4b74-815d-29dbf31d75bc';

// ---------------------------------------------------------------------------
// 1) 관용 파서 — 주석 제거 + truncated 파일에서 완결 레코드만 살림
// ---------------------------------------------------------------------------
function stripComments(src: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++; // skip closing '/'
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * 주석 제거된 문자열을 스캔하며, 브래킷이 닫힐 때마다 그 지점까지의 접두어 +
 * 당시 열려있던 브래킷들을 역순으로 닫은 "복구된 JSON"을 후보로 기록한다.
 * 파일이 중간에 잘려도 마지막으로 완결된 지점까지를 유효 JSON으로 만든다.
 */
function tolerantParse(raw: string): any {
  const s = stripComments(raw);
  // 우선 그대로 시도
  try {
    return JSON.parse(s);
  } catch {
    /* fall through to salvage */
  }

  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let bestPrefixEnd = -1;
  let bestClosers = '';

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') {
      stack.pop();
      // s[0..i] 는 '}' 또는 ']' 로 끝남 -> 남은 스택을 닫으면 유효 후보
      bestPrefixEnd = i;
      bestClosers = [...stack].reverse().join('');
    }
  }

  if (bestPrefixEnd < 0) throw new Error('복구 불가: 유효한 닫힘 지점을 찾지 못함');
  const repaired = s.slice(0, bestPrefixEnd + 1) + bestClosers;
  return JSON.parse(repaired);
}

// ---------------------------------------------------------------------------
// 2) 삭제(FK 역순) — 보호 계정만 남긴다
// ---------------------------------------------------------------------------
async function clean() {
  await prisma.examSessionAnswer.deleteMany();
  await prisma.examSessionQuestion.deleteMany();
  await prisma.examSession.deleteMany();
  await prisma.userQuestionAnnotation.deleteMany();
  await prisma.questionComment.deleteMany();
  await prisma.questionReview.deleteMany();
  await prisma.questionChoiceStat.deleteMany();
  await prisma.workbookQuestion.deleteMany();
  await prisma.workbookTag.deleteMany();
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
  await prisma.userRole.deleteMany({ where: { userId: { not: PROTECTED_USER_ID } } });
  await prisma.user.deleteMany({ where: { id: { not: PROTECTED_USER_ID } } });
}

// ---------------------------------------------------------------------------
// 3) 메인
// ---------------------------------------------------------------------------
const mapQuestionType = (t: string): string =>
  t === 'SINGLE_CHOICE' || t === 'MULTIPLE_CHOICE' ? '객관식' : '주관식';

const asDate = (v: any): Date | undefined => (v ? new Date(v) : undefined);

async function main() {
  console.log('📖 원본 로드/파싱...');
  const raw = fs.readFileSync(SEED_FILE, 'utf8');
  const data = tolerantParse(raw);

  const jUsers: any[] = data.users ?? [];
  const jRoles: any[] = data.user_roles ?? [];
  const jSubjects: any[] = data.subjects ?? [];
  const jUnits: any[] = data.units ?? [];
  const jTags: any[] = data.tags ?? [];
  const jPassages: any[] = data.passages ?? [];
  const jQuestions: any[] = data.questions ?? [];

  console.log(
    `   파싱됨: users=${jUsers.length} roles=${jRoles.length} subjects=${jSubjects.length} ` +
      `units=${jUnits.length} tags=${jTags.length} passages=${jPassages.length} questions=${jQuestions.length}`,
  );

  console.log('🧹 기존 데이터 초기화(FK 역순)...');
  await clean();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // --- 조회 인덱스 -----------------------------------------------------------
  const subjectById = new Map<string, any>(jSubjects.map((s) => [s.id, s]));
  const unitById = new Map<string, any>(jUnits.map((u) => [u.id, u]));

  // --- users (순차) ----------------------------------------------------------
  console.log('👤 users...');
  const validUserIds = new Set<string>([PROTECTED_USER_ID]);
  let uOk = 0;
  for (const u of jUsers) {
    if (u.id === PROTECTED_USER_ID) {
      validUserIds.add(u.id);
      continue;
    }
    await prisma.user.create({
      data: {
        id: u.id,
        email: u.email,
        passwordHash,
        nickname: u.nickname ?? u.email?.split('@')[0] ?? 'user',
        creatorBio: u.creator_bio ?? null,
        createdAt: asDate(u.created_at),
        updatedAt: asDate(u.updated_at),
      },
    });
    validUserIds.add(u.id);
    uOk++;
  }

  // --- user_roles (순차, 존재하는 유저만) ------------------------------------
  console.log('🔑 user_roles...');
  let rOk = 0;
  for (const r of jRoles) {
    if (!validUserIds.has(r.user_id)) continue;
    await prisma.userRole.create({
      data: { userId: r.user_id, role: r.role },
    });
    rOk++;
  }

  // --- subjects: 참조된 unit -> 현재 Subject 1행 ------------------------------
  //   질문이 참조하는 primary_unit_id 집합만 대상으로, (examType,examCategory,name)
  //   유니크로 dedupe. unitId -> subjectId 매핑을 만든다.
  console.log('📚 subjects (units 매핑)...');
  const unitToSubjectId = new Map<string, string>();
  const tripleToSubjectId = new Map<string, string>();
  const referencedUnitIds = new Set<string>(
    jQuestions.map((q) => q.primary_unit_id).filter(Boolean),
  );
  let sOk = 0;
  let sortSeq = 0;
  for (const unitId of referencedUnitIds) {
    const unit = unitById.get(unitId);
    if (!unit) continue;
    const jSub = subjectById.get(unit.subject_id);
    const examType = jSub?.exam_category ?? '수능'; // json subject.exam_category = 시험(수능)
    const examCategory = jSub?.name ?? '기타'; // json subject.name = 대분류(국어..)
    const name = unit.name; // 소분류
    const triple = `${examType}|${examCategory}|${name}`;
    let subjectId = tripleToSubjectId.get(triple);
    if (!subjectId) {
      const newId: string = unit.id; // 안정적 PK로 unit.id 재사용
      await prisma.subject.create({
        data: {
          id: newId,
          examType,
          examCategory,
          name,
          sortOrder: unit.sort_order ?? sortSeq++,
          isActive: true,
        },
      });
      tripleToSubjectId.set(triple, newId);
      subjectId = newId;
      sOk++;
    }
    unitToSubjectId.set(unitId, subjectId);
  }

  // --- tags (순차) -----------------------------------------------------------
  console.log('🏷️  tags...');
  let tOk = 0;
  for (const t of jTags) {
    await prisma.tag.create({
      data: { id: t.id, name: t.name, category: t.category ?? 'concept' },
    });
    tOk++;
  }

  // --- passages (순차, 존재하는 유저만) --------------------------------------
  console.log('📄 passages...');
  const validPassageIds = new Set<string>();
  let pOk = 0;
  for (const p of jPassages) {
    if (!validUserIds.has(p.creator_id)) continue;
    await prisma.passage.create({
      data: {
        id: p.id,
        creatorId: p.creator_id,
        content: p.content,
        status: (p.status ?? 'PUBLISHED') as any,
        createdAt: asDate(p.created_at),
        updatedAt: asDate(p.updated_at),
      },
    });
    validPassageIds.add(p.id);
    pOk++;
  }

  // --- questions (순차) ------------------------------------------------------
  console.log('📝 questions...');
  let qOk = 0;
  const skipped: string[] = [];
  for (const q of jQuestions) {
    const subjectId = unitToSubjectId.get(q.primary_unit_id);
    if (!subjectId) {
      skipped.push(`${q.id} (subject 매핑 없음: unit=${q.primary_unit_id})`);
      continue;
    }
    if (!validUserIds.has(q.creator_id)) {
      skipped.push(`${q.id} (creator 없음: ${q.creator_id})`);
      continue;
    }
    const passageId =
      q.passage_id && validPassageIds.has(q.passage_id) ? q.passage_id : null;
    await prisma.question.create({
      data: {
        id: q.id,
        creatorId: q.creator_id,
        subjectId,
        passageId,
        questionType: mapQuestionType(q.question_type),
        stem: q.stem,
        choices: q.choices ?? undefined,
        explanation: q.explanation ?? undefined,
        difficulty: q.difficulty ?? 3,
        points: q.points ?? 1.0,
        status: (q.status ?? 'PUBLISHED') as any,
        metadata: q.metadata ?? undefined,
        searchText: q.search_text ?? null,
        publishedAt: q.status === 'PUBLISHED' ? asDate(q.created_at) : undefined,
        createdAt: asDate(q.created_at),
        updatedAt: asDate(q.updated_at),
      },
    });
    qOk++;
  }

  console.log('✅ load-exam-studio 완료', {
    users: uOk,
    userRoles: rOk,
    subjects: sOk,
    tags: tOk,
    passages: pOk,
    questions: qOk,
    questionsSkipped: skipped.length,
  });
  if (skipped.length) {
    console.log('   ⚠️ 건너뛴 questions:');
    for (const s of skipped) console.log('     -', s);
  }
  console.log(`   로그인 비밀번호(모든 시드 계정): ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
