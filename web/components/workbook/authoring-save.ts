/**
 * 캔버스 저장의 **순수 로직** (#41 Phase 3).
 *
 * `handleSave`는 154줄짜리 함수 하나에 사전검증·지문 영속화·태그 find-or-create·
 * 문항 저장이 뒤엉켜 있었다. 네트워크 호출과 규칙이 섞여 있어 규칙만 따로 확인할
 * 방법이 없었고, 그래서 저장 규칙을 고칠 때마다 실제로 저장해 보는 수밖에 없었다.
 *
 * 여기에는 **네트워크를 모르는 것만** 둔다 — 무엇을 저장할지 정하는 규칙.
 * 실제 호출 순서와 실패 처리는 컴포넌트가 그대로 갖는다(그건 별개 문제다).
 */
import { docToBlocks, isRichEmpty } from '@/lib/prosemirror';
import { extractPlainText } from '@/lib/prosemirror';
import type { CanvasCard, CanvasChoice } from './AuthoringCanvas';

/* ── 카드 id 규약 ─────────────────────────────────────────────────────
 * 저장 전 카드는 `local-` 접두 id를, 저장된 카드는 실제 question id를 갖는다.
 * 이 규약이 문자열로 코드 여기저기 흩어져 있어서(타입 밖 규약) 새 카드를 만드는
 * 자리마다 접두를 직접 붙이고 있었다. 생성과 판정을 한곳에 모은다.
 * ──────────────────────────────────────────────────────────────────── */

const LOCAL_ID_PREFIX = 'local-';

/** 아직 저장되지 않은 새 카드의 id를 만든다. */
export function newLocalCardId(seq: number, now = Date.now()): string {
  return `${LOCAL_ID_PREFIX}${now}-${seq}`;
}

/** 이미 서버에 저장된 카드인가(= id가 실제 question id인가). */
export function isPersistedCard(id: string): boolean {
  return !id.startsWith(LOCAL_ID_PREFIX);
}

/* ── 사전검증 ─────────────────────────────────────────────────────── */

export interface SavePreconditions {
  cardCount: number;
  subjectId: string;
  /** 문제집을 불러왔는지. 못 불러왔으면 담기가 100% 실패한다. */
  workbookLoaded: boolean;
}

/**
 * 저장을 시작해도 되는지. 막아야 하면 사용자에게 보여줄 문구를, 통과면 null.
 * 순서가 의미를 갖는다 — 가장 흔하고 고치기 쉬운 것부터 알려 준다.
 */
export function validateSave(pre: SavePreconditions): string | null {
  if (pre.cardCount === 0) return '저장할 문항이 없습니다.';
  if (!pre.subjectId) return '과목 정보가 없습니다. 채팅에서 과목을 확인해주세요.';
  if (!pre.workbookLoaded) {
    return '문제집을 불러오지 못했어요. 문제집 만들기에서 다시 시작해주세요.';
  }
  return null;
}

/* ── 지문 그룹 ──────────────────────────────────────────────────────
 * 예전에는 "지문 평문이 완전히 같으면 같은 지문"이었다(#41 분석 C). 두 방향으로 틀렸다:
 * 한 글자만 고쳐도 그룹이 깨져 지문이 복제됐고, 서로 무관한 문항의 지문이 우연히
 * 같으면 의도 없이 묶여 한쪽을 고치면 다른 쪽까지 바뀌었다.
 *
 * 이제 카드가 `passageGroupId`를 **직접** 들고 다닌다. 저장된 문항은 실제 passage id를,
 * 아직 저장 안 된 지문은 `local-passage-` id를 갖는다. 텍스트는 더 이상 판정에 쓰지 않는다.
 *
 * 평문 일치는 **유입 경계 한 곳**에만 남는다 — 같은 AI 응답에서 나온 문항들의 지문이
 * 같을 때(지문세트). 거기서는 평문 일치가 "같은 세트"라는 신뢰할 만한 신호다.
 * 유입 이후로는 id가 정본이라, 편집해도 그룹이 안 깨지고 남과 섞이지도 않는다.
 * ──────────────────────────────────────────────────────────────────── */

const LOCAL_PASSAGE_PREFIX = 'local-passage-';

/** 아직 저장되지 않은 새 지문 그룹 id. */
export function newLocalPassageGroupId(seq: number, now = Date.now()): string {
  return `${LOCAL_PASSAGE_PREFIX}${now}-${seq}`;
}

/** 이미 서버에 저장된 지문인가(= 그룹 id가 실제 passage id인가). */
export function isPersistedPassageGroup(groupId: string): boolean {
  return !groupId.startsWith(LOCAL_PASSAGE_PREFIX);
}

/**
 * 유입 경계용 지문 동일성 키 — 평문 완전일치(공백 정리 후). 빈 지문은 묶지 않는다.
 * **여기서만** 텍스트로 판정한다. 저장·편집 경로는 passageGroupId를 본다.
 */
export function passageKey(card: Pick<CanvasCard, 'passage'>): string | null {
  if (!card.passage) return null;
  const text = extractPlainText(card.passage).trim();
  return text ? text : null;
}

/** 카드의 지문 그룹 — 지문이 없으면 null(그룹 id가 남아 있어도 무시한다). */
export function passageGroupOf(card: Pick<CanvasCard, 'passage' | 'passageGroupId'>): string | null {
  if (!card.passage) return null;
  return card.passageGroupId ?? null;
}

/**
 * 저장해야 할 서로 다른 지문 목록 — 그룹당 한 번만. 같은 그룹의 카드가 여럿이면
 * **첫 카드의 내용**을 정본으로 삼는다(편집 전파가 그룹 전체를 같은 값으로 맞춰 두므로
 * 어느 것을 골라도 같지만, 전파가 실패한 경우에도 결과가 결정적이어야 한다).
 * 반환 순서는 카드 순서를 따른다.
 */
export function uniquePassages(
  cards: CanvasCard[],
): { groupId: string; passage: unknown }[] {
  const seen = new Set<string>();
  const out: { groupId: string; passage: unknown }[] = [];
  for (const c of cards) {
    const groupId = passageGroupOf(c);
    if (!groupId || seen.has(groupId)) continue;
    seen.add(groupId);
    out.push({ groupId, passage: c.passage });
  }
  return out;
}

/* ── 키워드(태그) ─────────────────────────────────────────────────── */

/**
 * 저장 전 키워드 정리 — 공백 제거, 빈 값 제거, 대소문자 무시 중복 제거.
 * 태그 find-or-create를 돌기 전에 걸러야 같은 태그를 두 번 만들지 않는다.
 */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/* ── 문항 페이로드 ────────────────────────────────────────────────── */

/** 저장할 값이 없는 카드는 건너뛴다 — 텍스트가 아니라 내용 유무로 본다(이미지만 있는 발문). */
export function isSavableCard(card: CanvasCard): boolean {
  return !isRichEmpty(card.stem);
}

function choicePayload(ch: CanvasChoice, index: number) {
  return {
    id: `c${index + 1}`,
    // 노드를 그대로 보낸다. 예전엔 평문에서 다시 지어서(`buildRichDoc`) 서식·수식이
    // 저장 한 번에 증발했고, 원본을 되돌려주는 방어로 겨우 막고 있었다 — 선지를 rich로
    // 올린 지금은 되돌릴 것도 잃을 것도 없다.
    content: ch.content,
    isCorrect: false as boolean,
    // 텍스트가 아니라 내용 유무로 본다 — 수식만 있는 선지 해설도 내용이 있다.
    ...(!isRichEmpty(ch.explanation)
      ? { explanation: docToBlocks(ch.explanation), explanationVisible: ch.showExplanation }
      : {}),
  };
}

/**
 * 한 카드의 저장 페이로드. 생성(POST)과 갱신(PATCH)이 같은 모양이라 한 번에 만든다.
 *
 * `explanation`은 doc 래퍼만 벗겨 블록 배열로 보낸다 — 평문을 거치지 않는다.
 * 예전엔 `extractPlainText → buildRichBlocks` 왕복이라 서식이 저장 한 번에 증발했다.
 *
 * **`tagIds`와 `passageId`는 비어 있어도 반드시 싣는다.** 백엔드 PATCH는 필드가 없으면
 * "안 건드림"으로 읽는다(`dto.tagIds ? 교체 : 유지`, `dto.passageId !== undefined ? 반영 : 유지`).
 * 예전처럼 빈 값을 생략하면 **삭제를 표현할 방법이 없다** — 마지막 키워드를 지우거나
 * 지문을 떼도 서버에는 그대로 남는다. 변경 감지가 붙은 지금은 그 상태가 "동기화됨"으로
 * 기준선에 박혀 다음 저장에서도 건너뛰므로, 영영 반영되지 않는다.
 * `rubric`도 같은 이유로 빈 배열을 싣는다(마지막 채점기준을 지우는 유일한 표현).
 */
export function buildQuestionPayload(
  card: CanvasCard,
  opts: { tagIds: string[]; passageId?: string | null },
) {
  return {
    questionType: card.type,
    points: card.points,
    tagIds: opts.tagIds,
    passageId: opts.passageId ?? null,
    stem: card.stem,
    choices:
      card.type === '객관식'
        ? card.choices.map((ch, i) => ({ ...choicePayload(ch, i), isCorrect: i === card.correct }))
        : undefined,
    correctAnswerText:
      card.type === '주관식' && card.answerText.trim() ? card.answerText.trim() : undefined,
    rubric: rubricPayload(card),
    explanation: isRichEmpty(card.explanation) ? undefined : docToBlocks(card.explanation),
  };
}

/**
 * 채점기준표 페이로드 — id를 저장 시점에 `c1`..로 다시 매긴다(선지와 같은 관행).
 *
 * 서버가 rubric을 거부하는 조합(객관식 / 단답 정답이 있는 주관식)에서는 빈 배열을 보내
 * **지운다**. 400을 받게 두지 않는 이유: 유형을 바꾸거나 단답 정답을 채우는 건 정상적인
 * 편집이고, 그때 남는 기준은 어차피 채점에 쓰이지 않는 죽은 데이터다.
 */
function rubricPayload(card: CanvasCard): { id: string; text: string; points: number }[] {
  const usable = card.type === '주관식' && !card.answerText.trim();
  if (!usable) return [];
  return (card.rubric ?? [])
    .filter((c) => c.text.trim().length > 0 && c.points > 0)
    .map((c, i) => ({ id: `c${i + 1}`, text: c.text.trim(), points: c.points }));
}

/* ── 변경 감지 ──────────────────────────────────────────────────────
 * 저장은 지금까지 **모든** 카드를 무조건 다시 썼다. 기존 문제집을 열어 오탈자 하나만
 * 고치고 저장해도 20문항 전부에 PATCH가 나갔고, 지문은 아예 매번 새로 만들어져
 * 저장할 때마다 같은 지문이 복제됐다.
 *
 * 서버와 일치하던 마지막 모습을 지문(fingerprint)으로 들고 있다가, 같은 값이면 건너뛴다.
 * 태그 id 대신 키워드 이름을 쓰는 이유: id는 저장 시점에야 정해지지만 사용자가 바꾼 것은
 * 이름이고, 이름이 그대로면 붙을 태그도 그대로다.
 * ──────────────────────────────────────────────────────────────────── */

/** 문항 내용의 지문 — 이게 같으면 서버에 다시 쓸 이유가 없다. */
export function questionFingerprint(card: CanvasCard): string {
  return JSON.stringify(
    buildQuestionPayload(card, {
      tagIds: normalizeKeywords(card.keywords),
      passageId: passageGroupOf(card) ?? undefined,
    }),
  );
}

/** 지문(passage) 내용의 지문. */
export function passageFingerprint(passage: unknown): string {
  return JSON.stringify(passage ?? null);
}

/* ── 이미지 등록 ────────────────────────────────────────────────────
 * `POST /media-assets`는 questionId·passageId 중 하나가 **이미 존재**해야 해서
 * 저장 전 새 카드에서는 부를 수 없다(Phase 2에서 남긴 구멍). 저장 직후 id가 생기는
 * 이 자리가 등록의 제자리다.
 *
 * 등록 대상은 "이번에 새로 들어온 이미지"뿐이다. 불러올 때 이미 문서에 있던 이미지는
 * 등록됐거나(정상) 등록 기능이 없던 시절의 것인데, 어느 쪽이든 다시 등록하면
 * media_assets에 중복 행만 쌓인다.
 * ──────────────────────────────────────────────────────────────────── */

/** 노드 트리(doc·블록 배열 무관) 안의 image src를 순서대로, 중복 없이 모은다. */
export function collectImageSrcs(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const src = node.attrs.src;
      if (!seen.has(src)) {
        seen.add(src);
        out.push(src);
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(value);
  return out;
}

/** 카드 본문(발문·선지·해설)에 실린 이미지 — 지문은 별도 대상이라 제외한다. */
export function cardImageSrcs(card: CanvasCard): string[] {
  const parts: unknown[] = [card.stem, card.explanation];
  for (const ch of card.choices) {
    parts.push(ch.content, ch.explanation);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    for (const src of collectImageSrcs(part)) {
      if (seen.has(src)) continue;
      seen.add(src);
      out.push(src);
    }
  }
  return out;
}
