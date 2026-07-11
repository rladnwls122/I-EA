"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, GripVertical, Plus, Send, Sparkles,
  Trash2, ChevronDown, ChevronUp, RotateCcw, Loader2,
} from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { buildRichDoc, extractPlainText } from "@/lib/prosemirror";
import {
  createAiGeneration,
  fetchAiGeneration,
  fetchPassage,
  fetchQuestion,
  fetchSubjects,
  regenerateChoices,
} from "@/lib/api";
import type { Question, Subject } from "@/lib/types";
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
};

const SUGGESTIONS = [
  "문학 고난도 문항을 만들어줘",
  "오답 선지를 더 그럴듯하게 만들어줘",
  "OX 퀴즈 만들기",
  "지문 기반으로 출제",
];

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
  const [difficulty, setDifficulty] = useState(3);
  const [count, setCount] = useState(1);
  const [includePassage, setIncludePassage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 생성 API는 subjectId(NOT NULL)가 필수 → 세부과목 목록을 받아 첫 항목을 기본 선택.
  useEffect(() => {
    fetchSubjects()
      .then((list) => {
        setSubjects(list);
        setSubjectId((prev) => prev || list[0]?.id || "");
      })
      .catch(() => toast.error("과목 목록을 불러오지 못했습니다."));
  }, []);

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

  const handleSend = async () => {
    const currentPrompt = prompt.trim();
    if (!currentPrompt || isGenerating) return;
    if (!subjectId) {
      toast.error("먼저 세부과목을 선택하세요.");
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

      setDrafts((list) => [...list, ...newDrafts]);
      pushAi(`문항 ${newDrafts.length}개를 에디터에 추가했어요. 계속 다듬어 보세요.`);
    } catch (e) {
      console.error(e);
      pushAi("생성 중 오류가 발생했어요. 다시 시도해 주세요.");
      toast.error("AI 문항 생성에 실패했습니다.");
    } finally {
      setIsGenerating(false);
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
              <h1 className="text-lg font-semibold tracking-tight">2026 수능 국어 · 문학</h1>
            </div>
          </div>
          <Button size="sm" className="gap-2">
            <Check size={16} strokeWidth={2} /> 저장하기
          </Button>
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

      {/* ═══ 우측 패널: AI 채팅 ═══ */}
      <aside className="w-full lg:w-[360px] flex flex-col bg-card border-l border-border relative z-20">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Sparkles size={18} strokeWidth={2} className="text-primary" />
            AI 출제 도우미
          </div>
          <Badge variant="secondary" className="font-mono text-[10px] font-medium text-muted-foreground">beta</Badge>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-4 py-3 rounded-xl text-sm leading-relaxed max-w-[90%] whitespace-pre-wrap border ${
                msg.role === "ai"
                  ? "bg-surface-raised text-foreground border-border"
                  : "bg-primary/10 text-foreground border-primary/20 self-end ml-auto"
              }`}
            >
              {msg.text}
            </div>
          ))}
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

        {/* 생성 옵션 — 과목(필수)·난이도·문항 수 */}
        <div className="flex items-center gap-2 px-4 pb-2">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={isGenerating}
            aria-label="세부과목"
            className="flex-1 min-w-0 bg-surface-raised border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none disabled:opacity-50"
          >
            {subjects.length === 0 && <option value="">과목 로딩…</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.examCategory} · {s.name}
              </option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            disabled={isGenerating}
            aria-label="난이도"
            className="bg-surface-raised border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none disabled:opacity-50"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>난이도 {d}</option>
            ))}
          </select>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={isGenerating}
            aria-label="문항 수"
            className="bg-surface-raised border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none disabled:opacity-50"
          >
            {[1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>{n}문항</option>
            ))}
          </select>
        </div>

        {/* 지문 포함 토글 */}
        <div className="px-4 pb-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePassage}
              onChange={(e) => setIncludePassage(e.target.checked)}
              disabled={isGenerating}
              className="h-3.5 w-3.5 rounded border-border accent-primary disabled:opacity-50"
            />
            지문(본문) 함께 생성
          </label>
        </div>

        {/* 입력 바 */}
        <div className="border-t border-border px-4 py-3 flex items-end gap-2 bg-card">
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
            placeholder="예: 현대시 화자의 태도를 묻는 상 난이도 문항 1개"
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
