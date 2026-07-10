"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, GripVertical, Plus, Send, Sparkles,
  Trash2, ChevronDown, ChevronUp, RotateCcw, Loader2,
} from "lucide-react";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { buildRichDoc, extractPlainText } from "@/lib/prosemirror";
import { regenerateChoices } from "@/lib/api";
import { toast } from "sonner";

/* ── 문항 타입 ── */
type Draft = {
  id: string; // 임시 ID 또는 실제 문제 ID
  type: "객관식" | "주관식";
  stem: any; // ProseMirror JSON
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const handleSend = () => {
    if (!prompt.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: prompt }]);
    const currentPrompt = prompt;
    setPrompt("");

    // 시뮬레이션: AI 응답 후 문항 추가
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `"${currentPrompt}" 기반으로 문항 초안을 추가했어요. 계속 다듬어 보세요.` },
      ]);
      setDrafts((list) => [
        ...list,
        {
          ...emptyObjective,
          id: Date.now().toString(),
          stem: buildRichDoc(`AI 제안 문항: ${currentPrompt}`),
          choices: [
            "핵심 개념을 올바르게 적용한 내용",
            "개념을 일부 혼동한 내용",
            "지문과 관계없는 내용",
            "조건을 반대로 해석한 내용",
          ],
        },
      ]);
    }, 600);
  };

  const handleRegenerateChoices = async (draft: Draft) => {
    // 실제 API 연동 (ID가 임시 ID면 실제로는 생성 후 호출해야 하나, 여기서는 시연용으로 처리)
    setIsRegenerating(draft.id);
    try {
      const stemText = extractPlainText(draft.stem);
      const correctChoiceText = draft.choices[draft.correct] || "";
      const res = await regenerateChoices(draft.id, {
        stemText,
        correctChoiceText,
        choiceCount: draft.choices.length - 1, // 정답 1개 제외한 매력적 오답 수
      });
      
      // 정답을 제외한 나머지 선지를 재생성된 오답으로 덮어쓰기
      const newChoices = [...draft.choices];
      let distractorIndex = 0;
      for (let i = 0; i < newChoices.length; i++) {
        if (i !== draft.correct && distractorIndex < res.distractors.length) {
          newChoices[i] = res.distractors[distractorIndex++];
        }
      }
      update(draft.id, "choices", newChoices);
      toast.success("매력적인 오답 선지가 자동 생성되었습니다.");
    } catch (e) {
      console.error(e);
      toast.error("오답 선지 생성에 실패했습니다.");
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
      <section className="flex-1 flex flex-col min-w-0 border-r-2 border-border relative">
        {/* 헤더 */}
        <header className="flex items-center justify-between px-6 py-4 border-b-2 border-border bg-background sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Link href="/workbook/create" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft size={20} strokeWidth={2.5} />
            </Link>
            <div>
              <span className="inline-block bg-surface-raised border-2 border-border text-foreground px-2 py-0.5 rounded-md text-[10px] font-black tracking-widest uppercase">문제집 편집</span>
              <h1 className="text-lg font-black tracking-tight">2026 수능 국어 · 문학</h1>
            </div>
          </div>
          <button className="flex items-center gap-2 bg-primary text-black px-5 py-2.5 rounded-xl font-black text-sm border-2 border-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all">
            <Check size={16} strokeWidth={3} /> 저장하기
          </button>
        </header>

        {/* 문항 리스트 (스크롤) */}
        <div className="flex-1 overflow-y-auto px-6 py-5 pb-24 space-y-4 relative">
          {drafts.map((draft, index) => (
            <article key={draft.id} className="bg-card border-2 border-border rounded-2xl p-6 shadow-neo-sm hover:border-primary/30 transition-all">
              {/* 카드 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-primary text-xs font-black">
                  <GripVertical size={16} strokeWidth={2.5} className="text-muted-foreground cursor-grab" />
                  <span>문항 {index + 1}</span>
                  <span className="bg-surface-raised border-2 border-border text-foreground px-2 py-0.5 rounded-md text-[10px] font-black">{draft.type}</span>
                </div>
                <button
                  onClick={() => removeQuestion(draft.id)}
                  className="text-muted-foreground hover:text-wrong transition-colors duration-150"
                  aria-label="문항 삭제"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* 지문 (Tiptap) */}
              <label className="block text-xs font-black text-foreground/70 mb-1.5">지문</label>
              <div className="mb-4 relative">
                <TiptapEditor 
                  value={draft.stem} 
                  onChange={(json) => update(draft.id, "stem", json)} 
                  placeholder="문항의 지문을 입력하세요." 
                />
              </div>

              {/* 객관식: 선지 */}
              {draft.type === "객관식" && (
                <>
                  <label className="block text-xs font-black text-foreground/70 mb-1.5">선지</label>
                  <div className="space-y-2 mb-3">
                    {draft.choices.map((choice, i) => (
                      <div key={i} className="flex gap-2">
                        <button
                          onClick={() => update(draft.id, "correct", i)}
                          className={`w-10 h-10 flex-shrink-0 rounded-xl border-2 text-xs font-black transition-all active:translate-y-[1px] ${
                            draft.correct === i
                              ? "bg-primary border-black text-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)]"
                              : "border-border text-muted-foreground hover:border-primary shadow-neo-sm"
                          }`}
                        >
                          {i + 1}
                        </button>
                        <input
                          className="flex-1 bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-bold text-foreground outline-none transition-all focus:border-primary shadow-neo-sm"
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
                    className="flex items-center gap-1.5 text-xs font-black text-purple transition-colors hover:text-purple/80 mb-3 disabled:opacity-50"
                  >
                    {isRegenerating === draft.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    {isRegenerating === draft.id ? "생성 중..." : "AI 매력적 오답 자동 생성"}
                  </button>
                </>
              )}

              {/* 주관식: 정답 */}
              {draft.type === "주관식" && (
                <>
                  <label className="block text-xs font-black text-foreground/70 mb-1.5">정답</label>
                  <input
                    className="w-full bg-background border-2 border-border rounded-xl px-3 py-2.5 text-sm font-bold text-foreground outline-none transition-all focus:border-primary shadow-neo-sm mb-3"
                    value={draft.answerText}
                    onChange={(e) => update(draft.id, "answerText", e.target.value)}
                    placeholder="정답을 입력하세요 (단답형 자동채점, 서술형은 비워두기)"
                  />
                </>
              )}

              {/* 해설 아코디언 */}
              <button
                onClick={() => update(draft.id, "showExplanation", !draft.showExplanation)}
                className="flex items-center gap-1.5 text-xs font-black text-muted-foreground hover:text-foreground transition-colors"
              >
                {draft.showExplanation ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border text-primary text-sm font-black shadow-neo-sm hover:-translate-y-0.5 hover:border-primary active:translate-y-[2px] active:shadow-none transition-all"
            >
              <Plus size={18} strokeWidth={3} /> 객관식 추가
            </button>
            <button
              onClick={() => addQuestion("주관식")}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-border text-primary text-sm font-black shadow-neo-sm hover:-translate-y-0.5 hover:border-primary active:translate-y-[2px] active:shadow-none transition-all"
            >
              <Plus size={18} strokeWidth={3} /> 주관식 추가
            </button>
          </div>
        </div>

        {/* 플로팅 툴바 */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-3 rounded-2xl bg-card border-2 border-border shadow-neo z-20">
          <button onClick={() => addQuestion("객관식")} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors" title="문항 추가">
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-raised transition-colors" title="저장">
            <Check size={20} strokeWidth={2.5} />
          </button>
          <button className="p-2 rounded-xl text-muted-foreground hover:text-wrong/80 hover:bg-wrong/10 transition-colors" title="삭제">
            <Trash2 size={20} strokeWidth={2.5} />
          </button>
        </div>
      </section>

      {/* ═══ 우측 패널: AI 채팅 ═══ */}
      <aside className="w-full lg:w-[360px] flex flex-col bg-card border-l-2 border-border relative z-20">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-border">
          <div className="flex items-center gap-2 text-purple font-black text-sm">
            <Sparkles size={18} strokeWidth={2.5} />
            AI 출제 도우미
          </div>
          <span className="bg-surface-raised border-2 border-border text-[10px] font-black text-muted-foreground px-2 py-0.5 rounded-md">beta</span>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-4 py-3 rounded-xl text-sm leading-relaxed max-w-[90%] whitespace-pre-wrap font-bold border-2 ${
                msg.role === "ai"
                  ? "bg-purple/10 text-foreground border-purple/20"
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
              className="px-3 py-1.5 rounded-xl border-2 border-purple/30 text-purple/80 text-[11px] font-bold transition-all hover:border-purple hover:text-purple hover:bg-purple/5 active:translate-y-[1px]"
            >
              {s}
            </button>
          ))}
        </div>

        {/* 입력 바 */}
        <div className="border-t-2 border-border px-4 py-3 flex items-end gap-2 bg-card">
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
            className="flex-1 bg-transparent border-0 outline-none text-sm font-bold text-foreground resize-none min-h-[36px] max-h-[120px]"
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim()}
            className="p-2.5 rounded-xl bg-primary text-black border-2 border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-40"
          >
            <Send size={16} strokeWidth={3} />
          </button>
        </div>
      </aside>
    </div>
  );
}
