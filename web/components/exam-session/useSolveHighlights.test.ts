import { describe, expect, it } from "vitest";
import { indexOfHighlightAt } from "./useSolveHighlights";

/** 레이아웃이 없는 환경이라 사각형을 직접 준다 — 히트 판정만 검증한다. */
const rect = (left: number, top: number, right: number, bottom: number) =>
  ({ left, top, right, bottom }) as DOMRect;

describe("indexOfHighlightAt", () => {
  const a = {} as Range; // 0~10 x 0~10
  const b = {} as Range; // 5~20 x 0~10 (a와 5~10 구간에서 겹침)
  const rects = new Map<Range, DOMRect[]>([
    [a, [rect(0, 0, 10, 10)]],
    [b, [rect(5, 0, 20, 10)]],
  ]);
  const rectsOf = (r: Range) => rects.get(r) ?? [];

  it("사각형 안의 점이면 그 하이라이트를 찾는다", () => {
    expect(indexOfHighlightAt([a], 3, 3, rectsOf)).toBe(0);
  });

  it("어떤 사각형에도 없으면 -1", () => {
    expect(indexOfHighlightAt([a, b], 50, 50, rectsOf)).toBe(-1);
  });

  it("겹친 구간은 나중에 칠한 것을 먼저 집는다", () => {
    expect(indexOfHighlightAt([a, b], 7, 5, rectsOf)).toBe(1);
  });

  it("겹치지 않는 구간은 각자 제 것을 집는다", () => {
    expect(indexOfHighlightAt([a, b], 2, 5, rectsOf)).toBe(0);
    expect(indexOfHighlightAt([a, b], 15, 5, rectsOf)).toBe(1);
  });

  it("칠한 게 없으면 -1", () => {
    expect(indexOfHighlightAt([], 1, 1, rectsOf)).toBe(-1);
  });
});
