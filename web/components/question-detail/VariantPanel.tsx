"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createAiGeneration, fetchAiGeneration } from "@/lib/api";
import type { Question } from "@/lib/types";

/** 202 이후 폴링 간격/횟수 — LLM 생성은 보통 수십 초라 3초 × 60회(3분)면 충분하다. */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 60;

/**
 * 유사(변형) 문항 생성 패널 — 매쓰플랫류 "쌍둥이 문제"의 생성형 대응.
 * 원본 문항 ID를 시드로 `POST /ai-generations`를 부르고, 완료까지 폴링한 뒤
 * 첫 생성 문항으로 이동한다. 생성물은 DRAFT라 문제은행에서 검수 후 발행하면 된다.
 */
export function VariantPanel({ question }: { question: Question }) {
  const router = useRouter();
  const [count, setCount] = useState(3);
  const [phase, setPhase] = useState<"idle" | "requesting" | "generating">("idle");
  // 언마운트 후 setState 방지 — 폴링이 최대 3분까지 살아 있다.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const generate = async () => {
    setPhase("requesting");
    try {
      const created = await createAiGeneration({
        subjectId: question.subjectId,
        sourceQuestionId: question.id,
        prompt: "원본 문항과 같은 개념을 다른 소재·수치로 묻는 유사(변형) 문항을 만들어줘.",
        difficulty: question.difficulty ?? 3,
        questionCount: count,
      });
      setPhase("generating");
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!alive.current) return;
        const gen = await fetchAiGeneration(created.id);
        if (gen.status === "COMPLETED") {
          const firstId = gen.questions?.[0]?.id;
          toast.success(`유사 문항 ${gen.questions?.length ?? 0}건을 생성했어요. 검수 후 발행하세요.`);
          if (firstId) router.push(`/questions/${firstId}`);
          if (alive.current) setPhase("idle");
          return;
        }
        if (gen.status === "FAILED") {
          toast.error("유사 문항 생성에 실패했어요. 잠시 후 다시 시도해 주세요.");
          if (alive.current) setPhase("idle");
          return;
        }
      }
      toast.error("생성이 오래 걸리고 있어요. 잠시 후 문제은행에서 확인해 주세요.");
      if (alive.current) setPhase("idle");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "유사 문항 생성 요청에 실패했어요.");
      if (alive.current) setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Copy size={14} className="text-primary" /> 유사 문항 생성
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            같은 개념·유형·난이도에서 소재와 수치를 바꾼 변형 문항을 AI로 만들어요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
            aria-label="생성할 문항 수"
            className="h-10 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}문항
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors duration-150 ease-swift hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {phase === "generating" ? "생성 중…" : phase === "requesting" ? "요청 중…" : "생성"}
          </button>
        </div>
      </div>
    </section>
  );
}
