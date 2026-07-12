"use client";
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Link2, PencilLine, Plus, Sparkles, Trash2, X } from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { buildRichDoc, extractPlainText } from "@/lib/prosemirror";
import type { CanvasCard } from "./AuthoringCanvas";

/**
 * 캔버스 문항 카드 — 읽기/편집 두 모드.
 * 읽기: 지문(공유 배지 포함)·발문·선지(정답 강조)·접이식 정답/해설 + ✨AI·✏️편집·🗑삭제.
 * 편집: 발문·지문·해설은 Tiptap, 선지는 텍스트 입력 + 정답 토글, 주관식은 정답 입력.
 */
export function AuthoringCanvasCard({
  card,
  index,
  editing,
  sharedWith,
  onStartEdit,
  onFinishEdit,
  onChange,
  onRemove,
  onAskAi,
}: {
  card: CanvasCard;
  index: number;
  editing: boolean;
  /** 같은 지문을 공유하는 다른 카드들의 1-기반 문항 번호. */
  sharedWith: number[];
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onChange: (patch: Partial<CanvasCard>) => void;
  onRemove: () => void;
  onAskAi: () => void;
}) {
  const [showAnswer, setShowAnswer] = useState(false);

  const explanationText = extractPlainText(card.explanation).trim();

  /* ── 공유 배지 — 읽기/편집 공통 ── */
  const shareBadge =
    sharedWith.length > 0 ? (
      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Link2 size={10} strokeWidth={2.5} />
        문항 {sharedWith.join("·")}번과 지문 공유
      </span>
    ) : null;

  if (!editing) {
    return (
      <article className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="font-mono">문제 {index + 1}</span>
            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-muted-foreground">{card.type}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              onClick={onAskAi}
              aria-label="AI에게 이 문항 수정 요청"
              title="AI에게 수정 요청"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Sparkles size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              aria-label="직접 수정"
              title="직접 수정"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              <PencilLine size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="문항 삭제"
              title="문항 삭제"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-wrong/10 hover:text-wrong"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* 지문 */}
        {card.passage && (
          <div className="mb-3 rounded-lg bg-surface-raised px-3 py-2.5 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium text-foreground/70">지문</span>
              {shareBadge}
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{extractPlainText(card.passage)}</p>
          </div>
        )}

        {/* 발문 */}
        <p className="text-sm leading-relaxed text-foreground">{extractPlainText(card.stem)}</p>

        {/* 선지 */}
        {card.type === "객관식" && (
          <ol className="mt-2.5 space-y-1.5 text-sm">
            {card.choices.map((ch, j) => (
              <li
                key={j}
                className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 ${
                  j === card.correct
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <span className="font-mono text-xs leading-5">{j + 1}.</span>
                <span>{ch}</span>
                {j === card.correct && <Check size={14} strokeWidth={2.5} className="ml-auto mt-0.5 flex-none text-primary" />}
              </li>
            ))}
          </ol>
        )}

        {/* 정답 및 해설 — 접이식 */}
        {(card.type === "주관식" || explanationText) && (
          <div className="mt-3 border-t border-border pt-2.5">
            <button
              type="button"
              onClick={() => setShowAnswer((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              정답 및 해설
              {showAnswer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showAnswer && (
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {card.type === "주관식" && (
                  <p>
                    <span className="font-medium text-foreground/70">정답: </span>
                    {card.answerText.trim() || "서술형 (자기채점)"}
                  </p>
                )}
                {explanationText && <p className="whitespace-pre-wrap leading-relaxed">{explanationText}</p>}
              </div>
            )}
          </div>
        )}
      </article>
    );
  }

  /* ── 편집 모드 ── */
  return (
    <article className="rounded-xl border border-primary/50 bg-card p-5">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="font-mono">문제 {index + 1}</span>
          <span className="rounded bg-surface-raised px-1.5 py-0.5 text-muted-foreground">{card.type}</span>
          <span className="text-[10px] font-medium text-primary">편집 중</span>
        </div>
        <button
          type="button"
          onClick={onFinishEdit}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Check size={13} strokeWidth={2.5} /> 완료
        </button>
      </div>

      {/* 지문 */}
      {card.passage != null ? (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">지문</label>
              {shareBadge}
            </div>
            <button
              type="button"
              onClick={() => onChange({ passage: null })}
              className="text-xs text-muted-foreground transition-colors hover:text-wrong"
            >
              지문 제거
            </button>
          </div>
          {sharedWith.length > 0 && (
            <p className="mb-1.5 text-[11px] text-primary/80">
              이 지문은 문항 {sharedWith.join("·")}번과 공유돼요 — 완료하면 함께 수정됩니다.
            </p>
          )}
          <TiptapEditor
            value={card.passage}
            onChange={(json) => onChange({ passage: json })}
            placeholder="지문(본문)을 입력하세요."
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ passage: buildRichDoc("") })}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus size={13} strokeWidth={2} /> 지문 추가
        </button>
      )}

      {/* 발문 */}
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">발문</label>
      <div className="mb-4">
        <TiptapEditor
          value={card.stem}
          onChange={(json) => onChange({ stem: json })}
          placeholder="문항의 발문을 입력하세요."
        />
      </div>

      {/* 객관식: 선지 편집 */}
      {card.type === "객관식" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            선지 <span className="font-normal">(번호를 눌러 정답 지정)</span>
          </label>
          <div className="space-y-2">
            {card.choices.map((choice, j) => (
              <div key={j} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ correct: j })}
                  aria-label={`${j + 1}번을 정답으로`}
                  aria-pressed={card.correct === j}
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border font-mono text-xs font-medium transition-colors ${
                    card.correct === j
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {j + 1}
                </button>
                <input
                  value={choice}
                  onChange={(e) => {
                    const next = [...card.choices];
                    next[j] = e.target.value;
                    onChange({ choices: next });
                  }}
                  placeholder={`선지 ${j + 1}`}
                  className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (card.choices.length <= 2) return;
                    const next = card.choices.filter((_, k) => k !== j);
                    // 정답 인덱스 보정 — 지운 선지 앞이면 그대로, 뒤면 한 칸 당김, 정답 자체를 지웠으면 0번.
                    const correct = card.correct === j ? 0 : card.correct > j ? card.correct - 1 : card.correct;
                    onChange({ choices: next, correct });
                  }}
                  disabled={card.choices.length <= 2}
                  aria-label={`선지 ${j + 1} 삭제`}
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-wrong disabled:opacity-30"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
          {card.choices.length < 8 && (
            <button
              type="button"
              onClick={() => onChange({ choices: [...card.choices, ""] })}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus size={13} strokeWidth={2} /> 선지 추가
            </button>
          )}
        </div>
      )}

      {/* 주관식: 정답 */}
      {card.type === "주관식" && (
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            정답 <span className="font-normal">(비우면 서술형·자기채점)</span>
          </label>
          <input
            value={card.answerText}
            onChange={(e) => onChange({ answerText: e.target.value })}
            placeholder="단답 정답을 입력하세요."
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}

      {/* 해설 */}
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">해설</label>
      <TiptapEditor
        value={card.explanation}
        onChange={(json) => onChange({ explanation: json })}
        placeholder="해설을 입력하세요 (선택)."
      />
    </article>
  );
}
