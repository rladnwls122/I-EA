"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Check, GripVertical, Plus, Send, Sparkles,
  Trash2, ChevronDown, ChevronUp, RotateCcw, Loader2, Settings2,
} from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { buildRichDoc, extractPlainText } from "@/lib/prosemirror";
import {
  createAiGeneration,
  fetchAiGeneration,
  fetchPassage,
  fetchQuestion,
  fetchSubjects,
  fetchTags,
  regenerateChoices,
  updateQuestion,
  createQuestion,
  publishQuestion,
  createWorkbook,
  startWorkbook,
} from "@/lib/api";
import type { Question, Subject, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/* ── 문항 타입 ── */
type Draft = {
  id: string; // 임시 ID 또는 실제 문제 ID
  type: "객관식" | "주관식";
  stem: any; // 발문 — ProseMirror JSON
  passageId: string | null; // 연결된 지문 ID (없으면 null)
  passage: any | null; // 본문(지문) — ProseMirror JSON, 없으면 null
  choices: string[]; // 단순 텍스트로 관리 (UI 편의성)
  correct: number;
  answerText: string;
  explanation: any; // ProseMirror JSON
  showExplanation: boolean;
  tagIds: string[]; // 부착된 태그 — 실제 문항(id가 UUID)이면 토글 즉시 서버에 저장
};

const emptyObjective: Draft = {
  id: Date.now().toString(),
  type: "객관식",
  stem: buildRichDoc(""),
  passageId: null,
  passage: null,
  choices: ["", "", "", ""],
  correct: 0,
  answerText: "",
  explanation: buildRichDoc(""),
  showExplanation: false,
  tagIds: [],
};

const emptySubjective: Draft = {
  id: Date.now().toString(),
  type: "주관식",
  stem: buildRichDoc(""),
  passageId: null,
  passage: null,
  choices: [],
  correct: -1,
  answerText: "",
  explanation: buildRichDoc(""),
  showExplanation: false,
  tagIds: [],
};

const SUGGESTIONS = [
  "문학 고난도 문항을 만들어줘",
  "오답 선지를 더 그럴듯하게 만들어줘",
  "OX 퀴즈 만들기",
  "지문 기반으로 출제",
];

/** AI 패널에서 고를 수 있는 유형 칩. 백엔드 QUESTION_KINDS는 객관식/주관식뿐 — OX는 UI 전용 힌트. */
const TYPE_CHIPS = ["주관식", "객관식", "OX"] as const;
type TypeChip = (typeof TYPE_CHIPS)[number];

const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5];
const COUNT_OPTIONS = [1, 2, 3, 5];

/**
 * 선택된 유형 칩 → 생성 API의 questionType 힌트(단일값·optional).
 * OX는 백엔드 저장 타입이 아니라 객관식의 스타일 힌트(ox 플래그, resolveOx)로 별도 전달한다.
 * 그래서 여기서는 객관식/주관식 "종류"만 판단 — 둘 다(또는 OX만 단독) 선택되면 힌트 생략(믹스).
 */
function resolveQuestionTypeHint(types: Set<TypeChip>): "객관식" | "주관식" | undefined {
  const kinds = new Set<"객관식" | "주관식">();
  if (types.has("객관식") || types.has("OX")) kinds.add("객관식");
  if (types.has("주관식")) kinds.add("주관식");
  if (kinds.size !== 1) return undefined;
  return Array.from(kinds)[0];
}

/** OX 칩 선택 여부 → 생성 API의 ox 힌트. */
function resolveOx(types: Set<TypeChip>): boolean {
  return types.has("OX");
}

/**
 * ProseMirror 값을 doc 형태로 정규화한다.
 * 백엔드는 stem/passage는 doc({type:'doc'})로, choices[].content·explanation은
 * doc 래퍼 없는 블록 배열(buildRichBlocks)로 저장한다. TiptapEditor와 extractPlainText는
 * 모두 doc(.content)을 기대하므로, 블록 배열이면 doc으로 감싸 준다.
 */
function toDoc(v: any): any {
  if (v && v.type === "doc") return v;
  if (Array.isArray(v)) return { type: "doc", content: v };
  if (v && Array.isArray(v.content)) return v;
  return buildRichDoc("");
}

/** 백엔드 Question(ProseMirror JSON) → 에디터 Draft(평문 선지)로 변환. */
function questionToDraft(q: Question): Draft {
  const choiceList: any[] = Array.isArray(q.choices) ? q.choices : [];
  const isObjective = q.questionType === "객관식";
  const correctIdx = choiceList.findIndex((c) => c?.isCorrect);
  return {
    id: q.id,
    type: q.questionType,
    stem: toDoc(q.stem),
    passageId: q.passageId ?? null,
    passage: null, // 본문 내용은 생성 후 fetchPassage로 별도 로드해 채운다.
    choices: isObjective ? choiceList.map((c) => extractPlainText(toDoc(c?.content))) : [],
    correct: isObjective ? (correctIdx >= 0 ? correctIdx : 0) : -1,
    answerText: q.correctAnswerText ?? "",
    explanation: toDoc(q.explanation),
    showExplanation: false,
    // findOne 응답의 tags(관계 매핑)를 실어온다 — Question 타입엔 없지만 백엔드가 내려줌.
    tagIds: ((q as any).tags ?? []).map((t: Tag) => t.id),
  };
}

/**
 * 생성 작업이 끝날 때까지 폴링. COMPLETED/FAILED면 즉시 반환, 시간 초과면 null.
 * 비동기 생성(BullMQ)이라 즉시 완료되지 않는다 — 1.5s 간격으로 최대 ~30s 대기.
 */
async function pollGeneration(
  id: string,
  { tries = 20, intervalMs = 1500 }: { tries?: number; intervalMs?: number } = {},
) {
  for (let i = 0; i < tries; i++) {
    const gen = await fetchAiGeneration(id);
    if (gen.status === "COMPLETED" || gen.status === "FAILED") return gen;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

export function QuestionEditor() {
  const [drafts, setDrafts] = useState<Draft[]>([
    {
      ...emptyObjective,
      id: "1",
      stem: buildRichDoc("다음 작품에 나타난 화자의 태도로 가장 적절한 것은?"),
      choices: [
        "대상에 대한 그리움을 드러내고 있다.",
        "현실을 비판적으로 바라보고 있다.",
        "미래에 대한 기대를 표현하고 있다.",
        "자신의 처지를 체념하고 있다.",
      ],
      correct: 0,
      explanation: buildRichDoc("시어의 반복과 어조를 중심으로 화자의 정서를 파악한다."),
    },
  ]);

  const router = useRouter();

  /* ── AI Chat ── */
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "ai" | "user"; text: string }[]>([
    { role: "ai", text: "원하는 주제, 난이도, 출제 포인트를 알려주세요.\n문항 초안을 바로 에디터에 추가해드릴게요." },
  ]);
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── 생성 옵션 ── */
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  // 대분류(examCategory) 칩 → 그 안의 세부과목 칩, 2단 선택.
  const [category, setCategory] = useState("");
  const [typeSel, setTypeSel] = useState<Set<TypeChip>>(new Set());
  const [difficulty, setDifficulty] = useState(3);
  const [count, setCount] = useState(1);
  const [includePassage, setIncludePassage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 생성옵션(과목/유형/난이도/문항수) 접이식 — 기본 접힘, 톱니로 펼침.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // 생성 직후 바로 초안에 꽂지 않고, 검토(정답/해설 확인) 후 명시적으로 적용할 대기열.
  const [pendingPreview, setPendingPreview] = useState<Draft[]>([]);

  const toggleType = (t: TypeChip) =>
    setTypeSel((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingPreview]);

  // 생성 API는 subjectId(NOT NULL)가 필수 → 세부과목 목록을 받아 첫 대분류·첫 과목을 기본 선택.
  useEffect(() => {
    fetchSubjects()
      .then((list) => {
        setSubjects(list);
        const first = list[0];
        setCategory((prev) => prev || first?.examCategory || "");
        setSubjectId((prev) => prev || first?.id || "");
      })
      .catch(() => toast.error("과목 목록을 불러오지 못했습니다."));
  }, []);

  // 태그 카탈로그 — 문항 카드의 태그 토글 칩 데이터.
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch(() => {}); // 태그는 부가 기능 — 실패해도 에디터는 동작해야 한다.
  }, []);

  /** 문항 카드에서 태그 토글. 실제 문항(UUID id)이면 서버에도 바로 저장한다. */
  const toggleDraftTag = (draft: Draft, tagId: string) => {
    const next = draft.tagIds.includes(tagId)
      ? draft.tagIds.filter((t) => t !== tagId)
      : [...draft.tagIds, tagId];
    update(draft.id, "tagIds", next);
    if (draft.id.includes("-")) {
      updateQuestion(draft.id, { tagIds: next }).catch(() => {
        toast.error("태그 저장에 실패했습니다.");
        update(draft.id, "tagIds", draft.tagIds); // 롤백
      });
    }
  };

  // 대분류 칩 목록(중복 제거, 원본 순서 보존)과 현재 대분류의 세부과목 목록.
  const categories = Array.from(new Set(subjects.map((s) => s.examCategory)));
  const subjectsInCategory = subjects.filter((s) => s.examCategory === category);

  /** 대분류 전환 시 그 안의 첫 세부과목을 자동 선택(빈 subjectId 방지). */
  const selectCategory = (c: string) => {
    setCategory(c);
    const first = subjects.find((s) => s.examCategory === c);
    setSubjectId(first?.id ?? "");
  };

  /* ── 핸들러 ── */
  const update = (id: string, key: keyof Draft, value: unknown) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, [key]: value } : d)));

  const addQuestion = (type: "객관식" | "주관식" = "객관식") =>
    setDrafts((list) => [
      ...list,
      type === "객관식"
        ? { ...emptyObjective, id: Date.now().toString() }
        : { ...emptySubjective, id: Date.now().toString() },
    ]);

  const removeQuestion = (id: string) =>
    setDrafts((list) => list.filter((d) => d.id !== id));

  const pushAi = (text: string) =>
    setMessages((prev) => [...prev, { role: "ai", text }]);

  /** 미리보기 대기열에서 문제집(에디터 초안)으로 명시 반영. */
  const applyPreview = (id: string) => {
    const draft = pendingPreview.find((d) => d.id === id);
    if (!draft) return;
    setDrafts((list) => [...list, draft]);
    setPendingPreview((list) => list.filter((d) => d.id !== id));
    toast.success("문제집에 적용했어요.");
  };

  const applyAllPreview = () => {
    if (pendingPreview.length === 0) return;
    setDrafts((list) => [...list, ...pendingPreview]);
    setPendingPreview([]);
    toast.success("문제집에 모두 적용했어요.");
  };

  const discardPreview = (id: string) =>
    setPendingPreview((list) => list.filter((d) => d.id !== id));

  const handleSend = async () => {
    const currentPrompt = prompt.trim();
    if (!currentPrompt || isGenerating) return;
    if (!subjectId) {
      toast.error("먼저 세부과목을 선택하세요.");
      setOptionsOpen(true);
      return;
    }
    setMessages((prev) => [...prev, { role: "user", text: currentPrompt }]);
    setPrompt("");
    setIsGenerating(true);

    try {
      // 1) 비동기 생성 요청(즉시 202 + PENDING id)
      const created = await createAiGeneration({
        subjectId,
        prompt: currentPrompt,
        difficulty,
        questionCount: count,
        includePassage,
        questionType: resolveQuestionTypeHint(typeSel),
        ox: resolveOx(typeSel),
      });
      pushAi("생성 중이에요… 잠시만 기다려 주세요.");

      // 2) 완료까지 폴링
      const gen = await pollGeneration(created.id);
      if (!gen) {
        pushAi("생성이 지연되고 있어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (gen.status === "FAILED") {
        pushAi("생성에 실패했어요. 프롬프트를 바꿔 다시 시도해 주세요.");
        return;
      }

      // 3) 산출물(문항 ID)로 실제 문항을 불러온다.
      const loaded = await Promise.all(gen.questions.map((q) => fetchQuestion(q.id)));
      const newDrafts = loaded.map(questionToDraft);

      // 4) 본문(지문)이 있으면 내용을 별도 로드해 해당 문항에 붙인다.
      //    여러 문항이 한 지문을 공유할 수 있으므로 고유 passageId만 조회한다.
      const passageIds = Array.from(
        new Set(newDrafts.map((d) => d.passageId).filter(Boolean)),
      ) as string[];
      if (passageIds.length > 0) {
        const passages = await Promise.all(
          passageIds.map((pid) => fetchPassage(pid).catch(() => null)),
        );
        const contentById = new Map(
          passages.filter(Boolean).map((p) => [p!.id, toDoc(p!.content)]),
        );
        for (const d of newDrafts) {
          if (d.passageId && contentById.has(d.passageId)) {
            d.passage = contentById.get(d.passageId);
          }
        }
      }

      // 바로 초안에 꽂지 않고 미리보기 대기열에 둔다 — 정답/해설을 확인하고 명시적으로 적용.
      setPendingPreview((list) => [...list, ...newDrafts]);
      pushAi(`문항 ${newDrafts.length}개를 만들었어요. 아래에서 확인하고 적용해 주세요.`);
    } catch (e) {
      console.error(e);
      pushAi("생성 중 오류가 발생했어요. 다시 시도해 주세요.");
      toast.error("AI 문항 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
    }
  };


  /* ── 저장: drafts를 실제 문항으로 영속화 → 발행 → 문제집 생성 (+선택: 바로 풀기) ── */
  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);

  const handleSave = async (solveAfter: boolean) => {
    if (drafts.length === 0) {
      toast.error("저장할 문항이 없습니다.");
      return;
    }
    if (!subjectId) {
      toast.error("먼저 세부과목을 선택하세요.");
      setOptionsOpen(true);
      return;
    }
    setIsSaving(true);
    try {
      // 1) 수기 draft(임시 id)는 createQuestion으로 영속화, AI 생성분(UUID)은 그대로.
      const questionIds: string[] = [];
      for (const d of drafts) {
        if (isUuid(d.id)) {
          questionIds.push(d.id);
          continue;
        }
        if (!extractPlainText(d.stem).trim()) continue; // 빈 발문은 건너뜀
        const created = await createQuestion({
          subjectId,
          questionType: d.type,
          stem: d.stem,
          choices:
            d.type === "객관식"
              ? d.choices.map((text, i) => ({
                  id: `c${i + 1}`,
                  content: buildRichDoc(text),
                  isCorrect: i === d.correct,
                }))
              : undefined,
          correctAnswerText:
            d.type === "주관식" && d.answerText.trim() ? d.answerText.trim() : undefined,
          // 백엔드는 해설을 블록 노드 배열로 받는다(doc 래퍼 아님).
          explanation: extractPlainText(d.explanation).trim()
            ? d.explanation?.content
            : undefined,
        } as any);
        questionIds.push(created.id);
      }
      if (questionIds.length === 0) {
        toast.error("발문이 있는 문항이 없습니다.");
        return;
      }

      // 2) 발행(멱등 — 이미 발행이면 서버가 그대로 통과). 세션 조립은 발행 문항만 가능.
      await Promise.all(questionIds.map((id) => publishQuestion(id).catch(() => null)));

      // 3) 문제집 생성(벌크 questionIds)
      const wb = await createWorkbook({
        title: `문항 모음 ${new Date().toLocaleDateString()}`,
        visibility: "PRIVATE",
        questionIds,
      });
      toast.success(`문제집으로 저장했습니다 (${questionIds.length}문항).`);

      // 4) 바로 풀기 — 세션 시작 후 이동
      if (solveAfter) {
        const res = await startWorkbook(wb.id);
        router.push(`/exam-sessions/${res.id}`);
      }
    } catch (e) {
      console.error(e);
      toast.error("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateChoices = async (draft: Draft) => {
    // 실제 API 연동 (ID가 임시 ID면 실제로는 생성 후 호출해야 하나, 여기서는 시연용으로 처리)
    setIsRegenerating(draft.id);
    try {
      const stemText = extractPlainText(draft.stem);
      // 백엔드는 정답 1개를 포함한 '선지 전체'를 재생성한다(correctChoiceText는 받지 않음).
      // choiceCount는 정답 포함 전체 수여야 하고(불일치 시 503), DTO는 stemText/choiceCount만 허용.
      const res = await regenerateChoices(draft.id, {
        stemText,
        choiceCount: draft.choices.length,
      });

      // 반환된 선지 집합으로 전체 교체 + 정답 인덱스 재설정(isCorrect 위치).
      const newChoices = res.choices.map((c) => c.content);
      const newCorrect = res.choices.findIndex((c) => c.isCorrect);
      update(draft.id, "choices", newChoices);
      if (newCorrect >= 0) update(draft.id, "correct", newCorrect);
      toast.success("선지가 새로 생성되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error("선지 생성에 실패했습니다.");
    } finally {
      setIsRegenerating(null);
    }
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh)] overflow-hidden">
      {/* ═══ 좌측 패널: 문항 에디터 ═══ */}
      <section className="flex-1 flex flex-col min-w-0 border-r border-border relative">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-background sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Link href="/workbook/create" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={20} strokeWidth={2} />
            </Link>
            <div>
              <span className="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">문제집 편집</span>
              <h1 className="text-lg font-semibold tracking-tight">새 문항 초안</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={isSaving}
              onClick={() => handleSave(false)}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2} />}
              저장하기
            </Button>
            <Button size="sm" className="gap-2" disabled={isSaving} onClick={() => handleSave(true)}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
              저장하고 바로 풀기
            </Button>
          </div>
        </header>

        {/* 문항 리스트 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-24 space-y-4 relative">
          {drafts.map((draft, index) => (
            <article key={draft.id} className="bg-card border border-border rounded-xl p-6 transition-colors hover:border-primary/40">
              {/* 카드 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <GripVertical size={16} strokeWidth={2} className="text-muted-foreground cursor-grab" />
                  <span className="font-mono tabular-nums">문항 {index + 1}</span>
                  <Badge variant="secondary" className="font-mono text-[10px] font-medium text-muted-foreground">{draft.type}</Badge>
                </div>
                <button
                  onClick={() => removeQuestion(draft.id)}
                  className="text-muted-foreground hover:text-wrong transition-colors duration-150"
                  aria-label="문항 삭제"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </div>

              {/* 본문(지문) — 있을 때만. AI가 지문 포함 생성했거나 수동으로 추가한 경우. */}
              {draft.passage != null ? (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted-foreground">본문(지문)</label>
                    <button
                      onClick={() => update(draft.id, "passage", null)}
                      className="text-xs text-muted-foreground hover:text-wrong transition-colors"
                    >
                      본문 제거
                    </button>
                  </div>
                  <div className="relative">
                    <TiptapEditor
                      value={draft.passage}
                      onChange={(json) => update(draft.id, "passage", json)}
                      placeholder="지문(본문)을 입력하세요."
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => update(draft.id, "passage", buildRichDoc(""))}
                  className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus size={13} strokeWidth={2} />
                  본문(지문) 추가
                </button>
              )}

              {/* 발문 (Tiptap) */}
              <label className="mb-2 block text-xs font-medium text-muted-foreground">발문</label>
              <div className="mb-4 relative">
                <TiptapEditor
                  value={draft.stem}
                  onChange={(json) => update(draft.id, "stem", json)}
                  placeholder="문항의 발문을 입력하세요."
                />
              </div>

              {/* 객관식: 선지 */}
              {draft.type === "객관식" && (
                <>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">선지</label>
                  <div className="space-y-2 mb-3">
                    {draft.choices.map((choice, i) => (
                      <div key={i} className="flex gap-2">
                        <button
                          onClick={() => update(draft.id, "correct", i)}
                          className={`w-10 h-10 flex-shrink-0 rounded-lg border font-mono text-xs font-medium transition-all active:translate-y-0 motion-reduce:transition-none ${
                            draft.correct === i
                              ? "bg-primary border-transparent text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                          aria-label={`정답 ${i + 1}번`}
                        >
                          {i + 1}
                        </button>
                        <Input
                          className="flex-1 h-10"
                          value={choice}
                          onChange={(e) =>
                            update(draft.id, "choices", draft.choices.map((c, n) => (n === i ? e.target.value : c)))
                          }
                          placeholder={`선지 ${i + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                  {/* AI 오답 선지 재생성 */}
                  <button
                    onClick={() => handleRegenerateChoices(draft)}
                    disabled={isRegenerating === draft.id}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 mb-3 disabled:opacity-50"
                  >
                    {isRegenerating === draft.id ? <Loader2 size={13} strokeWidth={2} className="animate-spin" /> : <RotateCcw size={13} strokeWidth={2} />}
                    {isRegenerating === draft.id ? "생성 중..." : "AI 매력적 오답 자동 생성"}
                  </button>
                </>
              )}

              {/* 주관식: 정답 */}
              {draft.type === "주관식" && (
                <>
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">정답</label>
                  <Input
                    className="mb-3 h-10"
                    value={draft.answerText}
                    onChange={(e) => update(draft.id, "answerText", e.target.value)}
                    placeholder="정답을 입력하세요 (단답형 자동채점, 서술형은 비워두기)"
                  />
                </>
              )}

              {/* 태그 — 카탈로그 태그 토글. 실제 문항이면 즉시 저장, 새 문항이면 로컬 유지 */}
              {tags.length > 0 && (
                <div className="mb-3">
                  <label className="mb-2 block text-xs font-medium text-muted-foreground">태그</label>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleDraftTag(draft, t.id)}
                        aria-pressed={draft.tagIds.includes(t.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-all active:scale-[0.98] motion-reduce:transition-none ${
                          draft.tagIds.includes(t.id)
                            ? "border-primary bg-primary/10 font-medium text-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        # {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 해설 아코디언 */}
              <button
                onClick={() => update(draft.id, "showExplanation", !draft.showExplanation)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {draft.showExplanation ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
                해설
              </button>
              {draft.showExplanation && (
                <div className="mt-2 relative">
                  <TiptapEditor
                    value={draft.explanation}
                    onChange={(json) => update(draft.id, "explanation", json)}
                    placeholder="해설을 입력하세요."
                    minHeight="60px"
                  />
                </div>
              )}
            </article>
          ))}

          {/* 문항 추가 */}
          <div className="flex gap-2">
            <button
              onClick={() => addQuestion("객관식")}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-border text-primary text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
            >
              <Plus size={18} strokeWidth={2} /> 객관식 추가
            </button>
            <button
              onClick={() => addQuestion("주관식")}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-border text-primary text-sm font-medium transition-all hover:-translate-y-0.5 hover:border-primary/40 active:translate-y-0 motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
            >
              <Plus size={18} strokeWidth={2} /> 주관식 추가
            </button>
          </div>
        </div>

        {/* 플로팅 툴바 */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border shadow-sm z-20">
          <button onClick={() => addQuestion("객관식")} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors" title="문항 추가">
            <Plus size={20} strokeWidth={2} />
          </button>
          <button className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors" title="저장">
            <Check size={20} strokeWidth={2} />
          </button>
          <button className="p-2 rounded-lg text-muted-foreground hover:text-wrong hover:bg-wrong/10 transition-colors" title="삭제">
            <Trash2 size={20} strokeWidth={2} />
          </button>
        </div>
      </section>

      {/* ═══ 우측 패널: AI 채팅 (글래스) ═══ */}
      <aside className="glass-panel w-full lg:w-[360px] flex flex-col border-l relative z-20">
        {/* ambient glow — 유리 뒤에 비칠 빛. 콘텐츠 아래(-z-10), 인터랙션 차단 없음 */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 -right-20 h-64 w-64 rounded-full bg-primary/[0.08] blur-3xl" />
          <div className="absolute bottom-16 -left-24 h-72 w-72 rounded-full bg-[#a78bfa]/[0.06] blur-3xl" />
        </div>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Sparkles size={18} strokeWidth={2} className="text-primary" />
            AI 출제 도우미
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOptionsOpen((v) => !v)}
              aria-pressed={optionsOpen}
              aria-label="AI 생성 설정"
              title="AI 생성 설정"
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-300 ${
                optionsOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Settings2 size={14} strokeWidth={2} />
            </button>
            <Badge variant="secondary" className="font-mono text-[10px] font-medium text-muted-foreground">beta</Badge>
          </div>
        </div>
        {/* 접힘 상태에서도 현재 선택 요약을 노출해 컨텍스트 유지 */}
        {!optionsOpen && (
          <div className="border-b border-border px-5 py-2">
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              className="w-full truncate text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ⚙ {subjects.find((s) => s.id === subjectId)?.name ?? "과목 미선택"} · 난이도{" "}
              {difficulty} · {count}문항{includePassage ? " · 지문" : ""}
            </button>
          </div>
        )}

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-4 py-3 rounded-xl text-sm leading-relaxed max-w-[90%] whitespace-pre-wrap border ${
                msg.role === "ai"
                  ? "glass-chip text-foreground"
                  : "bg-primary/10 text-foreground border-primary/20 self-end ml-auto"
              }`}
            >
              {msg.text}
            </div>
          ))}


          {/* 생성 중 로딩 버블 — 화면이 멈춘 느낌 제거 */}
          {isGenerating && (
            <div className="glass-chip flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin text-primary" />
              문항을 만들고 있어요…
            </div>
          )}

          {/* 생성 결과 미리보기 — 정답/해설 확인 후 명시적으로 적용해야 초안에 반영됨 */}
          {pendingPreview.map((draft) => (
            <div key={draft.id} className="glass-chip border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] font-medium">{draft.type}</Badge>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{extractPlainText(draft.stem)}</p>

              {draft.type === "객관식" ? (
                <div className="space-y-1.5">
                  {draft.choices.map((choice, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                        draft.correct === i
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {draft.correct === i && <Check size={13} strokeWidth={2.5} className="text-primary flex-shrink-0" />}
                      <span>{choice}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {draft.answerText ? `정답: ${draft.answerText}` : "서술형(자기채점 대상)"}
                </p>
              )}

              {extractPlainText(draft.explanation) && (
                <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-2">
                  {extractPlainText(draft.explanation)}
                </p>
              )}

              {draft.passage != null && (
                <Badge variant="secondary" className="text-[10px] font-medium">지문 포함</Badge>
              )}

              <div className="flex gap-2 pt-1">
                <Button onClick={() => applyPreview(draft.id)} size="sm" className="flex-1">
                  문제집에 적용하기
                </Button>
                <button
                  onClick={() => discardPreview(draft.id)}
                  className="px-3 text-xs text-muted-foreground hover:text-wrong transition-colors"
                >
                  무시
                </button>
              </div>
            </div>
          ))}
          {pendingPreview.length > 1 && (
            <button
              onClick={applyAllPreview}
              className="w-full text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1"
            >
              {pendingPreview.length}개 모두 적용하기
            </button>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* 제안 칩 */}
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setPrompt(s)}
              className="px-3 py-1.5 rounded-full border border-border text-muted-foreground text-[11px] transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>

        {optionsOpen && (
        <>
        {/* 생성 옵션 — 과목(필수): 대분류 칩 → 세부과목 칩 2단 선택 */}
        <div className="px-4 pb-2">
          <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">과목</label>
          {subjects.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">과목 로딩…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => selectCategory(c)}
                    disabled={isGenerating}
                    aria-pressed={category === c}
                    className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                      category === c
                        ? "bg-primary border-transparent text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {subjectsInCategory.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {subjectsInCategory.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSubjectId(s.id)}
                      disabled={isGenerating}
                      aria-pressed={subjectId === s.id}
                      className={`px-3 py-1.5 rounded-full border text-[11px] transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                        subjectId === s.id
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 유형 — 다중선택 칩. 1개=강제, 2개+=힌트 생략(섞어서 생성), 0개=완전 자동 */}
        <div className="px-4 pb-2">
          <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">유형</label>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_CHIPS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                disabled={isGenerating}
                aria-pressed={typeSel.has(t)}
                className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                  typeSel.has(t)
                    ? "bg-primary border-transparent text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            여러 개를 고르면 섞어서 출제해요. 아무것도 안 고르면 AI가 알아서 정해요.
          </p>
        </div>

        {/* 난이도 — 프리셋 필 버튼 */}
        <div className="px-4 pb-2">
          <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">난이도</label>
          <div className="flex flex-wrap gap-1.5">
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                disabled={isGenerating}
                aria-pressed={difficulty === d}
                className={`w-8 h-8 rounded-full border text-[11px] font-mono font-medium transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                  difficulty === d
                    ? "bg-primary border-transparent text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* 문항 수 — 프리셋 필 버튼 + 지문 포함 토글 칩 */}
        <div className="px-4 pb-2">
          <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">문항 수</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                disabled={isGenerating}
                aria-pressed={count === n}
                className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                  count === n
                    ? "bg-primary border-transparent text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {n}문항
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setIncludePassage((v) => !v)}
              disabled={isGenerating}
              aria-pressed={includePassage}
              className={`px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all active:scale-[0.98] motion-reduce:transition-none disabled:opacity-50 ${
                includePassage
                  ? "bg-primary border-transparent text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              지문 포함
            </button>
          </div>
        </div>
        </>
        )}

        {/* 입력 바 */}
        <div className="glass-bar border-t px-4 py-3 flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              autoResize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              "예:\n국어 문학 파트, 시어의 상징적 의미를 묻는 고난도 문제로 만들어주세요.\n비유적 표현과 화자의 정서 변화에 초점을 맞추고,\n해설은 오답 선지가 왜 틀렸는지까지 자세히 설명해주세요."
            }
            rows={1}
            disabled={isGenerating}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground resize-none min-h-[36px] max-h-[120px] disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={!prompt.trim() || isGenerating}
            size="icon"
            aria-label="전송"
          >
            {isGenerating ? (
              <Loader2 size={16} strokeWidth={2} className="animate-spin" />
            ) : (
              <Send size={16} strokeWidth={2} />
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}
