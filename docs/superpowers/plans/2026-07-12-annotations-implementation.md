# 오답노트 2.0 텍스트 어노테이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 오답노트 상세 페이지에서 텍스트 드래그 → 하이라이트/밑줄 주석 저장 → 마크 재렌더링 루프를 완성하고, mock 데이터(가짜 정답/내 선택, 죽은 textarea)를 실데이터로 교체한다.

**Architecture:** 백엔드 무변경. 앵커 = target 블록의 extractPlainText 평문 오프셋 + selectedText 검증(NORMAL/RECOVERED/LOST 3-status 복구). 렌더링·선택·오프셋 변환을 분리: 렌더 전용 `AnnotatedText`(PM JSON→span, Tiptap 없음), 선택 훅 `useTextSelection`, 앵커 해석 유틸 `resolveAnnotation`. `extractPlainText`와 `walkTextSegments`는 같은 내부 visitor를 공유해 오프셋 불일치를 원천 차단.

**Tech Stack:** Next.js 14 App Router (client components), TanStack Query(기존 hooks), Tailwind. 신규 dep 없음.

**Spec:** `docs/superpowers/specs/2026-07-12-annotations-design.md`

## Global Constraints

- 백엔드(`src/`) 파일 수정 금지. 스키마/DTO/엔드포인트 그대로 사용.
- 주석·사용자 대면 문구는 한국어.
- WEB_GUIDE 가드: `typeof window !== 'undefined'` before localStorage/window API, `(arr || [])` 방어, `new Date` 전 존재 확인.
- ProseMirror JSON을 raw string으로 렌더 금지 — 이 계획의 렌더러/`extractPlainText` 경유만.
- 백엔드 상수 값과 일치(단일 출처 `src/common/constants/question.ts`): targets `GENERAL|PASSAGE|STEM|CHOICES|EXPLANATION`, markStyle `HIGHLIGHT|UNDERLINE`, reason `CONCEPT|MISTAKE|TIME|OTHER`, 라벨 개념부족/실수/시간부족/기타.
- 색 코드→hex: yellow `#fbbf24`, emerald `#34d399`, purple `#a78bfa`, blue `#60a5fa`. 신규 색 금지.
- `web/`에 테스트 러너 없음 → 각 태스크 검증은 `npx tsc --noEmit` + `npx next lint`, 최종 수동 E2E(Task 8).
- 모든 명령은 `cd C:/Users/kryuk/dev/web`에서 실행.

---

### Task 1: prosemirror.ts — visitor 공통화 + walkTextSegments

**Files:**
- Modify: `web/lib/prosemirror.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export interface TextSegment { text: string; start: number; end: number; blockIndex: number }`
  - `export function walkTextSegments(doc: any): TextSegment[]`
  - `extractPlainText(doc: any): string` — 시그니처 불변, 출력 불변(기존 사용처 다수)

- [ ] **Step 1: 구현**

`extractPlainText`(57-67행)를 아래로 교체하고 visitor + `walkTextSegments`를 추가:

```typescript
/**
 * 내부 공통 visitor — extractPlainText와 walkTextSegments가 반드시 같은 순회를
 * 쓰도록 하는 단일 출처. 블록 사이는 blockGap(평문 '\n' 1글자), 텍스트 노드는 text.
 * 이 일치가 주석 앵커(평문 오프셋) 모델의 전제다.
 */
function visitTextNodes(
  doc: any,
  visitor: { text: (t: string) => void; blockGap: () => void },
): void {
  if (!doc || !doc.content || !Array.isArray(doc.content)) return;
  doc.content.forEach((node: any, i: number) => {
    if (i > 0) visitor.blockGap();
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        if (child.text) visitor.text(child.text);
      }
    }
  });
}

/**
 * ProseMirror doc JSON에서 평문 텍스트를 추출합니다.
 * 각 블록 노드는 줄바꿈(\n)으로 구분됩니다.
 */
export function extractPlainText(doc: any): string {
  let out = '';
  visitTextNodes(doc, {
    text: (t) => {
      out += t;
    },
    blockGap: () => {
      out += '\n';
    },
  });
  return out;
}

/** 평문 오프셋이 매핑된 텍스트 세그먼트. start/end는 extractPlainText 기준. */
export interface TextSegment {
  text: string;
  start: number;
  end: number;
  blockIndex: number;
}

/**
 * doc을 순회하며 텍스트 세그먼트와 평문 오프셋 매핑을 산출합니다.
 * extractPlainText와 같은 visitor를 쓰므로 오프셋이 항상 일치합니다.
 */
export function walkTextSegments(doc: any): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;
  let blockIndex = 0;
  visitTextNodes(doc, {
    text: (t) => {
      segments.push({ text: t, start: offset, end: offset + t.length, blockIndex });
      offset += t.length;
    },
    blockGap: () => {
      offset += 1;
      blockIndex += 1;
    },
  });
  return segments;
}
```

- [ ] **Step 2: 동등성 검증 (일회성 스크립트)**

```bash
cd C:/Users/kryuk/dev/web
npx tsx -e "
import { extractPlainText, walkTextSegments } from './lib/prosemirror';
const doc = { type:'doc', content:[
  { type:'paragraph', content:[{type:'text',text:'첫 줄'},{type:'text',text:' 이어짐'}] },
  { type:'paragraph' },
  { type:'paragraph', content:[{type:'text',text:'셋째 줄'}] },
]};
const plain = extractPlainText(doc);
const segs = walkTextSegments(doc);
for (const s of segs) {
  if (plain.slice(s.start, s.end) !== s.text) throw new Error('오프셋 불일치: '+JSON.stringify(s));
}
console.log('OK', JSON.stringify(plain), segs.length+' segs');
"
```

Expected: `OK "첫 줄 이어짐\n\n셋째 줄" 3 segs` (tsx 없으면 `npm i -D tsx` 없이 `npx --yes tsx` 사용)

- [ ] **Step 3: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir lib`
Expected: 에러 0

- [ ] **Step 4: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/lib/prosemirror.ts && git commit -m "feat(web): prosemirror visitor 공통화 + walkTextSegments — 주석 앵커 오프셋 기반"
```

---

### Task 2: lib/annotations.ts — 앵커 해석·상수 유틸

**Files:**
- Create: `web/lib/annotations.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export type AnchorStatus = 'NORMAL' | 'RECOVERED' | 'LOST'`
  - `export interface ResolvedAnchor { start: number; end: number; status: AnchorStatus }`
  - `export function resolveAnnotation(plain: string, ann: { selectionRange?: any; selectedText?: string | null }): ResolvedAnchor | null` — 앵커 없으면(GENERAL) null
  - `export function getReasonLabel(code?: string | null): string`
  - `export function colorHex(code?: string | null): string`
  - 상수: `ANNOTATION_COLORS`, `MARK_STYLES`, `REASON_CODES`, `REASON_LABELS`

- [ ] **Step 1: 파일 생성**

```typescript
/**
 * 오답노트 텍스트 주석 — 앵커 해석·상수 유틸.
 * 백엔드 단일 출처(src/common/constants/question.ts)와 값이 일치해야 한다.
 */

export const MARK_STYLES = ['HIGHLIGHT', 'UNDERLINE'] as const;
export type MarkStyle = (typeof MARK_STYLES)[number];

export const REASON_CODES = ['CONCEPT', 'MISTAKE', 'TIME', 'OTHER'] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_LABELS: Record<ReasonCode, string> = {
  CONCEPT: '개념부족',
  MISTAKE: '실수',
  TIME: '시간부족',
  OTHER: '기타',
};

/** 원인 코드 → 한글 라벨. 알 수 없는 코드는 원문 반환. */
export function getReasonLabel(code?: string | null): string {
  if (!code) return '';
  return REASON_LABELS[code as ReasonCode] ?? code;
}

/** 색 코드 → hex. 기존 팔레트 토큰과 동일(globals.css --chart-* 계열). */
export const ANNOTATION_COLORS: Record<string, string> = {
  yellow: '#fbbf24',
  emerald: '#34d399',
  purple: '#a78bfa',
  blue: '#60a5fa',
};

export function colorHex(code?: string | null): string {
  if (!code) return ANNOTATION_COLORS.yellow;
  return ANNOTATION_COLORS[code] ?? code; // hex를 직접 저장한 경우 그대로
}

export type AnchorStatus = 'NORMAL' | 'RECOVERED' | 'LOST';

export interface ResolvedAnchor {
  start: number;
  end: number;
  status: AnchorStatus;
}

/**
 * 저장된 앵커(selectionRange + selectedText)를 현재 평문에 대해 해석한다.
 * - NORMAL: 오프셋 위치 텍스트가 selectedText와 일치
 * - RECOVERED: 불일치 → 평문에서 selectedText 첫 매치를 재검색해 성공
 * - LOST: 재검색 실패 — 마크는 생략하고 패널에서 "위치 유실"로 표시
 * 앵커가 아예 없으면(GENERAL 메모 등) null.
 * 데이터는 어떤 경우에도 삭제하지 않는다.
 */
export function resolveAnnotation(
  plain: string,
  ann: { selectionRange?: any; selectedText?: string | null },
): ResolvedAnchor | null {
  const range = ann.selectionRange;
  const sel = ann.selectedText ?? '';
  if (
    !range ||
    typeof range.start !== 'number' ||
    typeof range.end !== 'number' ||
    range.end <= range.start ||
    !sel
  ) {
    return null;
  }
  if (plain.slice(range.start, range.end) === sel) {
    return { start: range.start, end: range.end, status: 'NORMAL' };
  }
  const idx = plain.indexOf(sel);
  if (idx >= 0) {
    return { start: idx, end: idx + sel.length, status: 'RECOVERED' };
  }
  return { start: 0, end: 0, status: 'LOST' };
}
```

- [ ] **Step 2: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir lib`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/lib/annotations.ts && git commit -m "feat(web): 주석 앵커 해석(resolveAnnotation 3-status)·원인 라벨·팔레트 유틸"
```

---

### Task 3: useTextSelection 훅 — 선택 계산 전용

**Files:**
- Create: `web/lib/hooks/useTextSelection.ts`

**Interfaces:**
- Consumes: DOM 규약 — 렌더러(Task 4)가 붙이는 `[data-annot-root][data-target][data-target-id]` 컨테이너와 `[data-start][data-end]` span. **span 하나는 단일 텍스트 노드만 담는다**(오프셋 = data-start + nodeOffset).
- Produces:
  - `export interface AnnotationSelection { target: string; targetId: string | null; start: number; end: number; rect: { top: number; left: number } }`
  - `export function useTextSelection(enabled?: boolean): { selection: AnnotationSelection | null; clear: () => void }`
  - 주의: **selectedText는 여기서 산출하지 않는다** — 브라우저 `sel.toString()`은 블록 경계 개행이 부정확. 페이지(Task 7)가 `plain.slice(start, end)`로 정규화해 저장.

- [ ] **Step 1: 파일 생성**

```typescript
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
```

- [ ] **Step 2: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir lib`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/lib/hooks/useTextSelection.ts && git commit -m "feat(web): useTextSelection 훅 — mouseup/touchend+selectionchange 선택 계산"
```

---

### Task 4: AnnotatedText — 렌더링 전용 컴포넌트

**Files:**
- Create: `web/components/notes/AnnotatedText.tsx`

**Interfaces:**
- Consumes: Task 1 `walkTextSegments`/`extractPlainText`/`TextSegment`, Task 2 `resolveAnnotation`/`colorHex`, `UserQuestionAnnotation`(lib/types)
- Produces:
  - `export function AnnotatedText(props: { doc: any; target: string; targetId?: string | null; annotations: UserQuestionAnnotation[]; onMarkClick?: (id: string) => void; className?: string })`
  - DOM 규약(Task 3이 소비): 루트에 `data-annot-root data-target={target} data-target-id={targetId}`, 모든 텍스트 조각 span에 `data-start`/`data-end`. span 하나 = 단일 텍스트 노드.

- [ ] **Step 1: 파일 생성**

```tsx
'use client';

/**
 * 주석 마크가 입혀진 ProseMirror JSON 렌더러 — 렌더링 전용(선택 로직 없음).
 * 세그먼트를 주석 오프셋 경계로 분할해 span으로 쪼갠다.
 * 겹치는 주석은 createdAt ASC 정렬 후 마지막(최신)이 위에 렌더.
 */
import { useMemo } from 'react';
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

  const renderSegment = (seg: TextSegment) => {
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
            className="cursor-pointer transition-opacity hover:opacity-80"
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
```

- [ ] **Step 2: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir components`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/components/notes/AnnotatedText.tsx && git commit -m "feat(web): AnnotatedText — 주석 마크 렌더링 전용 컴포넌트"
```

---

### Task 5: AnnotationToolbar — 플로팅 툴바 / 모바일 시트

**Files:**
- Create: `web/components/notes/AnnotationToolbar.tsx`

**Interfaces:**
- Consumes: Task 2 상수(`MARK_STYLES`/`REASON_CODES`/`REASON_LABELS`/`ANNOTATION_COLORS`), Task 3 `AnnotationSelection`, 기존 `useCreateAnnotation`(lib/hooks)
- Produces:
  - `export function AnnotationToolbar(props: { questionId: string; selection: AnnotationSelection; canonicalText: string; onClose: () => void })`
  - `canonicalText`는 페이지가 `plain.slice(start, end)`로 산출해 넘긴다(Task 7).

- [ ] **Step 1: 파일 생성**

```tsx
'use client';

/**
 * 드래그 직후 뜨는 주석 작성 툴바.
 * 데스크톱: 선택 영역 위 플로팅 / 모바일(md 미만): 하단 고정 시트.
 * Esc로 닫기(선택 해제 포함).
 */
import { useEffect, useState } from 'react';
import { Highlighter, Underline, X } from 'lucide-react';
import { useCreateAnnotation } from '@/lib/hooks';
import {
  ANNOTATION_COLORS,
  REASON_CODES,
  REASON_LABELS,
  type MarkStyle,
  type ReasonCode,
} from '@/lib/annotations';
import type { AnnotationSelection } from '@/lib/hooks/useTextSelection';
import { Button } from '@/components/ui/button';

interface Props {
  questionId: string;
  selection: AnnotationSelection;
  canonicalText: string;
  onClose: () => void;
}

export function AnnotationToolbar({ questionId, selection, canonicalText, onClose }: Props) {
  const [markStyle, setMarkStyle] = useState<MarkStyle>('HIGHLIGHT');
  const [color, setColor] = useState('yellow');
  const [reasonCode, setReasonCode] = useState<ReasonCode | null>(null);
  const [memoText, setMemoText] = useState('');
  const create = useCreateAnnotation();

  // Esc → 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    create.mutate(
      {
        questionId,
        data: {
          target: selection.target,
          targetId: selection.targetId,
          markStyle,
          color,
          selectedText: canonicalText,
          selectionRange: { start: selection.start, end: selection.end },
          reasonCode: reasonCode ?? undefined,
          memoText: memoText.trim() || undefined,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      // 데스크톱: 선택 위 플로팅 / 모바일: 하단 시트(탭바 위)
      className="z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-2xl
                 max-md:fixed max-md:inset-x-3 max-md:bottom-16 max-md:w-auto
                 md:absolute md:-translate-x-1/2"
      style={
        typeof window !== 'undefined' && window.innerWidth >= 768
          ? { top: selection.rect.top - 8, left: selection.rect.left, transform: 'translate(-50%, -100%)' }
          : undefined
      }
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMarkStyle('HIGHLIGHT')}
            className={`rounded-md p-1.5 ${markStyle === 'HIGHLIGHT' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label="하이라이트"
          >
            <Highlighter size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMarkStyle('UNDERLINE')}
            className={`rounded-md p-1.5 ${markStyle === 'UNDERLINE' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label="밑줄"
          >
            <Underline size={15} />
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          {Object.entries(ANNOTATION_COLORS).map(([code, hex]) => (
            <button
              key={code}
              type="button"
              onClick={() => setColor(code)}
              className={`h-5 w-5 rounded-full border-2 ${color === code ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: hex }}
              aria-label={`색상 ${code}`}
            />
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-muted-foreground hover:text-foreground">
          <X size={15} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {REASON_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setReasonCode(reasonCode === code ? null : code)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              reasonCode === code
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-raised text-muted-foreground hover:text-foreground'
            }`}
          >
            {REASON_LABELS[code]}
          </button>
        ))}
      </div>

      <textarea
        value={memoText}
        onChange={(e) => setMemoText(e.target.value)}
        placeholder="메모 (선택)"
        className="mb-2 min-h-[56px] w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
      />

      <Button size="sm" className="w-full" onClick={save} disabled={create.isPending}>
        {create.isPending ? '저장 중…' : '주석 저장'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir components`
Expected: 에러 0. (`useCreateAnnotation` data 타입에 `selectionRange`/`selectedText`가 맞는지 이 단계에서 tsc가 검증)

- [ ] **Step 3: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/components/notes/AnnotationToolbar.tsx && git commit -m "feat(web): 주석 작성 플로팅 툴바 — 스타일·색·원인·메모, Esc 닫기, 모바일 시트"
```

---

### Task 6: AnnotationPanel — 문항 메모 / 텍스트 주석 2섹션

**Files:**
- Create: `web/components/notes/AnnotationPanel.tsx`

**Interfaces:**
- Consumes: Task 2 `getReasonLabel`/`colorHex`/`REASON_CODES`/`REASON_LABELS`/`AnchorStatus`, 기존 `useCreateAnnotation`/`useUpdateAnnotation`/`useDeleteAnnotation`
- Produces:
  - `export function AnnotationPanel(props: { questionId: string; annotations: UserQuestionAnnotation[]; statusById: Record<string, AnchorStatus>; focusedId: string | null; onFocus: (id: string | null) => void })`
  - `statusById`는 페이지(Task 7)가 각 주석의 target 평문으로 `resolveAnnotation`을 돌려 만든 맵. LOST → "위치 유실" 배지.

- [ ] **Step 1: 파일 생성**

```tsx
'use client';

/**
 * 주석 관리 패널 — 두 섹션:
 * ① 문항 메모(target=GENERAL, 앵커 없음) ② 텍스트 주석(드래그 앵커).
 * 인라인 수정/삭제. LOST 주석은 "위치 유실" 배지로 표시(데이터 보존).
 */
import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCreateAnnotation, useDeleteAnnotation, useUpdateAnnotation } from '@/lib/hooks';
import { colorHex, getReasonLabel, REASON_CODES, REASON_LABELS, type AnchorStatus } from '@/lib/annotations';
import type { UserQuestionAnnotation } from '@/lib/types';
import { Button } from '@/components/ui/button';

interface Props {
  questionId: string;
  annotations: UserQuestionAnnotation[];
  statusById: Record<string, AnchorStatus>;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
}

/** 한 주석의 인라인 편집 폼 (원인 + 메모) */
function EditForm({
  ann,
  questionId,
  onDone,
}: {
  ann: UserQuestionAnnotation;
  questionId: string;
  onDone: () => void;
}) {
  const [reasonCode, setReasonCode] = useState(ann.reasonCode ?? null);
  const [memoText, setMemoText] = useState(ann.memoText ?? '');
  const update = useUpdateAnnotation(questionId);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {REASON_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setReasonCode(reasonCode === code ? null : code)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              reasonCode === code
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-raised text-muted-foreground'
            }`}
          >
            {REASON_LABELS[code]}
          </button>
        ))}
      </div>
      <textarea
        value={memoText}
        onChange={(e) => setMemoText(e.target.value)}
        className="min-h-[56px] w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
        placeholder="메모"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              {
                annotationId: ann.id,
                data: { reasonCode: reasonCode ?? undefined, memoText: memoText.trim() || undefined },
              },
              { onSuccess: onDone },
            )
          }
        >
          저장
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          취소
        </Button>
      </div>
    </div>
  );
}

function AnnotationItem({
  ann,
  questionId,
  status,
  focused,
  onFocus,
}: {
  ann: UserQuestionAnnotation;
  questionId: string;
  status?: AnchorStatus;
  focused: boolean;
  onFocus: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteAnnotation(questionId);
  const ref = useRef<HTMLDivElement>(null);

  // 본문 마크 클릭으로 포커스되면 스크롤
  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focused]);

  return (
    <div
      ref={ref}
      className={`rounded-lg border p-3 ${focused ? 'border-primary' : 'border-border'}`}
      onClick={() => onFocus(ann.id)}
    >
      {ann.selectedText && (
        <p className="mb-1.5 text-xs italic text-foreground/80">
          <span
            className="rounded px-1"
            style={{ backgroundColor: `${colorHex(ann.color)}33` }}
          >
            &ldquo;{ann.selectedText}&rdquo;
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {ann.reasonCode && (
          <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {getReasonLabel(ann.reasonCode)}
          </span>
        )}
        {status === 'LOST' && (
          <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
            위치 유실
          </span>
        )}
      </div>
      {ann.memoText && !editing && (
        <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {ann.memoText}
        </p>
      )}
      {editing ? (
        <EditForm ann={ann} questionId={questionId} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="수정"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate(ann.id);
            }}
            className="text-muted-foreground hover:text-destructive"
            aria-label="삭제"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export function AnnotationPanel({ questionId, annotations, statusById, focusedId, onFocus }: Props) {
  const [addingMemo, setAddingMemo] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  const [newReason, setNewReason] = useState<string | null>(null);
  const create = useCreateAnnotation();

  const list = annotations || [];
  const generalMemos = list.filter((a) => a.target === 'GENERAL');
  const textMarks = list.filter((a) => a.target !== 'GENERAL');

  const saveMemo = () => {
    create.mutate(
      {
        questionId,
        data: {
          target: 'GENERAL',
          markStyle: 'HIGHLIGHT',
          color: 'yellow',
          reasonCode: newReason ?? undefined,
          memoText: newMemo.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setAddingMemo(false);
          setNewMemo('');
          setNewReason(null);
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      {/* ① 문항 메모 */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">문항 메모</h3>
          <button
            type="button"
            onClick={() => setAddingMemo((v) => !v)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="메모 추가"
          >
            <Plus size={15} />
          </button>
        </div>
        {addingMemo && (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {REASON_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setNewReason(newReason === code ? null : code)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    newReason === code
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-raised text-muted-foreground'
                  }`}
                >
                  {REASON_LABELS[code]}
                </button>
              ))}
            </div>
            <textarea
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              placeholder="이 문항에 대한 메모"
              className="min-h-[64px] w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
            />
            <Button size="sm" onClick={saveMemo} disabled={create.isPending || (!newMemo.trim() && !newReason)}>
              저장
            </Button>
          </div>
        )}
        {generalMemos.length === 0 && !addingMemo && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            + 버튼으로 문항 전체에 대한 메모를 남겨보세요.
          </p>
        )}
        <div className="space-y-2.5">
          {generalMemos.map((ann) => (
            <AnnotationItem
              key={ann.id}
              ann={ann}
              questionId={questionId}
              status={statusById[ann.id]}
              focused={focusedId === ann.id}
              onFocus={onFocus}
            />
          ))}
        </div>
      </section>

      {/* ② 텍스트 주석 */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-bold">텍스트 주석</h3>
        {textMarks.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            본문에서 텍스트를 드래그하면 하이라이트와 메모를 남길 수 있어요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {textMarks.map((ann) => (
              <AnnotationItem
                key={ann.id}
                ann={ann}
                questionId={questionId}
                status={statusById[ann.id]}
                focused={focusedId === ann.id}
                onFocus={onFocus}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 타입/린트**

Run: `npx tsc --noEmit && npx next lint --dir components`
Expected: 에러 0

- [ ] **Step 3: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/components/notes/AnnotationPanel.tsx && git commit -m "feat(web): 주석 패널 — 문항 메모/텍스트 주석 2섹션, 인라인 수정·삭제, 위치유실 배지"
```

---

### Task 7: 상세 페이지 실데이터화 + 통합, NotesDashboard 링크

**Files:**
- Modify: `web/app/notes/[questionId]/page.tsx` (전체 재작성)
- Modify: `web/components/notes/NotesDashboard.tsx:256` (링크에 sessionId)

**Interfaces:**
- Consumes: Task 1-6 전부, 기존 `useSession`(lib/hooks:429, `fetchExamSession` 래핑), `useMyNotes`, `useQuestion`, `useAnnotations`, `SessionQuestionItem`/`SessionDetail`(lib/types)
- Produces: 완성된 상세 페이지. mock(i===0 정답 하드코딩, 고정 "오답", 죽은 textarea) 제거.

- [ ] **Step 1: NotesDashboard 링크 수정**

`web/components/notes/NotesDashboard.tsx:256`:

```tsx
// 변경 전
href={`/notes/${q.questionId}`}
// 변경 후 — 어떤 세션의 오답인지 상세 페이지에 전달
href={`/notes/${q.questionId}?sessionId=${q.sessionId}`}
```

- [ ] **Step 2: 상세 페이지 재작성**

`web/app/notes/[questionId]/page.tsx` 전체 교체:

```tsx
'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Minus, X } from 'lucide-react';
import { useAnnotations, useMyNotes, useQuestion, useSession } from '@/lib/hooks';
import { extractPlainText } from '@/lib/prosemirror';
import { resolveAnnotation, type AnchorStatus } from '@/lib/annotations';
import { useTextSelection } from '@/lib/hooks/useTextSelection';
import { AnnotatedText } from '@/components/notes/AnnotatedText';
import { AnnotationToolbar } from '@/components/notes/AnnotationToolbar';
import { AnnotationPanel } from '@/components/notes/AnnotationPanel';

function NoteDetail() {
  const { questionId } = useParams() as { questionId: string };
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');

  // sessionId 쿼리가 없으면 오답노트 목록에서 이 문항의 첫 오답 세션으로 fallback
  const { data: notes } = useMyNotes(undefined, !sessionIdParam);
  const sessionId =
    sessionIdParam ??
    (notes?.wrongQuestions || []).find((w) => w.questionId === questionId)?.sessionId ??
    null;

  const { data: session, isLoading: sessionLoading } = useSession(sessionId);
  // 세션을 못 찾는 경로(직접 URL 진입 등) 대비 원본 문항 fallback
  const { data: question, isLoading: questionLoading } = useQuestion(questionId);
  const { data: annotations } = useAnnotations(questionId);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { selection, clear } = useTextSelection();

  const sq = useMemo(
    () => (session?.questions || []).find((q) => q.questionId === questionId) ?? null,
    [session, questionId],
  );
  const snapshot = sq?.snapshot ?? null;
  const answer = sq?.answer ?? null;

  // 렌더에 쓸 doc들 — snapshot 우선, 없으면 원본 문항
  const stemDoc = snapshot?.stem ?? question?.stem;
  const passageDoc = snapshot?.passage ?? question?.passage?.content;
  const explanationDoc = snapshot?.explanation ?? question?.explanation;
  const choices = snapshot?.choices ?? question?.choices?.content ?? null;
  const questionType = snapshot?.questionType ?? question?.questionType;
  const difficulty = snapshot?.difficulty ?? question?.difficulty;
  const subjectName = session?.subject?.name ?? question?.subject?.name;

  // target별 평문 — selectedText 정규화·status 계산에 사용
  const plainFor = useMemo(() => {
    const map = new Map<string, string>();
    if (stemDoc) map.set('STEM', extractPlainText(stemDoc));
    if (passageDoc) map.set('PASSAGE', extractPlainText(passageDoc));
    if (explanationDoc) map.set('EXPLANATION', extractPlainText(explanationDoc));
    if (Array.isArray(choices)) {
      for (const c of choices) {
        if (c?.id && c?.content) map.set(`CHOICES:${c.id}`, extractPlainText(c.content));
      }
    }
    return map;
  }, [stemDoc, passageDoc, explanationDoc, choices]);

  const plainOf = (target: string, targetId?: string | null) =>
    plainFor.get(targetId ? `${target}:${targetId}` : target) ?? '';

  // 패널 배지용 — 주석별 앵커 status (렌더러와 동일한 resolveAnnotation 사용)
  const statusById = useMemo(() => {
    const out: Record<string, AnchorStatus> = {};
    for (const ann of annotations || []) {
      if (ann.target === 'GENERAL') continue;
      const anchor = resolveAnnotation(plainOf(ann.target, ann.targetId), ann);
      if (anchor) out[ann.id] = anchor.status;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, plainFor]);

  // 선택된 텍스트의 정본 — 브라우저 toString 대신 평문 slice
  const canonicalText = selection
    ? plainOf(selection.target, selection.targetId).slice(selection.start, selection.end)
    : '';

  if (sessionLoading || questionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!stemDoc) {
    return <div className="p-10">문항을 찾을 수 없습니다.</div>;
  }

  const anns = annotations || [];
  const isCorrect = answer?.isCorrect; // true | false | null(서술형 미채점) | undefined(세션 없음)

  return (
    <main className="relative mx-auto w-full max-w-5xl overflow-x-hidden p-4 md:p-10">
      <Link
        href="/notes"
        className="mb-8 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> 오답노트로 돌아가기
      </Link>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* 문항 본문 */}
        <section className="min-w-0 flex-1">
          <div className="mb-6">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-primary">
              {subjectName} · {questionType} · 난이도 {difficulty}
            </span>
            <AnnotatedText
              doc={stemDoc}
              target="STEM"
              annotations={anns}
              onMarkClick={setFocusedId}
              className="text-xl font-bold leading-relaxed"
            />
          </div>

          {/* 지문 */}
          {passageDoc && (
            <section className="mb-8 rounded-xl border border-border bg-card p-5">
              <span className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                지문
              </span>
              <AnnotatedText
                doc={passageDoc}
                target="PASSAGE"
                annotations={anns}
                onMarkClick={setFocusedId}
                className="text-sm leading-relaxed"
              />
            </section>
          )}

          {/* 선지 (객관식) — snapshot isCorrect + 내 선택으로 실데이터 표시 */}
          {questionType === '객관식' && Array.isArray(choices) && choices.length > 0 && (
            <div className="mb-10 space-y-3">
              {choices.map((c: any, i: number) => {
                const correct = c.isCorrect === true;
                const selected = (answer?.selectedChoiceIds || []).includes(c.id);
                return (
                  <div
                    key={c.id ?? i}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm font-medium transition-colors ${
                      correct
                        ? 'border-correct/30 bg-correct/10'
                        : selected
                          ? 'border-wrong/30 bg-wrong/10'
                          : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[11px] font-bold ${
                          correct
                            ? 'bg-correct text-white'
                            : selected
                              ? 'bg-wrong text-white'
                              : 'bg-surface-raised text-muted-foreground'
                        }`}
                      >
                        {correct ? <Check size={12} /> : selected ? <X size={12} /> : i + 1}
                      </span>
                      {c.content ? (
                        <AnnotatedText
                          doc={c.content}
                          target="CHOICES"
                          targetId={c.id}
                          annotations={anns}
                          onMarkClick={setFocusedId}
                          className="min-w-0 break-words"
                        />
                      ) : null}
                    </div>
                    {(correct || selected) && (
                      <span
                        className={`flex-none rounded-md px-2 py-1 text-[10px] font-bold ${
                          correct ? 'bg-correct/20 text-correct' : 'bg-wrong/20 text-wrong'
                        }`}
                      >
                        {correct ? '정답' : '내가 고른 답'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 주관식 — 내 답/정답 */}
          {questionType === '주관식' && (
            <div className="mb-10 space-y-3">
              {answer?.answerText != null && (
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="mb-1 block text-[10px] font-bold text-muted-foreground">내 답안</span>
                  <p className="whitespace-pre-wrap">{answer.answerText}</p>
                </div>
              )}
              {snapshot?.correctAnswerText && (
                <div className="rounded-xl border border-correct/30 bg-correct/10 p-4 text-sm">
                  <span className="mb-1 block text-[10px] font-bold text-correct">정답</span>
                  <p className="whitespace-pre-wrap">{snapshot.correctAnswerText}</p>
                </div>
              )}
            </div>
          )}

          {/* 해설 */}
          {explanationDoc && (
            <section className="mt-10 rounded-xl border border-border/50 bg-surface-raised p-6">
              <span className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                해설
              </span>
              <AnnotatedText
                doc={explanationDoc}
                target="EXPLANATION"
                annotations={anns}
                onMarkClick={setFocusedId}
                className="text-sm leading-relaxed text-foreground/80"
              />
            </section>
          )}
        </section>

        {/* 사이드 — 풀이 결과 + 주석 패널. 모바일에선 본문 아래 스택 */}
        <aside className="flex w-full flex-col gap-5 md:w-[300px]">
          {isCorrect !== undefined && (
            <section className="rounded-xl border border-border bg-card p-5">
              <span className="mb-3 block text-xs font-medium text-muted-foreground">이번 풀이 결과</span>
              {isCorrect === false && (
                <div className="flex items-center gap-2 text-lg font-semibold text-wrong">
                  <X size={20} strokeWidth={2} /> 오답
                </div>
              )}
              {isCorrect === true && (
                <div className="flex items-center gap-2 text-lg font-semibold text-correct">
                  <Check size={20} strokeWidth={2} /> 정답
                </div>
              )}
              {isCorrect === null && (
                <div className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                  <Minus size={20} strokeWidth={2} /> 자가채점 대기
                </div>
              )}
            </section>
          )}

          <AnnotationPanel
            questionId={questionId}
            annotations={anns}
            statusById={statusById}
            focusedId={focusedId}
            onFocus={setFocusedId}
          />
        </aside>
      </div>

      {/* 드래그 선택 → 주석 작성 툴바 */}
      {selection && canonicalText && (
        <AnnotationToolbar
          questionId={questionId}
          selection={selection}
          canonicalText={canonicalText}
          onClose={clear}
        />
      )}
    </main>
  );
}

export default function NoteDetailPage() {
  // useSearchParams는 Suspense 경계 필요 (Next 14)
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      }
    >
      <NoteDetail />
    </Suspense>
  );
}
```

주의: `useQuestion`의 반환 타입에 `passage`가 없으면 `question?.passage?.content` 부분에서 tsc가 실패할 수 있다. 그 경우 해당 fallback을 `undefined`로 두고 snapshot 경로만 사용 (`const passageDoc = snapshot?.passage;`) — 지문은 세션 컨텍스트에서만 표시.

- [ ] **Step 3: 타입/린트**

Run: `npx tsc --noEmit && npx next lint`
Expected: 에러 0

- [ ] **Step 4: 프로드 빌드 확인 (Suspense/useSearchParams 검증)**

Run: `npm run build`
Expected: `app/notes/[questionId]` 빌드 통과, useSearchParams Suspense 에러 없음

- [ ] **Step 5: Commit**

```bash
cd C:/Users/kryuk/dev && git add web/app/notes/[questionId]/page.tsx web/components/notes/NotesDashboard.tsx && git commit -m "feat(web): 오답노트 상세 실데이터화 + 텍스트 주석 통합 — mock 제거"
```

---

### Task 8: 수동 E2E 검증

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1-7 전체. 로컬 백엔드(:3000 API) + 프론트 dev 서버 필요 — 포트 충돌 주의(CLAUDE.md), 백엔드 먼저 띄우고 프론트는 `PORT=3001 npm run dev` 또는 순차 실행.
- Produces: 검증 결과 보고

- [ ] **Step 1: 서버 기동**

```bash
# 터미널 1 (백엔드, repo 루트)
npm run start:dev
# 터미널 2 (프론트)
cd web && npx next dev -p 3001
```

주의: `web/lib/api.ts`의 API base가 :3000을 가리키는지 확인 후 진행.

- [ ] **Step 2: 시나리오 체크리스트** (브라우저 http://localhost:3001)

1. 로그인 → 오답이 있는 계정으로 `/notes` → 오답 카드 클릭 → URL에 `?sessionId=` 포함 확인
2. 상세: 실제 정답 선지에 "정답", 내가 고른 선지에 "내가 고른 답" 표시 (하드코딩 i===0/1 아님 — 다른 문항에서 위치 달라지는지 확인)
3. "이번 풀이 결과"가 실제 채점값 (오답 문항에서 "오답")
4. 발문 텍스트 드래그 → 툴바 표시 → 색·스타일·원인·메모 입력 → 저장 → 마크 즉시 표시
5. 새로고침 → 마크 재렌더 (NORMAL 경로)
6. 해설·지문·선지 각각에서도 드래그 저장 동작
7. Esc → 툴바 닫힘
8. 패널: 텍스트 주석 항목에 인용+원인 한글 라벨, 수정(원인 변경) → 반영, 삭제 → 마크 사라짐
9. 문항 메모(+) → GENERAL 메모 생성/수정/삭제
10. 본문 마크 클릭 → 패널 해당 항목 포커스(테두리+스크롤)
11. (선택) 저작 화면에서 해당 문항 stem 문구 수정 → 상세 재방문 → RECOVERED(마크 이동) 또는 LOST("위치 유실" 배지) 확인
12. 모바일 뷰포트(390px): 드래그 → 하단 시트, 패널 본문 아래 스택, 가로 오버플로 없음
13. sessionId 쿼리 없이 직접 `/notes/{questionId}` 진입 → fallback 세션으로 정상 렌더

- [ ] **Step 3: 콘솔 확인**

DevTools 콘솔에 hydration/undefined 에러 없음 확인.

- [ ] **Step 4: 이슈 있으면 수정 후 커밋, 없으면 종료 보고**

---

## Self-Review 결과

- **스펙 커버리지**: 앵커 모델+3-status(T2), visitor 공통화(T1), 역할 분리 렌더러/선택 훅(T3·T4), data-start/end(T4), createdAt ASC(T4), 툴바+Esc+모바일 시트(T5), 패널 2섹션+getReasonLabel+위치유실(T6), 실데이터+sessionId 링크+fallback 규칙(T7), 수동 검증 시나리오(T8) — 스펙 전 항목 매핑 확인.
- **Placeholder**: 없음 — 모든 코드 블록 완전체.
- **타입 일관성**: `TextSegment`(T1)↔T4 import, `AnnotationSelection`(T3)↔T5·T7, `AnchorStatus`/`resolveAnnotation`(T2)↔T4·T6·T7, `canonicalText` prop(T5)↔T7 산출 — 명칭·시그니처 일치.
- **알려진 리스크(계획에 명시)**: `useQuestion` 반환 타입에 `passage` 없을 가능성(T7 Step 2 주의로 대응), `useSearchParams` Suspense(T7에서 경계 적용 + build 검증 단계).
