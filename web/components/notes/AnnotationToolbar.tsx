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
