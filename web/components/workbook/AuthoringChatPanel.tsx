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
import type { CanvasCard } from "./AuthoringCanvas";
import { toast } from "sonner";

interface Msg {
  role: "user" | "ai";
  text: string;
  questions?: ParsedQuestion[];
  appliedKeys?: Set<string>; // 이미 적용한 제안 인덱스(멱등)
}

const BATCH_OPTIONS = [1, 3, 5];

export function AuthoringChatPanel({
  workbookId,
  cards,
  onSubjectResolved,
  onApplyQuestion,
}: {
  workbookId: string;
  cards: CanvasCard[];
  onSubjectResolved: (subjectId: string) => void;
  onApplyQuestion: (q: ParsedQuestion) => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [input, setInput] = useState("");
  const [batch, setBatch] = useState(1);
  const [streaming, setStreaming] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", text: "원하는 주제·난이도·출제 포인트를 알려주세요. 한 문제씩 신중히 만들 수도, 한 번에 여러 개 만들 수도 있어요." },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

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
    if (!msg || streaming || !subjectId) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text: msg }, { role: "ai", text: "" }]);
    setStreaming(true);

    const currentQuestions = cards.map((c, i) => ({
      index: i + 1,
      questionType: c.type,
      stem: extractPlainText(c.stem),
    }));

    await streamAuthoringChat(
      { workbookId, subjectId, message: msg, batchSize: batch, currentQuestions },
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
          setMessages((p) => {
            const copy = [...p];
            copy[copy.length - 1] = {
              role: "ai",
              text: stripQuestionBlocks(full) || "문항을 만들었어요.",
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
    <aside className="flex w-[440px] flex-none flex-col border-l border-border">
      {/* 헤더 — 배치 크기 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">AI 출제 도우미</span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          한번에
          {BATCH_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setBatch(n)}
              className={`rounded px-1.5 py-0.5 ${batch === n ? "bg-primary text-primary-foreground" : "hover:text-foreground"}`}
            >
              {n}개
            </button>
          ))}
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
                  <div className="mb-1 text-xs font-medium text-muted-foreground">{q.questionType}</div>
                  <p>{q.stem}</p>
                  {applied ? (
                    <p className="mt-2 text-xs text-primary">✓ 문제집에 추가되었어요</p>
                  ) : (
                    <button
                      onClick={() => apply(mi, qi, q)}
                      className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground"
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
