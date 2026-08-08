"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { fetchWorkbook, fetchQuestion } from "@/lib/api";
import type { Question, Workbook } from "@/lib/types";
import { RichContent } from "@/components/editor/RichContent";

/** 객관식 선지 번호 표기 — 한국 시험지 관행(최대 8지). */
const CHOICE_MARKERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

/**
 * 문제집 시험지 인쇄 뷰(벤치마킹: 족보닷컴 족보클라우드의 문제지 인쇄).
 * 종이 시험이 여전히 내신·학원 운영의 기본 매체다 — 브라우저 인쇄(@media print)로 시작하고
 * PDF 저장은 브라우저의 "PDF로 저장"에 맡긴다(서버 PDF 렌더링은 유지 비용 대비 이득이 없다).
 *
 * 문제집 상세 API는 발문까지만 내려주므로(선지·지문 없음) 문항 본문은 개별 조회로 합성한다.
 * 정답·해설지는 별도 페이지(break-before-page)로 분리 — 교사가 문항지만 배포할 수 있게
 * 토글(기본 꺼짐)로 둔다. 응시 중 마스킹된 문항은 정답이 null로 와 정답지에 "비공개"로 남는다.
 */
export default function WorkbookPrintPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [failedCount, setFailedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withAnswers, setWithAnswers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wb = await fetchWorkbook(id);
        // 문항 본문 합성 — 삭제·비공개 문항은 건너뛰고 개수만 알린다(전체 실패로 만들지 않는다).
        // 대형 문제집에서 수십 건을 동시 발사하면 레이트리밋·브라우저 연결 한도에 걸리므로
        // 청크(8건) 단위로 동시성을 제한한다.
        const ordered = (wb.questions ?? [])
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder);
        const results: PromiseSettledResult<Question>[] = [];
        const CHUNK = 8;
        for (let start = 0; start < ordered.length; start += CHUNK) {
          if (cancelled) return;
          results.push(
            ...(await Promise.allSettled(
              ordered.slice(start, start + CHUNK).map((wq) => fetchQuestion(wq.questionId)),
            )),
          );
        }
        if (cancelled) return;
        setWorkbook(wb);
        setQuestions(
          results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])),
        );
        setFailedCount(results.filter((r) => r.status === "rejected").length);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "문제집을 불러오지 못했어요.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" /> 시험지를 준비하고 있어요…
      </div>
    );
  }

  if (error || !workbook) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">시험지를 만들 수 없어요.</p>
        <p className="text-xs text-muted-foreground">{error ?? "문제집을 찾을 수 없습니다."}</p>
      </div>
    );
  }

  // 같은 지문을 공유하는 연속 문항은 지문을 첫 등장에서 한 번만 인쇄한다.
  const printedPassages = new Set<string>();

  return (
    <div className="mx-auto max-w-[720px] p-6 print:max-w-none print:p-0 print:text-black">
      {/* 화면 전용 툴바 — 종이에는 남지 않는다 */}
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={15} />
        </button>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={withAnswers}
            onChange={(e) => setWithAnswers(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          정답·해설지 포함
        </label>
        {failedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            문항 {failedCount}개를 불러오지 못해 제외했어요.
          </span>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors duration-150 ease-swift hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Printer size={15} /> 인쇄하기
        </button>
      </div>

      {/* 시험지 헤더 */}
      <header className="mb-6 border-b-2 border-foreground pb-3 print:border-black">
        <h1 className="text-xl font-bold tracking-tight">{workbook.title}</h1>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground print:text-black">
          <span>{questions.length}문항</span>
          <span className="tracking-widest">이름: ______________</span>
        </div>
      </header>

      {/* 문항지 */}
      <ol className="flex flex-col gap-7">
        {questions.map((q, i) => {
          const passages = q.passages?.length
            ? q.passages
            : q.passage
              ? [q.passage]
              : [];
          const showPassages = passages.filter((p) => {
            if (!p?.id) return true;
            if (printedPassages.has(p.id)) return false;
            printedPassages.add(p.id);
            return true;
          });
          const choices: { id: string; content: unknown }[] = Array.isArray(q.choices)
            ? q.choices
            : [];
          return (
            <li key={q.id} className="break-inside-avoid">
              {showPassages.map((p, pi) => (
                <div
                  key={p.id ?? pi}
                  className="mb-3 rounded border border-border p-3 text-[13px] leading-relaxed print:rounded-none print:border-black"
                >
                  <RichContent value={p.content} />
                </div>
              ))}
              <div className="flex gap-2 text-[14px] leading-relaxed">
                <span className="flex-none font-semibold">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <RichContent value={q.stem} />
                  {choices.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {choices.map((c, ci) => (
                        <li key={c.id ?? ci} className="flex gap-1.5">
                          <span className="flex-none">{CHOICE_MARKERS[ci] ?? `(${ci + 1})`}</span>
                          <div className="min-w-0 flex-1">
                            <RichContent value={c.content} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.questionType === "주관식" && (
                    <p className="mt-3 text-muted-foreground print:text-black">
                      답: ______________________________
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 정답·해설지 — 새 페이지에서 시작(문항지만 잘라 배포할 수 있게) */}
      {withAnswers && (
        <section className="mt-10 break-before-page">
          <h2 className="mb-4 border-b-2 border-foreground pb-2 text-lg font-bold print:border-black">
            정답 및 해설
          </h2>
          <ol className="flex flex-col gap-4">
            {questions.map((q, i) => {
              const choices: { isCorrect?: boolean }[] = Array.isArray(q.choices) ? q.choices : [];
              const correctMarkers = choices
                .map((c, ci) => (c.isCorrect === true ? (CHOICE_MARKERS[ci] ?? `(${ci + 1})`) : null))
                .filter(Boolean);
              // 응시 중 마스킹된 문항은 유형과 무관하게 정답류가 전부 null로 온다 —
              // 주관식을 "서술형"으로 잘못 표기하지 않도록 마스킹 여부를 먼저 본다.
              const answerLabel = q.maskedForActiveSession
                ? "비공개(응시 중)"
                : q.questionType === "객관식"
                  ? correctMarkers.length > 0
                    ? correctMarkers.join(", ")
                    : "비공개"
                  : (q.correctAnswerText ??
                    (q.rubric?.length ? "서술형 — 채점기준표 참조" : "서술형"));
              return (
                <li key={q.id} className="break-inside-avoid text-[13px] leading-relaxed">
                  <p>
                    <span className="font-semibold">{i + 1}.</span>{" "}
                    <span className="font-semibold">{answerLabel}</span>
                  </p>
                  {q.explanation != null && (
                    <div className="mt-1 text-muted-foreground print:text-black">
                      <RichContent value={q.explanation} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
