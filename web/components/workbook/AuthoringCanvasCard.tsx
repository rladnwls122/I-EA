"use client";
import { useState } from "react";
import {
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { SelfReviewChip } from "./SelfReviewChip";
import { isRichEmpty } from "@/lib/prosemirror";
import { buildRichDoc } from "@/lib/prosemirror-assemble";
import { RichContent } from "@/components/editor/RichContent";
import { formatPoints } from "@/lib/rubric";
import type { RubricCriterion } from "@/lib/types";
import type { CanvasCard, CanvasChoice } from "./AuthoringCanvas";

/** 유형 전환 시 선지/정답 필드를 유실 없이 맞춰주는 기본값. */
const DEFAULT_CHOICES = (): CanvasChoice[] =>
  Array.from({ length: 4 }, () => ({
    content: buildRichDoc(""),
    explanation: buildRichDoc(""),
    showExplanation: false,
  }));

/** 채점기준 개수 상한 — 서버 RUBRIC_MAX_CRITERIA와 같은 값이어야 한다(넘으면 저장이 400). */
const MAX_RUBRIC_CRITERIA = 12;

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
  onRegenerateChoices,
  canRegenerate = false,
  regenerating = false,
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
  /** AI 선지 재생성. 저장된 문항에서만 호출 가능하다(canRegenerate로 게이팅). */
  onRegenerateChoices?: () => void;
  canRegenerate?: boolean;
  regenerating?: boolean;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  /** "#" 유무 관계없이 입력받아 정규화된 이름만 저장(표시할 때 #를 붙인다). */
  const addKeyword = () => {
    const name = keywordInput.trim().replace(/^#/, "");
    if (!name) return;
    if (card.keywords.some((k) => k.toLowerCase() === name.toLowerCase())) {
      setKeywordInput("");
      return; // 중복 무시
    }
    onChange({ keywords: [...card.keywords, name] });
    setKeywordInput("");
  };
  const removeKeyword = (name: string) =>
    onChange({ keywords: card.keywords.filter((k) => k !== name) });

  /* ── 서술형 채점기준표 ──
     id는 여기서 만들지 않는다 — 저장 페이로드가 순서대로 `c1`..로 다시 매긴다(선지와 같다).
     편집 중에는 배열 인덱스로만 다루므로 중간 삭제·재배열이 id를 흔들지 않는다. */
  const rubric = card.rubric ?? [];
  const rubricTotal = rubric.reduce((sum, c) => sum + (c.points || 0), 0);

  const addCriterion = () =>
    onChange({ rubric: [...rubric, { id: "", text: "", points: 1 }] });
  const updateCriterion = (index: number, patch: Partial<RubricCriterion>) =>
    onChange({ rubric: rubric.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  const removeCriterion = (index: number) =>
    onChange({ rubric: rubric.filter((_, i) => i !== index) });

  // 텍스트 유무가 아니라 내용 유무로 본다 — 이미지만 있는 해설(Phase 2)도 "있음"이다.
  const hasExplanation = !isRichEmpty(card.explanation);

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
      <article className="group rounded-xl border border-border bg-card p-4 shadow-surface transition-colors duration-150 ease-swift hover:border-primary/40 hover:bg-accent sm:p-5">
        {/* 헤더 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <GripVertical
              size={14}
              className="cursor-grab text-muted-foreground"
              aria-label="드래그해서 순서 변경"
            />
            <span className="font-mono">문제 {index + 1}</span>
            <span className="rounded bg-surface-raised px-1.5 py-0.5 text-muted-foreground">{card.type}</span>
            <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
              {card.points}점
            </span>
            {/* AI 검수 결과(#34) — 적용 후에도 카드에 남는다. undefined는 "판정 없음"이지
                "기다리는 중"이 아니다(기다림은 채팅 제안 쪽에서 끝난다). */}
            <SelfReviewChip review={card.review ?? null} />
          </div>
          {/* 모바일(<md)에서는 hover가 없어 group-hover로는 도달 불가 — 항상 노출 + 40px 탭 타깃.
              md 이상(마우스)에서는 기존 hover/focus-within 노출 동작을 유지한다. */}
          <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={onAskAi}
              aria-label="AI에게 이 문항 수정 요청"
              title="AI에게 수정 요청"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-swift hover:bg-purple/10 hover:text-purple md:h-7 md:w-7"
            >
              <Sparkles size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              aria-label="직접 수정"
              title="직접 수정"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground md:h-7 md:w-7"
            >
              <PencilLine size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label="문항 삭제"
              title="문항 삭제"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-wrong/10 hover:text-wrong md:h-7 md:w-7"
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
            <RichContent value={card.passage} className="leading-relaxed" />
          </div>
        )}

        {/* 발문 */}
        <RichContent value={card.stem} className="text-sm leading-relaxed text-foreground" />

        {/* 선지 — 공개 설정된 선지별 해설도 함께 표시 */}
        {card.type === "객관식" && (
          <ol className="mt-2.5 space-y-1.5 text-sm">
            {card.choices.map((ch, j) => (
              <li
                key={j}
                className={`rounded-lg border px-3 py-1.5 ${
                  j === card.correct
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="font-mono text-xs leading-5">{j + 1}.</span>
                  <RichContent value={ch.content} />
                  {j === card.correct && (
                    <Check size={14} strokeWidth={2.5} className="ml-auto mt-0.5 flex-none text-primary" />
                  )}
                </div>
                {!isRichEmpty(ch.explanation) && ch.showExplanation && (
                  <div className="mt-1 pl-6 text-xs leading-relaxed text-muted-foreground">
                    <RichContent value={ch.explanation} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {/* 정답 및 해설 — 접이식 */}
        {(card.type === "주관식" || hasExplanation) && (
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
                {/* 채점기준표가 있으면 배점과 함께 — 응시자가 결과 화면에서 볼 체크리스트 그대로. */}
                {rubric.length > 0 && (
                  <div>
                    <span className="font-medium text-foreground/70">
                      채점기준 (합계 {formatPoints(rubricTotal)}점):
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {rubric.map((c, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="font-mono">{j + 1}.</span>
                          <span className="flex-1">{c.text}</span>
                          <span className="flex-none font-mono tabular-nums">
                            {formatPoints(c.points)}점
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasExplanation && <RichContent value={card.explanation} className="leading-relaxed" />}
              </div>
            )}
          </div>
        )}

        {/* #키워드 칩 — 있을 때만 */}
        {card.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {card.keywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                #{k}
              </span>
            ))}
          </div>
        )}
      </article>
    );
  }

  /* ── 편집 모드 ── */
  return (
    <article className="rounded-xl border border-primary/50 bg-card p-4 sm:p-5">
      {/* 헤더 — 유형 전환 토글 + 배점. 모바일에서 안 들어가면 다음 줄로 넘어가도록 flex-wrap */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="font-mono">문제 {index + 1}</span>
          {/* 유형 자유 전환 — 기존 입력은 유지, 없는 필드는 기본값 보충 */}
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["객관식", "주관식"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (card.type === t) return;
                  onChange(
                    t === "객관식"
                      ? {
                          type: t,
                          choices: card.choices.length >= 2 ? card.choices : DEFAULT_CHOICES(),
                          correct: card.correct >= 0 ? card.correct : 0,
                        }
                      : { type: t, correct: -1 },
                  );
                }}
                aria-pressed={card.type === t}
                className={`px-2 py-1 text-[11px] transition-colors ${
                  card.type === t
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            배점
            <input
              type="number"
              min={0}
              step={0.5}
              value={card.points}
              onChange={(e) => onChange({ points: Math.max(0, Number(e.target.value) || 0) })}
              className="h-6 w-14 rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <span className="text-[10px] font-medium text-primary">편집 중</span>
        </div>
        <button
          type="button"
          onClick={onFinishEdit}
          className="flex flex-none items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
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
            allowImages
            allowMath
            allowTables
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
          allowImages
          allowMath
          allowTables
        />
      </div>

      {/* 객관식: 선지 편집 */}
      {card.type === "객관식" && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-muted-foreground">
              선지 <span className="font-normal">(번호를 눌러 정답 지정)</span>
            </label>
            {/* AI 선지 재생성 — 편집기 일원화(#41 Phase 3)로 사라졌던 원클릭.
                서버가 소유권·과목·난이도를 문항 행에서 읽으므로 **저장된 문항에서만** 부를 수 있다.
                (옛 편집기의 같은 버튼은 임시 id로 호출해 실제로는 동작하지 않는 죽은 코드였다.) */}
            <button
              type="button"
              onClick={onRegenerateChoices}
              disabled={!canRegenerate || regenerating}
              title={
                canRegenerate
                  ? "정답 포함 선지 전체를 AI로 다시 만듭니다 (저장 전까지 되돌릴 수 있어요)"
                  : "먼저 문제집을 저장하면 쓸 수 있어요"
              }
              className="flex flex-none items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-purple/10 hover:text-purple disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              {regenerating ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Sparkles size={11} strokeWidth={2} />
              )}
              선지 재생성
            </button>
          </div>
          <div className="space-y-2.5">
            {card.choices.map((choice, j) => (
              <div key={j} className="space-y-1">
                <div className="flex items-center gap-2">
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
                  {/* 선지도 rich다(#41). 수식이 실린 선지를 평문 칸에서 고치면 통째로
                      주저앉기 때문 — 표·이미지는 선지에 과해서 버튼을 띄우지 않는다. */}
                  <div className="min-w-0 flex-1">
                    <TiptapEditor
                      value={choice.content}
                      onChange={(json) => {
                        const next = [...card.choices];
                        next[j] = { ...next[j], content: json };
                        onChange({ choices: next });
                      }}
                      placeholder={`선지 ${j + 1}`}
                      minHeight="36px"
                      allowMath
                    />
                  </div>
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
                {/* 선지별 해설 + 공개/비공개 토글 */}
                <div className="flex items-center gap-2 pl-11">
                  <div className="min-w-0 flex-1">
                    <TiptapEditor
                      value={choice.explanation}
                      onChange={(json) => {
                        const next = [...card.choices];
                        next[j] = { ...next[j], explanation: json };
                        onChange({ choices: next });
                      }}
                      placeholder="이 선지의 해설 (선택)"
                      minHeight="32px"
                      allowMath
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...card.choices];
                      next[j] = { ...next[j], showExplanation: !next[j].showExplanation };
                      onChange({ choices: next });
                    }}
                    aria-pressed={choice.showExplanation}
                    title={choice.showExplanation ? "해설 공개 중 — 클릭해 비공개" : "해설 비공개 — 클릭해 공개"}
                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-md border transition-colors ${
                      choice.showExplanation
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {choice.showExplanation ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {card.choices.length < 8 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  choices: [
                    ...card.choices,
                    {
                      content: buildRichDoc(""),
                      explanation: buildRichDoc(""),
                      showExplanation: false,
                    },
                  ],
                })
              }
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

      {/* 서술형 채점기준표(#43 gap 8) — 주관식이면서 단답 정답이 없을 때만.
          단답 정답이 있으면 문자열 비교로 자동채점되므로 기준이 쓰일 자리가 없고,
          객관식도 마찬가지라 아예 띄우지 않는다. */}
      {card.type === "주관식" && !card.answerText.trim() && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              채점기준 <span className="font-normal">(서술형 부분점수)</span>
            </label>
            {rubric.length > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                합계 {formatPoints(rubricTotal)}점
              </span>
            )}
          </div>
          {rubric.length === 0 ? (
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              기준을 추가하면 응시자가 결과 화면에서 기준별로 체크해 부분점수를 매겨요.
              비워 두면 기존처럼 맞음/틀림으로만 채점됩니다.
            </p>
          ) : (
            <div className="space-y-2">
              {rubric.map((c, j) => (
                <div key={j} className="flex items-center gap-2">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border font-mono text-xs text-muted-foreground">
                    {j + 1}
                  </span>
                  <input
                    value={c.text}
                    onChange={(e) => updateCriterion(j, { text: e.target.value })}
                    placeholder={`채점기준 ${j + 1} (예: 명반응 산물 2가지를 모두 언급)`}
                    className="h-9 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <label className="flex flex-none items-center gap-1 text-[11px] text-muted-foreground">
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={c.points}
                      onChange={(e) =>
                        updateCriterion(j, { points: Math.max(0, Number(e.target.value) || 0) })
                      }
                      aria-label={`채점기준 ${j + 1} 배점`}
                      className="h-9 w-16 rounded-lg border border-input bg-transparent px-2 text-right font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    점
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCriterion(j)}
                    aria-label={`채점기준 ${j + 1} 삭제`}
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-wrong"
                  >
                    <X size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {rubric.length < MAX_RUBRIC_CRITERIA && (
            <button
              type="button"
              onClick={addCriterion}
              className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus size={13} strokeWidth={2} /> 채점기준 추가
            </button>
          )}
        </div>
      )}

      {/* 해설 */}
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">해설</label>
      <TiptapEditor
        value={card.explanation}
        onChange={(json) => onChange({ explanation: json })}
        placeholder="해설을 입력하세요 (선택)."
        allowImages
        allowMath
        allowTables
      />

      {/* #키워드 — 자유 태깅. 저장 시 태그로 자동 등록/연결된다. */}
      <label className="mb-1.5 mt-4 block text-xs font-medium text-muted-foreground">키워드</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5">
        {card.keywords.map((k) => (
          <span
            key={k}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
          >
            #{k}
            <button
              type="button"
              onClick={() => removeKeyword(k)}
              aria-label={`#${k} 삭제`}
              className="text-primary/70 hover:text-primary"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addKeyword();
            }
          }}
          onBlur={addKeyword}
          placeholder="키워드 입력 후 Enter"
          className="h-7 min-w-[100px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </article>
  );
}
