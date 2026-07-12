'use client';

/**
 * 드래그 직후 뜨는 주석 작성 툴바.
 * 데스크톱: 선택 영역 위 플로팅 / 모바일(md 미만): 하단 고정 시트.
 * Esc로 닫기(선택 해제 포함).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Highlighter, Underline, X } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

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

  // 데스크톱 플로팅 위치 — 측정 후 뷰포트 안으로 클램핑(화면 밖으로 안 나가게).
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) {
      setPos(null); // 모바일은 하단 시트(클래스)로
      return;
    }
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const M = 8; // 가장자리 여백
    let left = selection.rect.left - w / 2;
    left = Math.max(M, Math.min(left, window.innerWidth - w - M));
    let top = selection.rect.top - h - M; // 기본: 선택 위
    if (top < M) top = selection.rect.bottom + M; // 위 공간 없으면 아래로
    top = Math.max(M, Math.min(top, window.innerHeight - h - M));
    setPos({ top, left });
  }, [selection]);

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
      ref={ref}
      // 데스크톱: 선택 근처 플로팅(뷰포트 클램핑) / 모바일: 하단 시트(탭바 위)
      className="surface-sheen z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg
                 max-md:fixed max-md:inset-x-3 max-md:bottom-16 max-md:w-auto
                 md:fixed"
      style={pos ? { top: pos.top, left: pos.left } : undefined}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMarkStyle('HIGHLIGHT')}
            aria-pressed={markStyle === 'HIGHLIGHT'}
            className={`rounded-md p-1.5 transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${markStyle === 'HIGHLIGHT' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label="하이라이트"
          >
            <Highlighter size={15} />
          </button>
          <button
            type="button"
            onClick={() => setMarkStyle('UNDERLINE')}
            aria-pressed={markStyle === 'UNDERLINE'}
            className={`rounded-md p-1.5 transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${markStyle === 'UNDERLINE' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
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
              aria-pressed={color === code}
              className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${color === code ? 'ring-2 ring-foreground ring-offset-2 ring-offset-popover' : ''}`}
              style={{ backgroundColor: hex }}
              aria-label={`색상 ${code}`}
            >
              {color === code && <Check size={13} strokeWidth={3} className="text-background" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
        >
          <X size={15} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {REASON_CODES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setReasonCode(reasonCode === code ? null : code)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover ${
              reasonCode === code
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-raised text-muted-foreground hover:text-foreground'
            }`}
          >
            {REASON_LABELS[code]}
          </button>
        ))}
      </div>

      <Textarea
        value={memoText}
        onChange={(e) => setMemoText(e.target.value)}
        placeholder="메모 (선택)"
        className="mb-2 min-h-[56px] resize-none bg-background text-xs"
      />

      <Button size="sm" className="w-full" onClick={save} disabled={create.isPending}>
        {create.isPending ? '저장 중…' : '주석 저장'}
      </Button>
    </div>
  );
}
