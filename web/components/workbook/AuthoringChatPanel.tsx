"use client";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { fetchSubjects } from "@/lib/api";
import { extractPlainText } from "@/lib/prosemirror";
import {
  streamAuthoringChat,
  parseQuestionBlocks,
  stripQuestionBlocks,
  type ParsedQuestion,
} from "@/lib/authoring-chat";
import type { CanvasCard, AiSettings } from "./AuthoringCanvas";
import { toast } from "sonner";

interface Msg {
  role: "user" | "ai";
  text: string;
  questions?: ParsedQuestion[];
  appliedKeys?: Set<string>; // 이미 적용한 제안 인덱스(멱등)
}

/** 설정 패널의 유형 칩 — null은 "자동"(AI가 알아서). */
const TYPE_OPTIONS: Array<{ label: string; value: AiSettings["questionType"] }> = [
  { label: "자동", value: null },
  { label: "객관식", value: "객관식" },
  { label: "주관식", value: "주관식" },
  { label: "OX", value: "OX" },
];

export function AuthoringChatPanel({
  workbookId,
  cards,
  settings,
  onSettingsChange,
  onSubjectResolved,
  onApplyQuestion,
  prefill,
  onPrefillConsumed,
  onStreamingChange,
}: {
  workbookId: string;
  cards: CanvasCard[];
  /** AI 생성 설정 — 채팅창(스레드/입력)과 분리된 독립 패널이 조작. */
  settings: AiSettings;
  onSettingsChange: (s: AiSettings) => void;
  onSubjectResolved: (subjectId: string) => void;
  onApplyQuestion: (q: ParsedQuestion) => void;
  /** 카드 ✨AI 버튼이 넣어주는 입력창 프리필(예: "문제 2 수정: "). */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
  /** 모바일 탭바가 "지금 AI가 응답 중"임을 표시할 수 있게 스트리밍 상태를 올려준다. */
  onStreamingChange?: (streaming: boolean) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreamingState] = useState(false);
  const setStreaming = (v: boolean) => {
    setStreamingState(v);
    onStreamingChange?.(v);
  };
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", text: "원하는 주제·난이도·출제 포인트를 알려주세요. 한 문제씩 신중히 만들 수도, 한 번에 여러 개 만들 수도 있어요." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 카드 ✨AI 클릭 → 입력창에 프리필 + 포커스(커서를 끝으로).
  useEffect(() => {
    if (!prefill) return;
    setInput(prefill);
    onPrefillConsumed?.();
    requestAnimationFrame(() => {
      const ta = inputRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, [prefill, onPrefillConsumed]);

  // 첫 과목을 기본 선택해 subjectId를 캔버스에 올린다(저장에 필요).
  useEffect(() => {
    fetchSubjects()
      .then((list) => {
        const first = list[0];
        if (first) {
          setSubjectId(first.id);
          onSubjectResolved(first.id);
        }
      })
      .catch(() => toast.error("과목 목록을 불러오지 못했습니다."));
  }, [onSubjectResolved]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    if (!subjectId) {
      // 과목 목록을 아직 못 불러왔을 때(로딩 중/실패) 조용히 무시하지 않고 알려준다.
      toast.error("과목 정보를 아직 불러오는 중이에요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setInput("");
    setMessages((p) => [...p, { role: "user", text: msg }, { role: "ai", text: "" }]);
    setStreaming(true);

    const currentQuestions = cards.map((c, i) => ({
      index: i + 1,
      questionType: c.type,
      stem: extractPlainText(c.stem),
    }));

    // 설정 패널 → 힌트 매핑. OX는 저장 유형이 아니라 객관식 + ox 플래그.
    const questionType =
      settings.questionType === "OX" ? ("객관식" as const) : settings.questionType ?? undefined;
    const ox = settings.questionType === "OX" ? true : undefined;

    await streamAuthoringChat(
      {
        workbookId,
        subjectId,
        message: msg,
        batchSize: settings.count,
        questionType,
        ox,
        difficulty: settings.difficulty,
        currentQuestions,
      },
      {
        onDelta: (_d, full) => {
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = { role: "ai", text: stripQuestionBlocks(full) };
            return copy;
          });
        },
        onDone: (full) => {
          const questions = parseQuestionBlocks(full);
          const prose = stripQuestionBlocks(full);
          // 파싱된 문항이 없으면 "만들었다"는 식의 문구를 지어내지 않는다 —
          // 산문이 있으면 그대로(모델이 대화만 한 정상 케이스), 산문마저 없으면
          // 블록 파싱 실패이므로 정직하게 재시도를 안내한다.
          const text =
            prose ||
            (questions.length
              ? "문항을 만들었어요. 아래에서 확인하고 적용해주세요."
              : "⚠ 문항 데이터를 읽지 못했어요. \"다시 만들어줘\"라고 요청해보세요.");
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = {
              role: "ai",
              text,
              questions: questions.length ? questions : undefined,
              appliedKeys: new Set(),
            };
            return copy;
          });
          setStreaming(false);
        },
        onError: (m) => {
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = { role: "ai", text: `⚠ ${m}` };
            return copy;
          });
          setStreaming(false);
        },
      },
    );
  };

  const apply = (mi: number, qi: number, q: ParsedQuestion) => {
    onApplyQuestion(q);
    setMessages((p) => {
      const copy = [...p];
      const applied = new Set(copy[mi].appliedKeys);
      applied.add(String(qi));
      copy[mi] = { ...copy[mi], appliedKeys: applied };
      return copy;
    });
  };

  return (
    <aside className="flex w-full flex-1 flex-col border-l-0 border-border md:w-[440px] md:flex-none md:border-l">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">AI 출제 도우미</span>
      </div>

      {/* 생성 설정 — 채팅 스레드/입력창과 분리된 독립 패널 */}
      <div className="space-y-2.5 border-b border-border bg-surface-raised/50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-muted-foreground">유형</span>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => onSettingsChange({ ...settings, questionType: t.value })}
              aria-pressed={settings.questionType === t.value}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                settings.questionType === t.value
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            문항 수
            <input
              type="number"
              min={1}
              max={10}
              value={settings.count}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  count: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="h-6 w-14 rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-1 items-center gap-2 text-[11px] font-medium text-muted-foreground">
            난이도
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.difficulty}
              onChange={(e) => onSettingsChange({ ...settings, difficulty: Number(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="w-4 font-mono tabular-nums text-foreground">{settings.difficulty}</span>
          </label>
        </div>
      </div>

      {/* 스레드 */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, mi) => (
          <div key={mi} className="space-y-2">
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                m.role === "ai" ? "border border-border bg-surface-raised" : "ml-auto bg-primary text-primary-foreground"
              }`}
            >
              {m.text || (m.role === "ai" ? "…" : "")}
            </div>
            {m.questions?.map((q, qi) => {
              const applied = m.appliedKeys?.has(String(qi));
              return (
                <div key={qi} className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span>{q.questionType}</span>
                    {q.passage && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px]">지문 포함</span>
                    )}
                    {q.target?.startsWith("replace:") && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                        문제 {q.target.slice(8)} 교체안
                      </span>
                    )}
                  </div>
                  {q.passage && (
                    <p className="mb-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-raised px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
                      {q.passage}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{q.stem}</p>
                  {/* 선지 미리보기 — 정답 강조 */}
                  {q.questionType === "객관식" && q.choices && (
                    <ol className="mt-2 space-y-1">
                      {q.choices.map((ch, ci) => (
                        <li
                          key={ci}
                          className={`flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${
                            ci === q.correctIndex
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          <span className="font-mono">{ci + 1}.</span>
                          <span className="whitespace-pre-wrap">{ch}</span>
                          {ci === q.correctIndex && <span className="ml-auto flex-none text-primary">✓</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {q.questionType === "주관식" && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      정답: {q.answerText?.trim() || "서술형 (자기채점)"}
                    </p>
                  )}
                  {q.explanation && (
                    <p className="mt-2 whitespace-pre-wrap border-t border-border pt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {q.explanation}
                    </p>
                  )}
                  {applied ? (
                    <p className="mt-2 text-xs text-primary">✓ 문제집에 추가되었어요</p>
                  ) : (
                    <button
                      onClick={() => apply(mi, qi, q)}
                      className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      {q.target?.startsWith("replace:") ? "이 문항으로 교체하기" : "문제집에 적용하기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* 입력 */}
      <div className="flex items-end gap-2 border-t border-border px-4 py-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="어떤 문제를 추가할까요?"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          onClick={send}
          disabled={streaming || !input.trim()}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </aside>
  );
}
