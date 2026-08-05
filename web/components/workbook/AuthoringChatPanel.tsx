"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { extractPlainText } from "@/lib/prosemirror";
import {
  streamAuthoringChat,
  parseQuestionBlocks,
  stripQuestionBlocks,
  questionRejectReason,
  type ParsedQuestion,
} from "@/lib/authoring-chat";
import type { CanvasCard, AiSettings } from "./AuthoringCanvas";
import type { SelfReviewNote } from "@/lib/types";
import { SelfReviewChip } from "./SelfReviewChip";
import { toast } from "sonner";

interface Msg {
  role: "user" | "ai";
  text: string;
  questions?: ParsedQuestion[];
  appliedKeys?: Set<string>; // 이미 적용한 제안 인덱스(멱등)
  /**
   * AI 자기검증 판정 — 제안 인덱스별(#34, #33 잔여 1). 문항이 뜬 **뒤에** 도착한다.
   * `undefined`는 "아직 기다리는 중", `null`은 "판정이 없다"(검증 꺼짐·판정 실패)로
   * 뚜렷이 구분한다 — 뭉개면 배지가 영원히 스피너로 남거나, 판정 못 한 문항이 통과로 보인다.
   */
  reviews?: Record<number, SelfReviewNote> | null;
}

/** 설정 패널의 유형 칩 — null은 "자동"(AI가 알아서). */
const TYPE_OPTIONS: Array<{ label: string; value: AiSettings["questionType"] }> = [
  { label: "자동", value: null },
  { label: "객관식", value: "객관식" },
  { label: "주관식", value: "주관식" },
  { label: "OX", value: "OX" },
];

/** 선지 개수 — null은 "자동"(시험별 관행을 AI가 따른다). */
const CHOICE_COUNT_OPTIONS: Array<{ label: string; value: AiSettings["choiceCount"] }> = [
  { label: "자동", value: null },
  { label: "4지", value: 4 },
  { label: "5지", value: 5 },
];

/** 지문 포함 — null은 "자동"(문항 성격에 따라 AI가 판단). */
const PASSAGE_OPTIONS: Array<{ label: string; value: AiSettings["includePassage"] }> = [
  { label: "자동", value: null },
  { label: "포함", value: true },
  { label: "없음", value: false },
];

export function AuthoringChatPanel({
  workbookId,
  cards,
  settings,
  onSettingsChange,
  resolvedSubjectId,
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
  /**
   * 캔버스가 이미 확정한 과목(URL의 initialSubjectId 또는 기존 문항의 과목).
   * 있으면 이걸 그대로 쓰고, 과목 목록을 다시 불러와 임의로 고르지 않는다.
   */
  resolvedSubjectId?: string;
  /**
   * 캔버스 반영. 실패하면 한국어 사유를 반환한다(성공 시 null) — 스레드에 표시.
   * `originKey`는 이 문항이 나온 AI 응답의 식별자다. 캔버스가 같은 응답에서 나온
   * 지문세트(예: (가)(나) 주제통합)를 하나로 묶는 데만 쓴다 — 응답이 다르면
   * 지문 평문이 우연히 같아도 남남이다.
   */
  onApplyQuestion: (
    q: ParsedQuestion,
    originKey: string,
    review?: SelfReviewNote,
  ) => string | null;
  /** 카드 ✨AI 버튼이 넣어주는 입력창 프리필(예: "문제 2 수정: "). */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
  /** 모바일 탭바가 "지금 AI가 응답 중"임을 표시할 수 있게 스트리밍 상태를 올려준다. */
  onStreamingChange?: (streaming: boolean) => void;
}) {
  const [subjectId, setSubjectId] = useState(resolvedSubjectId ?? "");
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
  // 스트리밍 중 갱신할 AI 플레이스홀더 메시지의 인덱스 — "마지막 메시지"를 덮어쓰면
  // 스트리밍 중 다른 메시지(예: 이전 제안 적용 실패 경고)가 append됐을 때 그걸
  // 삼켜버리므로, 전송 시점에 인덱스를 고정해 그 자리만 갱신한다.
  const streamIdxRef = useRef(-1);

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

  // 캔버스가 이미 과목을 확정해 넘겨주면(URL의 initialSubjectId, 또는 기존
  // 문항의 과목) 그대로 따른다 — 목록을 다시 불러와 임의로 고르지 않는다.
  useEffect(() => {
    if (resolvedSubjectId) setSubjectId(resolvedSubjectId);
  }, [resolvedSubjectId]);

  // 과목 fallback은 캔버스(AuthoringCanvas)가 문제집 로딩을 기다렸다가 결정한다.
  // 여기서 목록 첫 번째를 임의로 고르면 문제집 로딩 전에 엉뚱한 과목으로
  // 고정되는 레이스가 생긴다(예: 영어 문제집인데 NCS로 대화) — 절대 재도입 금지.

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** 스트리밍 플레이스홀더(고정 인덱스) 자리만 교체 — append된 다른 메시지를 덮어쓰지 않는다. */
  const patchStreamMsg = (msg: Msg) => {
    setMessages((p) => {
      const idx = streamIdxRef.current;
      if (idx < 0 || idx >= p.length || p[idx].role !== "ai") return p;
      const copy = [...p];
      copy[idx] = msg;
      return copy;
    });
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    if (!subjectId) {
      // 과목 목록을 아직 못 불러왔을 때(로딩 중/실패) 조용히 무시하지 않고 알려준다.
      toast.error("과목 정보를 아직 불러오는 중이에요. 잠시 후 다시 시도해주세요.");
      return;
    }
    setInput("");
    /**
     * 이 턴의 응답이 앉을 자리. ref와 **따로** 들고 있는 이유: 자기검증 판정은 본문(done)
     * 뒤에 도착하는데, done 시점에 입력창이 이미 풀리므로 그 사이 사용자가 다음 질문을
     * 보낼 수 있다. 그러면 ref는 새 턴을 가리키고, 늦게 온 판정이 **엉뚱한 메시지**에
     * 붙는다. 자기 자리를 알고 있어야 한다.
     */
    let myIdx = -1;
    setMessages((p) => {
      // 플레이스홀더 인덱스 고정 — updater 안에서 계산해야 직전 append와 어긋나지 않는다.
      // (StrictMode 이중 실행에도 같은 p로 같은 값이 들어가므로 안전.)
      streamIdxRef.current = p.length + 1;
      myIdx = p.length + 1;
      return [...p, { role: "user", text: msg }, { role: "ai", text: "" }];
    });
    setStreaming(true);

    // 백엔드 DTO(CurrentQuestionRef) 형태대로 선지·정답·해설까지 채워 보낸다 —
    // stem만 보내면 교체 요청 시 AI가 기존 선지/정답/해설을 못 보고 만든다.
    // slice 상한은 DTO의 MaxLength(stem 4000, answer 2000, explanation 4000)와 맞춘다.
    const currentQuestions = cards.map((c, i) => {
      const explanation = extractPlainText(c.explanation).trim();
      const answer =
        c.type === "객관식"
          ? extractPlainText(c.choices[c.correct]?.content).trim() || undefined
          : c.answerText.trim() || undefined;
      return {
        index: i + 1,
        questionType: c.type,
        stem: extractPlainText(c.stem).slice(0, 4000),
        ...(c.type === "객관식" && c.choices.length
          ? { choices: c.choices.map((ch) => extractPlainText(ch.content)) }
          : {}),
        ...(answer ? { answer: answer.slice(0, 2000) } : {}),
        ...(explanation ? { explanation: explanation.slice(0, 4000) } : {}),
      };
    });

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
        ...(settings.choiceCount ? { choiceCount: settings.choiceCount } : {}),
        ...(settings.includePassage !== null ? { includePassage: settings.includePassage } : {}),
        difficulty: settings.difficulty,
        currentQuestions,
      },
      {
        onDelta: (_d, full) => {
          patchStreamMsg({ role: "ai", text: stripQuestionBlocks(full) });
        },
        onDone: (full) => {
          const questions = parseQuestionBlocks(full);
          const prose = stripQuestionBlocks(full);
          // 파싱된 문항이 없으면 "만들었다"는 식의 문구를 지어내지 않는다 —
          // 산문이 있으면 그대로(모델이 대화만 한 정상 케이스), 산문마저 없으면
          // 블록 파싱 실패이므로 정직하게 재시도를 안내한다.
          let text =
            prose ||
            (questions.length
              ? "문항을 만들었어요. 아래에서 확인하고 적용해주세요."
              : "⚠ 문항 데이터를 읽지 못했어요. \"다시 만들어줘\"라고 요청해보세요.");
          // 형식 검증에 걸릴 문항은 조용히 두지 않고 건수+사유를 미리 알린다 —
          // 적용 버튼을 눌러야 실패를 아는 것보다 여기서 먼저 보이는 게 낫다.
          const rejects = questions
            .map((q, i) => ({ n: i + 1, reason: questionRejectReason(q) }))
            .filter((r): r is { n: number; reason: string } => r.reason !== null);
          if (rejects.length > 0) {
            const detail = rejects.map((r) => `${r.n}번째: ${r.reason}`).join(", ");
            text += `\n\n⚠ ${questions.length}개 중 ${rejects.length}개는 형식 문제로 적용할 수 없어요 (${detail}). "다시 만들어줘"라고 요청해보세요.`;
          }
          patchStreamMsg({
            role: "ai",
            text,
            questions: questions.length ? questions : undefined,
            appliedKeys: new Set(),
            // 문항이 있으면 판정이 뒤따라온다 — undefined로 두어 "검수 중"을 띄운다.
            // 문항이 없는 턴은 애초에 판정 대상이 아니므로 기다리지 않는다.
            reviews: questions.length ? undefined : null,
          });
          setStreaming(false);
        },
        onReview: (payload) => {
          // 판정은 본문(done) 뒤에 도착하므로 **이 턴의 자리**(myIdx)에 붙인다.
          // verdict의 index는 파싱된 문항 배열의 자리 — 서버도 같은 파서로 같은 배열을
          // 만들기 때문에 제안 카드와 그대로 대응한다.
          const byIndex: Record<number, SelfReviewNote> = {};
          if (payload) {
            for (const v of payload.verdicts) {
              byIndex[v.index] = {
                model: payload.model,
                at: payload.at,
                verdict: v.verdict,
                axes: v.axes,
                issues: v.issues,
              };
            }
          }
          setMessages((p) => {
            if (myIdx < 0 || myIdx >= p.length || p[myIdx].role !== "ai") return p;
            const copy = [...p];
            copy[myIdx] = { ...copy[myIdx], reviews: payload ? byIndex : null };
            return copy;
          });
        },
        onError: (m) => {
          patchStreamMsg({ role: "ai", text: `⚠ ${m}` });
          setStreaming(false);
        },
      },
    );
  };

  const apply = (mi: number, qi: number, q: ParsedQuestion, review?: SelfReviewNote) => {
    // 스레드는 append와 제자리 갱신만 하고 중간을 지우지 않으므로, 인덱스가 그대로
    // 그 응답의 식별자가 된다.
    // 판정도 함께 넘긴다 — 카드에 붙어 저장까지 따라가야 나중에 문항 상세에서도 보인다.
    const reason = onApplyQuestion(q, `msg-${mi}`, review);
    if (reason) {
      // 조용히 버리지 않는다 — 실패 사유를 스레드에 남겨 사용자가 재요청할 수 있게.
      setMessages((p) => [
        ...p,
        { role: "ai", text: `⚠ 문항을 적용하지 못했어요 — ${reason}. "다시 만들어줘"라고 요청해보세요.` },
      ]);
      return;
    }
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
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles size={15} strokeWidth={2} className="text-purple" />
          AI 출제 도우미
        </span>
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
        {/* 선지 개수·지문 포함 — 편집기 일원화(#41 Phase 3)로 사라진 두 조작을 캔버스로 옮긴 것.
            "자동"이 기본인 이유: 시험마다 관행이 달라(수능 5지 / 공무원·토익 4지) 사용자가
            매번 고르는 것보다 AI가 과목을 보고 따르는 게 맞을 때가 대부분이다. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">선지</span>
            {CHOICE_COUNT_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                // OX는 선지가 2개로 고정이라 백엔드가 choiceCount를 무시한다 —
                // 누를 수 있게 두면 선택된 것처럼 보이면서 아무 효과가 없다.
                disabled={
                  settings.questionType === "주관식" || settings.questionType === "OX"
                }
                onClick={() => onSettingsChange({ ...settings, choiceCount: o.value })}
                aria-pressed={settings.choiceCount === o.value}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                  settings.choiceCount === o.value
                    ? "border-transparent bg-primary font-medium text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">지문</span>
            {PASSAGE_OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => onSettingsChange({ ...settings, includePassage: o.value })}
                aria-pressed={settings.includePassage === o.value}
                className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                  settings.includePassage === o.value
                    ? "border-transparent bg-primary font-medium text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
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
              // reviews가 undefined면 아직 기다리는 중, null이면 판정 없음(칩이 셋을 구분한다).
              const review = m.reviews === undefined ? undefined : (m.reviews?.[qi] ?? null);
              return (
                <div key={qi} className="rounded-xl border border-purple/30 bg-purple/5 p-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span>{q.questionType}</span>
                    {q.passage && (
                      <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px]">지문 포함</span>
                    )}
                    {q.target?.startsWith("replace:") && (
                      <span className="rounded bg-purple/10 px-1.5 py-0.5 text-[10px] text-purple">
                        문제 {q.target.slice(8)} 교체안
                      </span>
                    )}
                    {/* 적용할지 정하는 자리에 검수 결과를 붙인다 — 적용한 뒤 문항 상세를
                        열어야 알 수 있으면 고치는 비용이 훨씬 커진다. */}
                    <SelfReviewChip review={review} className="ml-auto" />
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
                      onClick={() => apply(mi, qi, q, review ?? undefined)}
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
