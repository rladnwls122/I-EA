import { describe, it, expect } from "vitest";
import { sessionPassages } from "./session-passages";
import type { SessionQuestionSnapshot } from "./types";

const snap = (over: Partial<SessionQuestionSnapshot>): SessionQuestionSnapshot =>
  ({ questionType: "객관식", stem: {}, points: 1, difficulty: 3, ...over }) as SessionQuestionSnapshot;

describe("sessionPassages — 신·구 스냅샷 형태 동시 지원", () => {
  it("지문이 없으면 빈 배열", () => {
    expect(sessionPassages(snap({}))).toEqual([]);
  });

  it("신형 세트는 순서와 라벨을 그대로 넘긴다", () => {
    const passages = [
      { content: { type: "doc" }, label: "(가)" },
      { content: { type: "doc" }, label: "(나)" },
    ];
    expect(sessionPassages(snap({ passages }))).toEqual(passages);
  });

  it("구형 단수 passage도 읽는다 — 이미 DB에 박힌 스냅샷은 소급 수정하지 않는다", () => {
    const passage = { type: "doc", content: [] };
    expect(sessionPassages(snap({ passage }))).toEqual([{ content: passage }]);
  });

  it("둘 다 있으면 신형이 이긴다", () => {
    const passages = [{ content: { id: "new" } }];
    const out = sessionPassages(snap({ passages, passage: { id: "old" } }));
    expect(out).toEqual(passages);
  });

  it("신형이 빈 배열이면 구형으로 물러난다 — 빈 세트가 지문을 삼키면 안 된다", () => {
    const passage = { id: "old" };
    expect(sessionPassages(snap({ passages: [], passage }))).toEqual([{ content: passage }]);
  });

  it("단일 지문에는 라벨을 붙이지 않는다(화면에 '지문 1'만 뜨는 걸 막는다)", () => {
    const out = sessionPassages(snap({ passage: { id: "solo" } }));
    expect(out[0].label).toBeUndefined();
  });
});
