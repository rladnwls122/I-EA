"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bot, Check, PencilLine, Send, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const SUGGESTIONS = [
  { label: "고난도 문항을 만들어줘", apply: (s: Settings) => ({ ...s, difficulty: 5 }) },
  { label: "오답 선지를 더 그럴듯하게 만들어줘", apply: (s: Settings) => s },
  { label: "OX 퀴즈로 만들어줘", apply: (s: Settings) => ({ ...s, questionType: "객관식" as const, ox: true }) },
  { label: "지문 기반으로 출제해줘", apply: (s: Settings) => ({ ...s, includePassage: true }) },
];

type Settings = {
  questionType: "객관식" | "주관식";
  difficulty: number;
  count: number;
  includePassage: boolean;
  ox: boolean;
};

type GeneratedQuestion = { id: string; questionType: string };

/**
 * AI 출제 도우미 — 대화형으로 꾸민 단발성 생성 패널.
 * 실제 멀티턴 대화 히스토리는 없다(백엔드가 한 번의 프롬프트→생성 요청만 지원).
 * 진행 상태(생성중/완료/실패)를 메시지 스레드처럼 표시하는 게 핵심이고,
 * 조건 설정은 채팅 영역과 분리된 박스로 입력창 바로 위에 둔다.
 */
export function AiGenerationChat({
  topic,
  onTopicChange,
  settings,
  onSettingsChange,
  isGenerating,
  isCompleted,
  isFailed,
  isSending,
  generatedQuestions,
  onSend,
}: {
  topic: string;
  onTopicChange: (v: string) => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  isGenerating: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isSending: boolean;
  generatedQuestions: GeneratedQuestion[] | undefined;
  onSend: () => void;
}) {
  const threadEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isGenerating, isCompleted, isFailed]);

  const canSend = topic.trim().length > 0 && !isGenerating && !isSending;

  const applySuggestion = (apply: (s: Settings) => Settings) => {
    onSettingsChange(apply(settings));
  };

  return (
    <div className="flex h-[640px] flex-col overflow-hidden rounded-xl border border-primary/30 bg-card">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles size={16} strokeWidth={2} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">AI 출제 도우미</h3>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            beta
          </span>
        </div>
      </div>

      {/* 메시지 스레드 */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {/* 인트로(고정 안내) 말풍선 */}
        <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-border bg-surface-raised px-4 py-3 text-sm leading-relaxed text-foreground">
          원하는 주제, 난이도, 출제 포인트를 알려주세요. 문항 초안을 바로 문제집에 담아드릴게요.
        </div>

        {/* 보낸 요청(있으면 사용자 말풍선처럼) */}
        {(isGenerating || isCompleted || isFailed) && (
          <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
            {topic}
          </div>
        )}

        {/* 생성 중 — 스켈레톤 카드들을 어시스턴트 메시지처럼 */}
        {isGenerating && (
          <div className="max-w-[90%] space-y-2 rounded-xl rounded-tl-sm border border-border bg-surface-raised p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot size={13} />
              <span className="font-mono tabular-nums">{settings.count}</span>개 문항 생성 중...
            </p>
            {Array.from({ length: Math.min(settings.count, 3) }).map((_, i) => (
              <div key={i} className="space-y-1.5 rounded-lg border border-border bg-card p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {/* 완료 */}
        {isCompleted && generatedQuestions && (
          <div className="max-w-[90%] space-y-2 rounded-xl rounded-tl-sm border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Check size={13} />
              <span className="font-mono tabular-nums">{generatedQuestions.length}</span>개 문항이 생성되어 문제집에 담겼어요.
            </p>
            <div className="space-y-1.5">
              {generatedQuestions.map((q, i) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2"
                >
                  <span className="text-xs text-foreground">
                    <span className="font-mono tabular-nums">문항 {i + 1}</span> · {q.questionType}
                  </span>
                  <Link
                    href={`/studio/editor?questionId=${q.id}`}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <PencilLine size={11} /> 정밀 편집
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 실패 */}
        {isFailed && (
          <div className="max-w-[90%] rounded-xl rounded-tl-sm border border-wrong/30 bg-wrong/10 px-4 py-3 text-sm text-wrong">
            문항 생성에 실패했어요. 모델이 유효한 문항을 반환하지 못했어요 — 출제 지시를 조금 더 구체적으로 써보거나 다시 시도해주세요.
          </div>
        )}

        {/* 빠른 제안 — 대기 상태일 때만 */}
        {!isGenerating && !isSending && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  onTopicChange(s.label);
                  applySuggestion(s.apply);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div ref={threadEndRef} />
      </div>

      {/* 설정 — 채팅 영역과 분리된 박스, 입력창 바로 위 */}
      <div className="mx-4 mb-3 space-y-2.5 rounded-lg border border-border bg-surface-raised p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">유형</span>
          {(["객관식", "주관식"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onSettingsChange({ ...settings, questionType: t })}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                settings.questionType === t
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}

          <span className="ml-2 text-[11px] font-medium text-muted-foreground">난이도</span>
          {[1, 2, 3, 4, 5].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onSettingsChange({ ...settings, difficulty: d })}
              className={`flex h-6 w-6 items-center justify-center rounded-md border font-mono text-[11px] tabular-nums transition-colors ${
                settings.difficulty === d
                  ? "border-transparent bg-primary font-medium text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            문항 수
            <input
              type="number"
              min={1}
              max={20}
              value={settings.count}
              onChange={(e) => onSettingsChange({ ...settings, count: Number(e.target.value) })}
              className="h-6 w-14 rounded border border-border bg-transparent px-1.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.includePassage}
              onChange={(e) => onSettingsChange({ ...settings, includePassage: e.target.checked })}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            지문 포함
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={settings.ox}
              onChange={(e) => onSettingsChange({ ...settings, ox: e.target.checked })}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            OX 스타일
          </label>
        </div>
      </div>

      {/* 입력 */}
      <div className="flex items-end gap-2 border-t border-border px-4 py-3">
        <textarea
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="예: 현대시 화자의 태도를 묻는 상 난이도 문항"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="생성 요청 보내기"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
