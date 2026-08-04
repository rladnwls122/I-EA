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
import { buildRichDoc, buildRichBlocks, docToBlocks, isRichEmpty, keepIfUnchanged } from '@/lib/prosemirror';
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

/* ── 지문 그룹 ────────────────────────────────────────────────────── */

/**
 * 지문 공유 판정 키 — 평문 완전일치(공백 정리 후). 빈 지문은 묶지 않는다.
 *
 * 알려진 한계(#41 분석 C): 한 글자만 달라도 그룹이 깨지고, 우연히 같으면 의도 없이
 * 묶인다. 명시적 passageId 연결로 바꾸는 게 옳지만 카드 모델과 AI 생성 경로까지
 * 함께 손대야 해서 이번 범위 밖이다. 최소한 규칙을 한곳에 모아 테스트는 걸어 둔다.
 */
export function passageKey(card: Pick<CanvasCard, 'passage'>): string | null {
  if (!card.passage) return null;
  const text = extractPlainText(card.passage).trim();
  return text ? text : null;
}

/**
 * 저장해야 할 서로 다른 지문 목록 — 같은 지문은 한 번만 만든다.
 * 반환 순서는 카드 순서를 따른다(생성 순서를 예측 가능하게).
 */
export function uniquePassages(cards: CanvasCard[]): { key: string; passage: unknown }[] {
  const seen = new Set<string>();
  const out: { key: string; passage: unknown }[] = [];
  for (const c of cards) {
    const key = passageKey(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, passage: c.passage });
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
    // 텍스트를 안 고쳤으면 불러온 원본 노드를 그대로 — 평문으로 다시 지으면
    // 다른 편집기에서 넣은 서식이 사라진다(#41 Phase 1).
    content: keepIfUnchanged(ch.sourceContent, ch.text) ?? buildRichDoc(ch.text),
    isCorrect: false as boolean,
    ...(ch.explanation.trim()
      ? {
          explanation:
            keepIfUnchanged(ch.sourceExplanation, ch.explanation) ??
            buildRichBlocks(ch.explanation),
          explanationVisible: ch.showExplanation,
        }
      : {}),
  };
}

/**
 * 한 카드의 저장 페이로드. 생성(POST)과 갱신(PATCH)이 같은 모양이라 한 번에 만든다.
 *
 * `explanation`은 doc 래퍼만 벗겨 블록 배열로 보낸다 — 평문을 거치지 않는다.
 * 예전엔 `extractPlainText → buildRichBlocks` 왕복이라 서식이 저장 한 번에 증발했다.
 */
export function buildQuestionPayload(
  card: CanvasCard,
  opts: { tagIds: string[]; passageId?: string },
) {
  return {
    questionType: card.type,
    points: card.points,
    ...(opts.tagIds.length ? { tagIds: opts.tagIds } : {}),
    ...(opts.passageId ? { passageId: opts.passageId } : {}),
    stem: card.stem,
    choices:
      card.type === '객관식'
        ? card.choices.map((ch, i) => ({ ...choicePayload(ch, i), isCorrect: i === card.correct }))
        : undefined,
    correctAnswerText:
      card.type === '주관식' && card.answerText.trim() ? card.answerText.trim() : undefined,
    explanation: isRichEmpty(card.explanation) ? undefined : docToBlocks(card.explanation),
  };
}
