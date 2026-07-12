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
import { Textarea } from '@/components/ui/textarea';

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
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
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
        className="min-h-[56px] resize-none text-xs"
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
      className={`cursor-pointer rounded-lg border p-3 transition-colors duration-150 ease-swift ${
        focused ? 'border-primary bg-accent' : 'border-border hover:bg-accent'
      }`}
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
        <div className="mt-2 flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-swift hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-swift hover:bg-surface-raised hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
          <h3 className="text-sm font-semibold">문항 메모</h3>
          <button
            type="button"
            onClick={() => setAddingMemo((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-swift hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    newReason === code
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-raised text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {REASON_LABELS[code]}
                </button>
              ))}
            </div>
            <Textarea
              value={newMemo}
              onChange={(e) => setNewMemo(e.target.value)}
              placeholder="이 문항에 대한 메모"
              className="min-h-[64px] resize-none text-xs"
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
        <h3 className="mb-3 text-sm font-semibold">텍스트 주석</h3>
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
