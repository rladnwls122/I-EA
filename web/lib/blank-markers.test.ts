import { describe, it, expect } from "vitest";
import { findBlankMarkers, stemBlankNumber } from "./blank-markers";

const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("빈칸 마커 읽기 (#43 gap 9 — 백엔드 규약과 락스텝)", () => {
  it("정본 마커의 번호를 등장 순서대로 읽는다", () => {
    expect(findBlankMarkers("We are ___(1)___ and ___(2)___ today.")).toEqual([1, 2]);
  });

  it("마커가 없으면 빈 배열", () => {
    expect(findBlankMarkers("평범한 발문입니다.")).toEqual([]);
  });

  it("LLM 입력 문법([[n]])은 프런트가 볼 일이 없다 — 정본만 읽는다", () => {
    expect(findBlankMarkers("[[1]]")).toEqual([]);
  });

  it("발문에서 이 문항이 몇 번 빈칸인지 뽑는다", () => {
    expect(stemBlankNumber(doc("___(3)___ Which word fits best?"))).toBe(3);
  });

  it("빈칸형이 아닌 발문은 null — 배지를 띄우지 않는다", () => {
    expect(stemBlankNumber(doc("다음 중 옳은 것은?"))).toBeNull();
    expect(stemBlankNumber(null)).toBeNull();
  });

  it("수식이 섞여 있어도 마커만 골라낸다", () => {
    expect(stemBlankNumber(doc("$x^2$ 와 ___(2)___"))).toBe(2);
  });
});
