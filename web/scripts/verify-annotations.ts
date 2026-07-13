/**
 * 어노테이션 코어 종단 검증 (인프라 불필요).
 * walkTextSegments 오프셋 ↔ resolveAnnotation 3-status ↔ AnnotatedText 마크 분할이
 * 실제 ProseMirror 데이터에서 맞물리는지 검증한다.
 * 실행: cd web && npx --yes tsx scripts/verify-annotations.ts
 */
import { extractPlainText, walkTextSegments } from '../lib/prosemirror';
import { resolveAnnotation, type AnchorStatus } from '../lib/annotations';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('  ✗ FAIL:', msg);
  }
};

// 현실적 발문 doc — 다문단 + 한 문단 내 다중 텍스트 노드
const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: '다음 글의 화자는 ' }, { type: 'text', text: '상실의 슬픔' }, { type: 'text', text: '을 절제된 어조로 드러낸다.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '이때 반복되는 시어가 핵심이다.' }] },
  ],
};

const plain = extractPlainText(doc);
console.log('평문:', JSON.stringify(plain));

// ── 1. walkTextSegments 오프셋이 평문과 정확히 일치 ──
const segs = walkTextSegments(doc);
for (const s of segs) {
  ok(plain.slice(s.start, s.end) === s.text, `세그먼트 오프셋 불일치 @${s.start}: ${JSON.stringify(s.text)}`);
}
// 블록 사이 '\n' 1글자 반영 → 둘째 문단 시작 오프셋 검증
const secondStart = plain.indexOf('이때');
ok(secondStart === plain.length - '이때 반복되는 시어가 핵심이다.'.length, '둘째 문단 오프셋 = 첫문단+개행');
console.log(`1) walkTextSegments 오프셋 정합: ${segs.length} 세그먼트`);

// 헬퍼 — 평문 부분문자열로 앵커 만들기(프론트가 저장하는 방식과 동일: start/end + selectedText)
const anchorFor = (needle: string, id: string, color: string, createdAt: string) => {
  const start = plain.indexOf(needle);
  return {
    id,
    target: 'STEM',
    targetId: null,
    color,
    markStyle: 'HIGHLIGHT',
    selectedText: needle,
    selectionRange: { start, end: start + needle.length },
    createdAt,
  };
};

// ── 2. NORMAL: 저장 당시 그대로면 오프셋 위치 == selectedText ──
const a1 = anchorFor('상실의 슬픔', 'a1', 'yellow', '2026-07-12T01:00:00Z');
const r1 = resolveAnnotation(plain, a1)!;
ok(r1.status === 'NORMAL', `NORMAL 기대, got ${r1?.status}`);
ok(plain.slice(r1.start, r1.end) === '상실의 슬픔', 'NORMAL 슬라이스 == selectedText');
console.log('2) NORMAL 해석 OK');

// ── 3. RECOVERED: 문항 앞에 텍스트 삽입돼 오프셋이 밀렸을 때 재검색 복구 ──
const shiftedPlain = '[개정] ' + plain; // 앞에 6글자 삽입 → 저장된 오프셋이 어긋남
const r2 = resolveAnnotation(shiftedPlain, a1);
ok(r2 !== null && r2.status === 'RECOVERED', `RECOVERED 기대, got ${r2?.status}`);
ok(!!r2 && shiftedPlain.slice(r2.start, r2.end) === '상실의 슬픔', 'RECOVERED 슬라이스 == selectedText');
console.log('3) RECOVERED(오프셋 이동 후 재검색) OK');

// ── 4. LOST: selectedText가 사라지면 마크 생략 + 데이터 보존 ──
const rewritten = extractPlainText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '완전히 다른 문항으로 교체됨.' }] }] });
const r3 = resolveAnnotation(rewritten, a1);
ok(r3 !== null && r3.status === 'LOST', `LOST 기대, got ${r3?.status}`);
console.log('4) LOST(문항 교체) OK — 데이터는 삭제되지 않고 status만 LOST');

// ── 5. GENERAL(앵커 없음) → null ──
const rGen = resolveAnnotation(plain, { selectionRange: undefined, selectedText: null });
ok(rGen === null, 'GENERAL(앵커 없음)은 null');
console.log('5) GENERAL null OK');

// ── 6. AnnotatedText 마크 분할 로직 재현 — 텍스트 무손실 + 겹침 최신 우선 ──
// 겹치는 두 주석: a2(오래됨, 넓음) / a3(최신, 좁음, 안쪽). createdAt ASC → a3가 위.
const a2 = anchorFor('상실의 슬픔을 절제된', 'a2', 'yellow', '2026-07-12T02:00:00Z');
const a3 = anchorFor('슬픔', 'a3', 'emerald', '2026-07-12T03:00:00Z');

function resolveMarks(anns: any[], target: string, targetId: string | null) {
  return anns
    .filter((a) => a.target === target && (a.targetId ?? null) === (targetId ?? null))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((a) => ({ ann: a, anchor: resolveAnnotation(plain, a) }))
    .filter((m) => m.anchor && m.anchor.status !== 'LOST')
    .map((m) => ({ ann: m.ann, start: m.anchor!.start, end: m.anchor!.end }));
}

// AnnotatedText.renderSegment 와 동일한 cut 알고리즘
function renderPieces(marks: { ann: any; start: number; end: number }[]) {
  const pieces: { text: string; markId: string | null; start: number; end: number }[] = [];
  for (const seg of segs) {
    const cuts = new Set<number>([seg.start, seg.end]);
    for (const m of marks) {
      if (m.start > seg.start && m.start < seg.end) cuts.add(m.start);
      if (m.end > seg.start && m.end < seg.end) cuts.add(m.end);
    }
    const pts = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i];
      const e = pts[i + 1];
      const text = seg.text.slice(s - seg.start, e - seg.start);
      const covering = marks.filter((m) => m.start <= s && m.end >= e);
      const top = covering[covering.length - 1];
      pieces.push({ text, markId: top ? top.ann.id : null, start: s, end: e });
    }
  }
  return pieces;
}

const marks = resolveMarks([a2, a3], 'STEM', null);
const pieces = renderPieces(marks);

// 6a. 렌더 조각을 이으면 원본 평문 그대로(문단 결합은 '\n' 제외 — 세그먼트만 합산)
const segsPlain = segs.map((s) => s.text).join('');
ok(pieces.map((p) => p.text).join('') === segsPlain, '렌더 조각 이음 == 세그먼트 평문(무손실/무중복)');

// 6b. '슬픔' 구간은 a3(최신)가 이겨야 함
const seulpumPiece = pieces.find((p) => p.text === '슬픔');
ok(!!seulpumPiece && seulpumPiece.markId === 'a3', `겹침 구간 '슬픔'은 최신 a3 소유, got ${seulpumPiece?.markId}`);

// 6c. '상실의 ' 구간(a2만 덮음)은 a2 소유
const sangsilPiece = pieces.find((p) => p.text === '상실의 ');
ok(!!sangsilPiece && sangsilPiece.markId === 'a2', `'상실의 '는 a2 소유, got ${sangsilPiece?.markId}`);

// 6d. 마크 밖 구간은 없음(null)
const outside = pieces.find((p) => p.text.includes('화자'));
ok(!!outside && outside.markId === null, '마크 밖 텍스트는 소유자 없음');
console.log('6) 마크 분할: 무손실 + 겹침 최신우선 + 경계 정확 OK');

// ── 결과 ──
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
if (fail > 0) process.exit(1);
