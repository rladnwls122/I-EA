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
  fetchTags,
  createTag,
} from "@/lib/api";
import { useWorkbook } from "@/lib/hooks";
import type { Tag } from "@/lib/types";
import type { ParsedQuestion } from "@/lib/authoring-chat";
import { AuthoringChatPanel } from "./AuthoringChatPanel";
import { AuthoringCanvasCard } from "./AuthoringCanvasCard";

/** 선지 하나 — 본문 + 선지별 해설(공개 여부 토글 가능). */
export interface CanvasChoice {
  text: string;
  explanation: string;
  /** 선지별 해설 공개 여부 — 저장 시 choices Json에 함께 실린다. */
  showExplanation: boolean;
}

/** 좌측 캔버스 카드(경량 Draft — QuestionEditor의 Draft에서 편집에 쓰는 필드만). */
export interface CanvasCard {
  id: string;
  type: "객관식" | "주관식";
  stem: any;
  passage: any | null;
  choices: CanvasChoice[];
  correct: number;
  answerText: string;
  explanation: any;
  /** 배점 — 생성 단계부터 지정 가능. */
  points: number;
  /** #키워드 — 자유 태깅. 저장 시 태그로 find-or-create 후 tagIds로 연결. */
  keywords: string[];
}

/** 문항 #키워드용 태그 카테고리 — 과목/유형 등 큐레이션 태그와 구분. */
const KEYWORD_TAG_CATEGORY = "키워드";

/** AI 생성 설정(채팅창 밖 독립 패널) — null 유형은 "자동"(힌트 없음). */
export interface AiSettings {
  questionType: "객관식" | "주관식" | "OX" | null;
  count: number;
  difficulty: number;
}

/**
 * ParsedQuestion(평문) → CanvasCard(ProseMirror 조립).
 * 객관식인데 선지가 2개 미만이거나 correctIndex가 범위를 벗어나면
 * 임의로 0번을 정답 확정하지 않고 카드 생성을 거부한다(F4).
 */
function toCard(q: ParsedQuestion, id: string): CanvasCard | null {
  const isObjective = q.questionType === "객관식";
  const toChoices = (list: string[]): CanvasChoice[] =>
    list.map((text) => ({ text, explanation: "", showExplanation: false }));
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
      choices: toChoices(choices),
      correct,
      answerText: "",
      explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
      points: 1,
      keywords: [],
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
    points: 1,
    keywords: [],
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

  /* ── AI 생성 설정 — 채팅창 밖 독립 패널(우측 상단)이 조작 ── */
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    questionType: null,
    count: 1,
    difficulty: 3,
  });

  /* ── 문제집 공개 설정 — 최종 검토(저장) 시 함께 반영 ── */
  const [isPublic, setIsPublic] = useState(false);

  /* ── 드래그&드롭 순서 변경 ── */
  const dragIndex = useRef<number | null>(null);
  const moveCard = useCallback((from: number, to: number) => {
    setCards((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /* ── 카드 편집 모드 (한 번에 하나) ── */
  const [editingId, setEditingId] = useState<string | null>(null);
  // 편집 시작 시점의 지문 평문 — 완료 시 같은 지문을 쓰던 다른 카드에 전파하기 위한 기준.
  const editPassageSnapshot = useRef<string | null>(null);

  /* ── ✨AI → 채팅 프리필 ── */
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  // AI가 지금 응답을 만들고 있는지(ChatPanel이 올려줌) — 모바일에서 사용자가
  // 캔버스 탭을 보고 있어도 "AI 도우미" 탭에 살아있는 점으로 알려준다.
  const [aiStreaming, setAiStreaming] = useState(false);

  /* ── 모바일 전용 탭 전환 — md 이상에서는 항상 둘 다 나란히 보인다 ── */
  const [mobileTab, setMobileTab] = useState<"canvas" | "chat">("canvas");

  /* ── 문제집 제목 ── */
  const { data: workbook, isError: workbookError } = useWorkbook(workbookId);
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

  /** ✨AI — 채팅 입력창에 "문제 N 수정: " 프리필. 모바일에선 채팅 탭으로도 전환. */
  const askAi = useCallback((index: number) => {
    setChatPrefill(`문제 ${index + 1} 수정: `);
    setMobileTab("chat");
  }, []);

  const addManualCard = useCallback(() => {
    setCards((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${prev.length}`,
        type: "객관식",
        stem: buildRichDoc(""),
        passage: null,
        choices: Array.from({ length: 4 }, () => ({
          text: "",
          explanation: "",
          showExplanation: false,
        })),
        correct: 0,
        answerText: "",
        explanation: buildRichDoc(""),
        points: 1,
        keywords: [],
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
    // 문제집 자체를 못 불러왔으면(삭제됐거나 남의 것) 담기는 100% 실패한다 — 미리 막는다.
    if (workbookError || !workbook) {
      toast.error("문제집을 불러오지 못했어요. 문제집 만들기에서 다시 시작해주세요.");
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

      // 2) #키워드 → 태그 find-or-create. 같은 이름은 한 번만 조회/생성해 재사용.
      const existingTags = await fetchTags(KEYWORD_TAG_CATEGORY).catch(() => [] as Tag[]);
      const tagIdByName = new Map<string, string>(
        existingTags.map((t) => [t.name.trim().toLowerCase(), t.id]),
      );
      const resolveTagIds = async (keywords: string[]): Promise<string[]> => {
        const ids: string[] = [];
        for (const raw of keywords) {
          const name = raw.trim();
          if (!name) continue;
          const key = name.toLowerCase();
          let id = tagIdByName.get(key);
          if (!id) {
            try {
              const created = await createTag(name, KEYWORD_TAG_CATEGORY);
              id = created.id;
              tagIdByName.set(key, id);
            } catch (e) {
              console.error(`키워드 태그 생성 실패(${name}):`, e);
              continue; // 이 키워드만 건너뛰고 나머지는 계속
            }
          }
          ids.push(id);
        }
        return ids;
      };

      // 3) 문항 영속화 + 발행 + 문제집 연결.
      //    발행 실패를 삼키고 담기를 강행하면 백엔드가 "발행되지 않은 문항" 404를
      //    돌려줘 원인이 가려진다 — 단계별로 실패를 구분해 서버 메시지를 그대로 보여준다.
      let failed = 0;
      let lastError = "";
      for (const c of cards) {
        if (!extractPlainText(c.stem).trim()) continue;
        const key = passageKey(c);
        try {
          const tagIds = await resolveTagIds(c.keywords);
          const created = await createQuestion({
            subjectId,
            questionType: c.type,
            points: c.points,
            ...(tagIds.length ? { tagIds } : {}),
            ...(key && passageIdByKey.has(key) ? { passageId: passageIdByKey.get(key) } : {}),
            stem: c.stem,
            choices:
              c.type === "객관식"
                ? c.choices.map((ch, i) => ({
                    id: `c${i + 1}`,
                    content: buildRichDoc(ch.text),
                    isCorrect: i === c.correct,
                    // 선지별 해설 — 공개 여부(showExplanation)까지 choices Json에 함께 보존.
                    ...(ch.explanation.trim()
                      ? {
                          explanation: buildRichBlocks(ch.explanation),
                          explanationVisible: ch.showExplanation,
                        }
                      : {}),
                  }))
                : undefined,
            correctAnswerText:
              c.type === "주관식" && c.answerText.trim() ? c.answerText.trim() : undefined,
            explanation: extractPlainText(c.explanation).trim()
              ? buildRichBlocks(extractPlainText(c.explanation))
              : undefined,
          } as any);
          await publishQuestion(created.id); // 실패 시 담기 강행하지 않고 이 문항을 실패 처리
          await addQuestionToWorkbook(workbookId, { questionId: created.id });
        } catch (e) {
          failed += 1;
          lastError = e instanceof Error ? e.message : String(e);
          console.error("문항 저장 실패:", e);
        }
      }
      if (failed > 0) {
        toast.error(`${failed}개 문항 저장에 실패했어요.${lastError ? ` (${lastError})` : ""}`);
      } else {
        toast.success(`${cards.length}개 문항을 문제집에 저장했어요.`);
      }

      // 3) 공개 설정 반영 — 헤더 토글 값으로 문제집 전체 공개/비공개를 확정.
      const targetVisibility = isPublic ? "PUBLIC" : "PRIVATE";
      if (workbook && workbook.visibility !== targetVisibility) {
        try {
          await updateWorkbook(workbookId, { visibility: targetVisibility });
          toast.success(isPublic ? "문제집을 공개로 전환했어요." : "문제집을 비공개로 유지해요.");
        } catch (e) {
          console.error("공개 설정 변경 실패:", e);
          toast.error("공개 설정 변경에 실패했어요.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden md:h-screen md:flex-row">
      {/* 모바일 전용 탭 전환 — md 이상에서는 좌우 나란히 보이므로 숨긴다. */}
      <div className="flex border-b border-border md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("canvas")}
          aria-pressed={mobileTab === "canvas"}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "canvas" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
          }`}
        >
          문제집
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          aria-pressed={mobileTab === "chat"}
          className={`relative flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
          }`}
        >
          AI 도우미
          {/* AI가 캔버스 탭 보는 동안에도 응답 중임을 알리는 신호 — 장식이 아니라 실제 상태. */}
          {aiStreaming && mobileTab !== "chat" && (
            <span className="absolute right-[calc(50%-2.75rem)] top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* 좌: 캔버스 */}
      <section
        className={`flex-1 min-w-0 flex-col border-r border-border md:flex ${
          mobileTab === "canvas" ? "flex" : "hidden"
        }`}
      >
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/workbook/create"
              className="flex flex-none items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} /> 뒤로가기
            </Link>
            {/* 문제집 제목 — 클릭해 인라인 편집 */}
            {workbookError ? (
              <span className="text-sm font-medium text-wrong">
                문제집을 불러오지 못했어요 — 저장이 불가능합니다
              </span>
            ) : titleEditing ? (
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
          <div className="flex flex-none items-center gap-3">
            {/* 배포 공개 설정 — 저장(최종 검토) 시 문제집 전체에 반영 */}
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setIsPublic((v) => !v)}
              className="flex items-center gap-2 text-xs text-muted-foreground"
              title="저장 시 문제집 공개 여부"
            >
              <span className={isPublic ? "text-primary font-medium" : ""}>
                {isPublic ? "공개" : "비공개"}
              </span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  isPublic ? "bg-primary" : "bg-surface-raised border border-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    isPublic ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex flex-none items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
              문제집 저장
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cards.map((c, i) => (
            <div
              key={c.id}
              // 드래그&드롭 순서 변경 — 편집 중인 카드는 드래그 금지(입력 충돌).
              draggable={editingId !== c.id}
              onDragStart={() => {
                dragIndex.current = i;
              }}
              onDragOver={(e) => {
                e.preventDefault(); // drop 허용
              }}
              onDrop={() => {
                if (dragIndex.current !== null) moveCard(dragIndex.current, i);
                dragIndex.current = null;
              }}
              onDragEnd={() => {
                dragIndex.current = null;
              }}
            >
              <AuthoringCanvasCard
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
            </div>
          ))}
          <button
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={addManualCard}
          >
            <Plus size={16} /> 문항 추가
          </button>
        </div>
      </section>

      {/* 우: 채팅 — 모바일에선 탭 선택 시에만, md 이상에서는 항상 나란히. */}
      <div className={`min-w-0 flex-1 md:flex md:flex-none ${mobileTab === "chat" ? "flex flex-1" : "hidden"}`}>
        <AuthoringChatPanel
          workbookId={workbookId}
          cards={cards}
          settings={aiSettings}
          onSettingsChange={setAiSettings}
          onSubjectResolved={setSubjectId}
          onApplyQuestion={applyQuestion}
          prefill={chatPrefill}
          onPrefillConsumed={() => setChatPrefill(null)}
          onStreamingChange={setAiStreaming}
        />
      </div>
    </div>
  );
}
