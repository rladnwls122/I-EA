'use client';

/**
 * 주석 마크가 입혀진 ProseMirror JSON 렌더러 — 렌더링 전용(선택 로직 없음).
 * 세그먼트를 주석 오프셋 경계로 분할해 span으로 쪼갠다.
 * 겹치는 주석은 createdAt ASC 정렬 후 마지막(최신)이 위에 렌더.
 */
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
// `\ce{H2O}` — 백엔드 파스 검증·에디터·RichContent와 같은 모듈. 한쪽만 빠지면
// 저장은 통과한 수식이 여기서만 빨간 에러로 보인다.
import 'katex/contrib/mhchem';
import { extractPlainText, walkTextSegments, type TextSegment } from '@/lib/prosemirror';
import { resolveAnnotation, colorHex } from '@/lib/annotations';
import type { UserQuestionAnnotation } from '@/lib/types';

interface ResolvedMark {
  ann: UserQuestionAnnotation;
  start: number;
  end: number;
}

interface Props {
  doc: any;
  target: string;
  targetId?: string | null;
  annotations: UserQuestionAnnotation[];
  onMarkClick?: (id: string) => void;
  className?: string;
}

export function AnnotatedText({
  doc,
  target,
  targetId = null,
  annotations,
  onMarkClick,
  className,
}: Props) {
  const segments = useMemo(() => walkTextSegments(doc), [doc]);
  const plain = useMemo(() => extractPlainText(doc), [doc]);

  const marks: ResolvedMark[] = useMemo(() => {
    return (annotations || [])
      .filter((a) => a.target === target && (a.targetId ?? null) === (targetId ?? null))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((a) => ({ ann: a, anchor: resolveAnnotation(plain, a) }))
      .filter((m) => m.anchor && m.anchor.status !== 'LOST')
      .map((m) => ({ ann: m.ann, start: m.anchor!.start, end: m.anchor!.end }));
  }, [annotations, plain, target, targetId]);

  // blockIndex별로 묶어 문단 렌더
  const blocks = useMemo(() => {
    const map = new Map<number, TextSegment[]>();
    for (const s of segments) {
      const list = map.get(s.blockIndex) ?? [];
      list.push(s);
      map.set(s.blockIndex, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [segments]);

  /**
   * 수식 조각을 KaTeX로 그린다. `RichContent.MathNode`와 같은 판단 —
   * 주입되는 HTML은 저장된 HTML이 아니라 latex 문자열에서 방금 만든 것이고,
   * `trust: false`가 `\href`·`\htmlClass` 같은 임의 URL/속성 명령을 전부 거부한다.
   */
  const renderMath = (latex: string, key: string, bg?: string) => {
    const html = katex.renderToString(latex, { displayMode: false, throwOnError: false, trust: false });
    return (
      <span
        key={key}
        style={bg ? { backgroundColor: bg } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  };

  const renderSegment = (seg: TextSegment) => {
    /**
     * 수식은 쪼갤 수 없다 — KaTeX 출력은 통짜 HTML이라 "`$x^`까지만 하이라이트"를
     * 표현할 방법이 없다. 그래서 마크가 이 조각을 **통째로** 덮을 때만 렌더하고,
     * 일부만 걸치면 원문(`$x^2$`)을 그대로 보여준다 — 사용자가 실제로 칠한 범위와
     * 화면이 어긋나는 것보다, 그 한 조각만 날것으로 보이는 편이 정직하다.
     */
    if (seg.latex) {
      const covering = marks.filter((m) => m.start <= seg.start && m.end >= seg.end);
      const partial = marks.some(
        (m) => m.start < seg.end && m.end > seg.start && !(m.start <= seg.start && m.end >= seg.end),
      );
      if (!partial) {
        const top = covering[covering.length - 1];
        return renderMath(seg.latex, `m${seg.start}`, top ? colorHex(top.ann.color) : undefined);
      }
    }
    // 세그먼트 내부를 마크 경계로 자른다
    const cuts = new Set<number>([seg.start, seg.end]);
    for (const m of marks) {
      if (m.start > seg.start && m.start < seg.end) cuts.add(m.start);
      if (m.end > seg.start && m.end < seg.end) cuts.add(m.end);
    }
    const pts = [...cuts].sort((a, b) => a - b);
    const out: React.ReactNode[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const s = pts[i];
      const e = pts[i + 1];
      const text = seg.text.slice(s - seg.start, e - seg.start);
      const covering = marks.filter((m) => m.start <= s && m.end >= e);
      const top = covering[covering.length - 1]; // ASC 정렬 → 마지막이 최신
      if (top) {
        const hex = colorHex(top.ann.color);
        out.push(
          <span
            key={s}
            data-start={s}
            data-end={e}
            onClick={() => onMarkClick?.(top.ann.id)}
            className="cursor-pointer rounded-sm transition-opacity duration-150 ease-swift hover:opacity-80 motion-reduce:transition-none"
            style={
              top.ann.markStyle === 'UNDERLINE'
                ? { borderBottom: `2px solid ${hex}` }
                : { backgroundColor: `${hex}4d`, borderRadius: 3 }
            }
          >
            {text}
          </span>,
        );
      } else {
        out.push(
          <span key={s} data-start={s} data-end={e}>
            {text}
          </span>,
        );
      }
    }
    return out;
  };

  // doc이 비었거나 비정상 → 평문 fallback
  if (!segments.length) {
    return <div className={className}>{plain}</div>;
  }

  return (
    <div
      data-annot-root
      data-target={target}
      {...(targetId ? { 'data-target-id': targetId } : {})}
      className={className}
    >
      {blocks.map(([bi, segs]) => (
        <p key={bi} className="whitespace-pre-wrap">
          {segs.flatMap(renderSegment)}
        </p>
      ))}
    </div>
  );
}
