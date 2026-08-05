"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import {
  fetchReviewTutorHistory,
  splitTutorMath,
  streamReviewTutorChat,
  REVIEW_TUTOR_SUGGESTIONS,
  type ReviewTutorTurn,
  type TutorSegment,
} from "@/lib/review-tutor";
import { RichContent } from "@/components/editor/RichContent";

/**
 * 튜터 답변 한 덩어리. 평문은 평문 그대로 두고 `$...$`/`$$...$$` 구간만 수식으로 그린다.
 * (자르는 규칙과 그 판단 근거는 `splitTutorMath` 주석에 있다.)
 *
 * **KaTeX 주입 경계를 새로 만들지 않는다.** 수식 렌더는 `RichContent`의 math 노드
 * 경로에 그대로 태운다 — `dangerouslySetInnerHTML`은 저장소 전체에서 그 파일의
 * `MathNode` 한 함수에만 있고, 안전한 이유도 거기 적혀 있다. 여기서 katex를 다시
 * 부르면 그 경계가 두 곳으로 늘어나고 한쪽만 `trust:false`를 잃는 사고가 가능해진다.
 * 그래서 노드 한 개짜리 배열을 만들어 넘긴다.
 */
function TutorAnswer({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    // 평문 답변의 생김새는 예전 그대로다 — 줄바꿈은 여전히 whitespace-pre-wrap이 살린다.
    <div className="whitespace-pre-wrap leading-relaxed">
      {splitTutorMath(text, { streaming }).map((seg, i) => (
        <TutorSegmentView key={i} segment={seg} />
      ))}
    </div>
  );
}

function TutorSegmentView({ segment }: { segment: TutorSegment }) {
  if (segment.kind === "text") return <Fragment>{segment.text}</Fragment>;

  if (segment.kind === "math") {
    const node = segment.block
      ? { type: "blockMath", attrs: { latex: segment.latex } }
      : { type: "inlineMath", attrs: { latex: segment.latex } };
    // 인라인 수식은 RichContent의 래퍼 div를 글줄 안에 흘려보내야 한다(별행은 블록 그대로).
    return <RichContent value={[node]} className={segment.block ? "" : "inline"} />;
  }

  // 아직 닫히지 않은 수식 — 원문을 흐린 고정폭으로 보여준다. 숨기지 않는다.
  return <span className="font-mono text-muted-foreground">{segment.source}</span>;
}

/**
 * 오답 복습 AI 코치 패널 (#40 프로토타입).
 *
 * 우측 슬라이드 오버. 세션 결과·오답노트의 문항 카드에서 "AI 코치" 버튼으로 연다.
 *
 * **선제 메시지를 자동으로 쏘지 않는다.** 초안(§A)은 첫 진입 시 "왜 틀렸나"를 1회
 * 무료로 선제 제공하자고 했는데, 그러면 패널을 열기만 해도 매번 LLM 호출이 나간다
 * (열고 바로 닫는 경우까지 과금). 대신 같은 질문을 **추천 질문 버튼**으로 한 번에
 * 보낼 수 있게 했다 — 사용자 체감은 탭 한 번 차이인데 비용은 실제 사용에만 든다.
 * 도그푸딩에서 "먼저 말 걸어주는 게 확실히 낫다"가 확인되면 이 컴포넌트에서
 * 마운트 시 첫 추천 질문을 자동 전송하도록 세 줄만 바꾸면 된다.
 */
export function ReviewTutorPanel({
  questionId,
  onClose,
}: {
  questionId: string;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<ReviewTutorTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 저장된 대화(24h)를 불러와 이어 보인다.
  useEffect(() => {
    let alive = true;
    void fetchReviewTutorHistory(questionId).then((prior) => {
      if (alive) setTurns(prior);
    });
    return () => {
      alive = false;
    };
  }, [questionId]);

  // 새 델타가 올 때마다 아래로 붙인다.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, streamed]);

  const send = async (message: string) => {
    const text = message.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text }]);
    setStreaming(true);
    setStreamed("");

    await streamReviewTutorChat(
      { questionId, message: text },
      {
        onDelta: (_delta, full) => setStreamed(full),
        onDone: (full) => {
          // 완결된 응답만 대화 목록으로 승격한다(서버 히스토리 규칙과 동일).
          if (full) setTurns((prev) => [...prev, { role: "model", text: full }]);
          setStreamed("");
          setStreaming(false);
        },
        onError: (message) => {
          setError(message);
          setStreamed("");
          setStreaming(false);
        },
      },
    );
  };

  const isEmpty = turns.length === 0 && !streaming && !streamed;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl sm:w-[26rem]"
      role="dialog"
      aria-label="오답 복습 AI 코치"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-purple" />
          복습 코치
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
        >
          <X size={16} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {isEmpty && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              이 문항을 왜 틀렸는지 같이 봐요. 아래를 눌러 바로 물어볼 수 있어요.
            </p>
            {REVIEW_TUTOR_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void send(s)}
                className="block w-full rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.role === "user"
                ? "ml-auto max-w-[85%] rounded-lg bg-primary/10 px-3 py-2"
                : "max-w-[95%] rounded-lg bg-surface-raised px-3 py-2"
            }
          >
            {/* 학생이 쓴 말은 평문 그대로 둔다 — `$100` 같은 표기를 우리가 수식으로
                해석해 버리면 학생이 친 글자가 다르게 보인다. */}
            {t.role === "user" ? (
              <p className="whitespace-pre-wrap leading-relaxed">{t.text}</p>
            ) : (
              <TutorAnswer text={t.text} />
            )}
          </div>
        ))}

        {streamed && (
          <div className="max-w-[95%] rounded-lg bg-surface-raised px-3 py-2">
            <TutorAnswer text={streamed} streaming />
          </div>
        )}
        {streaming && !streamed && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> 생각하는 중…
          </div>
        )}
        {error && <p className="rounded-lg bg-wrong/10 px-3 py-2 text-xs text-wrong">{error}</p>}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="이 문항에 대해 물어보세요"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          aria-label="보내기"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </form>
    </aside>
  );
}
