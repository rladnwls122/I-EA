"use client";

/**
 * 풀이 중 형광펜 — CSS Custom Highlight API로 본문 위에 색만 얹는다.
 *
 * **왜 오답노트의 주석(AnnotatedText)을 그대로 쓰지 않는가:** 그쪽은 평문 오프셋으로
 * 앵커를 잡고 텍스트를 span으로 쪼개 그린다. 쪼개려면 렌더러를 AnnotatedText로 갈아야
 * 하는데, 그러면 문항 본문이 문단 텍스트로 납작해져 이미지·표·목록·굵기가 사라진다.
 * 시험지 화면에서 서식이 사라지는 건 형광펜 하나 얻자고 낼 값이 아니다.
 *
 * Highlight API는 DOM을 전혀 건드리지 않고 Range에만 색을 입힌다 — RichContent가
 * 그린 마크업도, KaTeX 수식도 그대로 두고 위에 칠한다. React가 같은 본문을 다시
 * 렌더해도 텍스트 노드가 재사용되므로 Range가 살아 있다.
 *
 * **저장하지 않는다.** 시험 중 형광펜은 화면필기(DrawingOverlay)와 같은 성격의
 * 연습장이다 — 새로고침하면 사라진다. 오답노트에 남길 표시는 채점 후 주석 기능이 맡는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const HIGHLIGHT_NAME = "solve-highlight";

/** 브라우저가 Highlight API를 지원하는지. 미지원이면 형광펜 버튼 자체를 숨긴다. */
export function highlightApiSupported(): boolean {
  return (
    typeof CSS !== "undefined" &&
    "highlights" in CSS &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === "function"
  );
}

type RectsOf = (range: Range) => DOMRect[];

const domRects: RectsOf = (range) => Array.from(range.getClientRects());

/**
 * (x, y) 지점을 덮는 하이라이트의 인덱스. 없으면 -1.
 * 겹친 경우 **나중에 칠한 것**을 지운다 — 방금 한 행동을 먼저 되돌리는 쪽이 예측 가능하다.
 * rectsOf를 주입받는 이유는 레이아웃이 없는 테스트 환경에서 검증하기 위해서다.
 */
export function indexOfHighlightAt(
  ranges: Range[],
  x: number,
  y: number,
  rectsOf: RectsOf = domRects,
): number {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const hit = rectsOf(ranges[i]).some(
      (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
    );
    if (hit) return i;
  }
  return -1;
}

/**
 * @param enabled 형광펜 모드 on/off. 꺼도 이미 칠한 자국은 남는다(지우려면 clearAll).
 */
export function useSolveHighlights(enabled: boolean) {
  const rangesRef = useRef<Range[]>([]);
  const [count, setCount] = useState(0);

  const sync = useCallback(() => {
    if (!highlightApiSupported()) return;
    const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights;
    const list = rangesRef.current;
    if (list.length === 0) {
      registry.delete(HIGHLIGHT_NAME);
    } else {
      const Ctor = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      registry.set(HIGHLIGHT_NAME, new Ctor(...list));
    }
    setCount(list.length);
  }, []);

  const clearAll = useCallback(() => {
    rangesRef.current = [];
    sync();
  }, [sync]);

  // 등록한 하이라이트는 전역(document) 레지스트리에 남으므로 언마운트 때 반드시 걷는다.
  useEffect(() => {
    return () => {
      if (highlightApiSupported()) {
        (CSS as unknown as { highlights: Map<string, unknown> }).highlights.delete(HIGHLIGHT_NAME);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !highlightApiSupported()) return;

    // 드래그로 칠하고, 이미 칠한 자리를 그냥 누르면 지운다(형광펜 하나로 두 동작).
    const handle = (x: number, y: number) => {
      const sel = window.getSelection();
      if (!sel) return;
      if (sel.isCollapsed || sel.rangeCount === 0) {
        const hit = indexOfHighlightAt(rangesRef.current, x, y);
        if (hit >= 0) {
          rangesRef.current = rangesRef.current.filter((_, i) => i !== hit);
          sync();
        }
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const host = (node instanceof HTMLElement ? node : node.parentElement)?.closest(
        "[data-highlightable]",
      );
      // 선지 버튼·답안 입력칸처럼 칠할 대상이 아닌 곳의 선택은 무시한다.
      if (!host) return;
      rangesRef.current = [...rangesRef.current, range.cloneRange()];
      sel.removeAllRanges();
      sync();
    };

    const onMouseUp = (e: MouseEvent) => handle(e.clientX, e.clientY);
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (t) handle(t.clientX, t.clientY);
    };
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, sync]);

  return { count, clearAll };
}
