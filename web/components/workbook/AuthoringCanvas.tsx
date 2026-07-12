"use client";
import { useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, PencilLine, Plus } from "lucide-react";
import Link from "next/link";
import { buildRichDoc, buildRichBlocks, extractPlainText } from "@/lib/prosemirror";
import {
  createQuestion,
  publishQuestion,
  addQuestionToWorkbook,
  updateWorkbook,
  createPassage,
  publishPassage,
} from "@/lib/api";
import { useWorkbook } from "@/lib/hooks";
import type { ParsedQuestion } from "@/lib/authoring-chat";
import { AuthoringChatPanel } from "./AuthoringChatPanel";
import { AuthoringCanvasCard } from "./AuthoringCanvasCard";

/** 좌측 캔버스 카드(경량 Draft — QuestionEditor의 Draft에서 편집에 쓰는 필드만). */
export interface CanvasCard {
  id: string;
  type: "객관식" | "주관식";
  stem: any;
  passage: any | null;
  choices: string[];
  correct: number;
  answerText: string;
  explanation: any;
}

/**
 * ParsedQuestion(평문) → CanvasCard(ProseMirror 조립).
 * 객관식인데 선지가 2개 미만이거나 correctIndex가 범위를 벗어나면
 * 임의로 0번을 정답 확정하지 않고 카드 생성을 거부한다(F4).
 */
function toCard(q: ParsedQuestion, id: string): CanvasCard | null {
  const isObjective = q.questionType === "객관식";
  if (isObjective) {
    const choices = q.choices ?? [];
    const correct = q.correctIndex;
    if (choices.length < 2 || typeof correct !== "number" || correct < 0 || correct >= choices.length) {
      return null;
    }
    return {
      id,
      type: q.questionType,
      stem: buildRichDoc(q.stem),
      passage: q.passage ? buildRichDoc(q.passage) : null,
      choices,
      correct,
      answerText: "",
      explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
    };
  }
  return {
    id,
    type: q.questionType,
    stem: buildRichDoc(q.stem),
    passage: q.passage ? buildRichDoc(q.passage) : null,
    choices: [],
    correct: -1,
    answerText: q.answerText ?? "",
    explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
  };
}

/** 지문 공유 판정 키 — 평문 완전일치(공백 정리 후). 빈 지문은 그룹으로 안 묶는다. */
function passageKey(card: CanvasCard): string | null {
  if (!card.passage) return null;
  const text = extractPlainText(card.passage).trim();
  return text ? text : null;
}

export function AuthoringCanvas({ workbookId }: { workbookId: string }) {
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [subjectId, setSubjectId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  /* ── 카드 편집 모드 (한 번에 하나) ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  // 편집 시작 시점의 지문 평문 — 완료 시 같은 지문을 쓰던 다른 카드에 전파하기 위한 기준.
  const editPassageSnapshot = useRef<string | null>(null);

  /* ── ✨AI → 채팅 프리필 ── */
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);

  /* ── 문제집 제목 ── */
  const { data: workbook } = useWorkbook(workbookId);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const commitTitle = async () => {
    setTitleEditing(false);
    const next = titleDraft.trim();
    if (!next || next === workbook?.title) return;
    try {
      await updateWorkbook(workbookId, { title: next });
      toast.success("문제집 제목을 바꿨어요.");
    } catch (e) {
      console.error("제목 수정 실패:", e);
      toast.error("제목 수정에 실패했습니다.");
    }
  };

  /* ── 지문 공유 그룹: passage 평문 → 카드 인덱스들 ── */
  const passageGroups = useMemo(() => {
    const map = new Map<string, number[]>();
    cards.forEach((c, i) => {
      const key = passageKey(c);
      if (!key) return;
      const list = map.get(key) ?? [];
      list.push(i);
      map.set(key, list);
    });
    return map;
  }, [cards]);

  /** i번 카드와 지문을 공유하는 다른 카드들의 1-기반 번호. */
  const sharedWith = useCallback(
    (i: number): number[] => {
      const key = passageKey(cards[i]);
      if (!key) return [];
      return (passageGroups.get(key) ?? []).filter((j) => j !== i).map((j) => j + 1);
    },
    [cards, passageGroups],
  );

  // 채팅 제안 → 좌측 반영. target이 replace:N이면 그 자리 교체, 아니면 append.
  // 검증(toCard)과 부수효과(toast)는 상태 업데이터 밖에서 — StrictMode 이중 실행 중복 방지.
  const applyQuestion = useCallback((q: ParsedQuestion) => {
    const probe = toCard(q, "probe");
    if (!probe) {
      toast.error("선지가 부족하거나 정답 위치가 이상한 문항은 건너뛰었어요.");
      return;
    }
    setCards((prev) => {
      const m = /^replace:(\d+)$/.exec(q.target ?? "new");
      if (m) {
        const idx = Number(m[1]) - 1;
        if (idx >= 0 && idx < prev.length) {
          const copy = [...prev];
          copy[idx] = { ...probe, id: prev[idx].id };
          return copy;
        }
      }
      return [...prev, { ...probe, id: `local-${Date.now()}-${prev.length}` }];
    });
  }, []);

  /* ── 카드 편집 핸들러 ── */
  const startEdit = useCallback(
    (id: string) => {
      const card = cards.find((c) => c.id === id);
      editPassageSnapshot.current = card ? passageKey(card) : null;
      setEditingId(id);
    },
    [cards],
  );

  const updateCard = useCallback((id: string, patch: Partial<CanvasCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  /** 편집 완료 — 지문이 바뀌었고 같은 지문을 쓰던 카드가 있으면 함께 반영. */
  const finishEdit = useCallback(() => {
    const id = editingId;
    const before = editPassageSnapshot.current;
    setEditingId(null);
    editPassageSnapshot.current = null;
    if (!id || !before) return;

    // 편집 중 변경은 updateCard가 이미 cards에 반영했으므로 여기 cards가 최신이다.
    const edited = cards.find((c) => c.id === id);
    if (!edited) return;
    if (passageKey(edited) === before) return; // 지문 안 바뀜

    const targets = cards.filter((c) => c.id !== id && passageKey(c) === before);
    if (targets.length === 0) return;
    setCards((prev) =>
      prev.map((c) =>
        c.id !== id && passageKey(c) === before ? { ...c, passage: edited.passage } : c,
      ),
    );
    toast.success(`지문을 공유하는 ${targets.length}개 문항에 함께 반영했어요.`);
  }, [editingId, cards]);

  const removeCard = useCallback(
    (id: string) => {
      if (editingId === id) setEditingId(null);
      setCards((prev) => prev.filter((c) => c.id !== id));
    },
    [editingId],
  );

  /** ✨AI — 채팅 입력창에 "문제 N 수정: " 프리필. */
  const askAi = useCallback((index: number) => {
    setChatPrefill(`문제 ${index + 1} 수정: `);
  }, []);

  const addManualCard = useCallback(() => {
    setCards((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${prev.length}`,
        type: "객관식",
        stem: buildRichDoc(""),
        passage: null,
        choices: ["", "", "", ""],
        correct: 0,
        answerText: "",
        explanation: buildRichDoc(""),
      },
    ]);
  }, []);

  const handleSave = async () => {
    if (cards.length === 0) {
      toast.error("저장할 문항이 없습니다.");
      return;
    }
    if (!subjectId) {
      toast.error("과목 정보가 없습니다. 채팅에서 과목을 확인해주세요.");
      return;
    }
    setSaving(true);
    try {
      // 1) 지문 영속화 — 같은 지문(평문 일치)은 한 번만 생성해 passageId를 공유한다.
      const passageIdByKey = new Map<string, string>();
      for (const c of cards) {
        const key = passageKey(c);
        if (!key || passageIdByKey.has(key)) continue;
        try {
          const p = await createPassage(c.passage);
          await publishPassage(p.id).catch(() => null); // 발행 실패는 담기에 치명적이지 않음
          passageIdByKey.set(key, p.id);
        } catch (e) {
          console.error("지문 저장 실패:", e);
          toast.error("일부 지문 저장에 실패했어요 — 해당 문항은 지문 없이 저장됩니다.");
        }
      }

      // 2) 문항 영속화 + 발행 + 문제집 연결.
      let failed = 0;
      for (const c of cards) {
        if (!extractPlainText(c.stem).trim()) continue;
        const key = passageKey(c);
        try {
          const created = await createQuestion({
            subjectId,
            questionType: c.type,
            ...(key && passageIdByKey.has(key) ? { passageId: passageIdByKey.get(key) } : {}),
            stem: c.stem,
            choices:
              c.type === "객관식"
                ? c.choices.map((text, i) => ({
                    id: `c${i + 1}`,
                    content: buildRichDoc(text),
                    isCorrect: i === c.correct,
                  }))
                : undefined,
            correctAnswerText:
              c.type === "주관식" && c.answerText.trim() ? c.answerText.trim() : undefined,
            explanation: extractPlainText(c.explanation).trim()
              ? buildRichBlocks(extractPlainText(c.explanation))
              : undefined,
          } as any);
          await publishQuestion(created.id).catch(() => null);
          await addQuestionToWorkbook(workbookId, { questionId: created.id });
        } catch (e) {
          failed += 1;
          console.error("문항 저장 실패:", e);
        }
      }
      if (failed > 0) toast.error(`${failed}개 문항 저장에 실패했어요.`);
      else toast.success(`${cards.length}개 문항을 문제집에 저장했어요.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 좌: 캔버스 */}
      <section className="flex-1 flex flex-col min-w-0 border-r border-border">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/workbook/create"
              className="flex flex-none items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} /> 뒤로가기
            </Link>
            {/* 문제집 제목 — 클릭해 인라인 편집 */}
            {titleEditing ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setTitleEditing(false);
                }}
                className="h-9 w-full max-w-[360px] rounded-lg border border-input bg-transparent px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(workbook?.title ?? "");
                  setTitleEditing(true);
                }}
                title="제목 수정"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-sm font-semibold text-foreground">
                  {workbook?.title ?? "문제집"}
                </span>
                <PencilLine
                  size={13}
                  className="flex-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-none items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
            최종 검토
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cards.map((c, i) => (
            <AuthoringCanvasCard
              key={c.id}
              card={c}
              index={i}
              editing={editingId === c.id}
              sharedWith={sharedWith(i)}
              onStartEdit={() => startEdit(c.id)}
              onFinishEdit={finishEdit}
              onChange={(patch) => updateCard(c.id, patch)}
              onRemove={() => removeCard(c.id)}
              onAskAi={() => askAi(i)}
            />
          ))}
          <button
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={addManualCard}
          >
            <Plus size={16} /> 문항 추가
          </button>
        </div>
      </section>

      {/* 우: 채팅 */}
      <AuthoringChatPanel
        workbookId={workbookId}
        cards={cards}
        onSubjectResolved={setSubjectId}
        onApplyQuestion={applyQuestion}
        prefill={chatPrefill}
        onPrefillConsumed={() => setChatPrefill(null)}
      />
    </div>
  );
}
