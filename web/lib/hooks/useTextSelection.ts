'use client';

/**
 * 텍스트 드래그 선택 계산 훅 — 렌더링(AnnotatedText)과 분리된 선택 전용 로직.
 * mouseup/touchend에 더해 selectionchange(debounce)도 처리해
 * Safari·모바일 선택 핸들 이동에서도 안정적으로 동작한다.
 */
import { useEffect, useRef, useState } from 'react';

export interface AnnotationSelection {
  target: string;
  targetId: string | null;
  /** target 블록 평문 기준 오프셋 (end exclusive) */
  start: number;
  end: number;
  /** 툴바 배치용 — 페이지 좌표 (선택 영역 상단 중앙) */
  rect: { top: number; left: number };
}

function closestEl(node: Node | null): HTMLElement | null {
  if (!node) return null;
  return node instanceof HTMLElement ? node : node.parentElement;
}

function readSelection(): AnnotationSelection | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  const startRoot = closestEl(range.startContainer)?.closest('[data-annot-root]');
  const endRoot = closestEl(range.endContainer)?.closest('[data-annot-root]');
  // 컨테이너 밖이거나 서로 다른 블록(stem↔해설 등)에 걸친 선택은 무시
  if (!startRoot || startRoot !== endRoot) return null;

  const offsetAt = (node: Node, nodeOffset: number): number | null => {
    const span = closestEl(node)?.closest('[data-start]') as HTMLElement | null;
    if (!span) return null;
    const base = Number(span.dataset.start);
    return Number.isNaN(base) ? null : base + nodeOffset;
  };
  const start = offsetAt(range.startContainer, range.startOffset);
  const end = offsetAt(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const r = range.getBoundingClientRect();
  const el = startRoot as HTMLElement;
  return {
    target: el.dataset.target || 'STEM',
    targetId: el.dataset.targetId || null,
    start,
    end,
    rect: {
      top: r.top + window.scrollY,
      left: r.left + r.width / 2 + window.scrollX,
    },
  };
}

export function useTextSelection(enabled = true) {
  const [selection, setSelection] = useState<AnnotationSelection | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const update = () => setSelection(readSelection());
    const onSelectionChange = () => {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(update, 150);
    };
    document.addEventListener('mouseup', update);
    document.addEventListener('touchend', update);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(debounceRef.current);
      document.removeEventListener('mouseup', update);
      document.removeEventListener('touchend', update);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [enabled]);

  const clear = () => {
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  return { selection, clear };
}
