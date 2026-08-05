import { describe, it, expect } from 'vitest';
import { buildQuestionPayload, questionFingerprint } from './authoring-save';
import { buildRichDoc } from '@/lib/prosemirror-assemble';
import type { CanvasCard } from './AuthoringCanvas';

/**
 * 채점기준표 저장 페이로드(#43 gap 8).
 * 서버가 rubric을 거부하는 조합에서는 400을 받는 대신 **비워서 지운다**가 규칙이다 —
 * 유형 전환·단답 정답 입력은 정상적인 편집이고, 그때 남는 기준은 죽은 데이터다.
 */
const card = (over: Partial<CanvasCard> = {}): CanvasCard => ({
  id: 'local-1-0',
  type: '주관식',
  stem: buildRichDoc('발문'),
  passage: null,
  passageGroupId: null,
  choices: [],
  correct: -1,
  answerText: '',
  explanation: buildRichDoc(''),
  points: 5,
  keywords: [],
  ...over,
});

const payload = (c: CanvasCard) => buildQuestionPayload(c, { tagIds: [] });

const RUBRIC = [
  { id: '', text: '핵심어 포함', points: 3 },
  { id: '', text: '근거 제시', points: 2 },
];

describe('buildQuestionPayload — 채점기준표', () => {
  it('서술형 주관식의 기준을 c1..로 번호를 다시 매겨 싣는다(선지와 같은 관행)', () => {
    expect(payload(card({ rubric: RUBRIC })).rubric).toEqual([
      { id: 'c1', text: '핵심어 포함', points: 3 },
      { id: 'c2', text: '근거 제시', points: 2 },
    ]);
  });

  it('객관식에는 싣지 않는다(빈 배열 = 지움) — 자동채점이라 기준이 쓰일 자리가 없다', () => {
    expect(payload(card({ type: '객관식', rubric: RUBRIC })).rubric).toEqual([]);
  });

  it('단답 정답이 있으면 비운다 — 문자열 비교로 자동채점되는 문항이다', () => {
    expect(payload(card({ answerText: '광합성', rubric: RUBRIC })).rubric).toEqual([]);
  });

  it('기준이 없으면 빈 배열 — 생략하면 PATCH가 "안 건드림"으로 읽어 삭제를 표현할 수 없다', () => {
    expect(payload(card()).rubric).toEqual([]);
    expect(payload(card({ rubric: [] })).rubric).toEqual([]);
  });

  it('빈 기준 줄과 0점 기준은 버린다(추가만 하고 안 채운 줄)', () => {
    const c = card({
      rubric: [
        { id: '', text: '  ', points: 2 },
        { id: '', text: '유효 기준', points: 2 },
        { id: '', text: '0점', points: 0 },
      ],
    });
    expect(payload(c).rubric).toEqual([{ id: 'c1', text: '유효 기준', points: 2 }]);
  });

  it('기준을 고치면 지문(fingerprint)이 달라져 저장에서 건너뛰지 않는다', () => {
    const before = questionFingerprint(card({ rubric: RUBRIC }));
    const after = questionFingerprint(
      card({ rubric: [{ id: '', text: '핵심어 포함', points: 4 }, RUBRIC[1]] }),
    );
    expect(before).not.toBe(after);
  });
});
