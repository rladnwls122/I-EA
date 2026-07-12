"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Check, PencilLine, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubjectTree, useGenerationPolling, useCreateWorkbook, useCreateAiGeneration, useAddQuestionToWorkbook } from "@/lib/hooks";
import type { Subject } from "@/lib/types";

/** 선택 pill 공통 스타일 — 선택 시 emerald, 미선택 시 hairline. */
const pillBase =
  "rounded-lg border px-4 py-2.5 text-sm transition-colors duration-150 motion-reduce:transition-none";
const pillOn = "border-transparent bg-primary font-medium text-primary-foreground";
const pillOff =
  "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground";

export function WorkbookBuilder() {
  const router = useRouter();

  /* ── API 데이터 ── */
  const { data: subjectTree, isLoading: subjectsLoading } = useSubjectTree();
  const createWorkbook = useCreateWorkbook();
  const createAiGen = useCreateAiGeneration();
  const addQuestionToWorkbook = useAddQuestionToWorkbook();

  /* ── 과목 선택 (다중) ── */
  const [examType, setExamType] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>([]);

  /* ── AI 트랙 조건(문항별로 지정 — 상세조건 스텝을 없애고 여기로 옮김) ── */
  const [questionType, setQuestionType] = useState<"객관식" | "주관식">("객관식");
  const [difficulty, setDifficulty] = useState(3);
  const [includePassage, setIncludePassage] = useState(false);

  /* ── 문제집 자동 생성 + 2-트랙 ── */
  const [createdWorkbookId, setCreatedWorkbookId] = useState<string | null>(null);
  const [creatingWorkbook, setCreatingWorkbook] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiCount, setAiCount] = useState(5);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [linkedGenerationId, setLinkedGenerationId] = useState<string | null>(null);

  /* ── AI 폴링 ── */
  const { data: generation } = useGenerationPolling(generationId);
  const isGenerating = generationId !== null && generation?.status === "PENDING";
  const isCompleted = generation?.status === "COMPLETED";
  const isFailed = generation?.status === "FAILED";

  /* ── 파생 데이터 ── */
  const examTypes = subjectTree ? Object.keys(subjectTree) : [];
  const categories = (examType && subjectTree) ? Object.keys(subjectTree[examType] ?? {}) : [];
  const subjects = (examType && category && subjectTree) ? subjectTree[examType]?.[category] ?? [] : [];
  const canProceed = selectedSubjects.length > 0;

  /* ── 이벤트 핸들러 ── */
  const handleExamTypeChange = useCallback((type: string) => {
    setExamType(type);
    setCategory("");
    setSelectedSubjects([]);
  }, []);

  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    setSelectedSubjects([]);
  }, []);

  const toggleSubject = useCallback((s: Subject) => {
    setSelectedSubjects((prev) =>
      prev.some((p) => p.id === s.id) ? prev.filter((p) => p.id !== s.id) : [...prev, s],
    );
  }, []);

  /** 과목 선택 즉시 문제집을 조용히 만들고 바로 AI/에디터 선택 화면으로 넘어간다 — 제목/설명/공개 여부를 먼저 채우게 하지 않는다. */
  const handleProceed = async () => {
    if (!canProceed || creatingWorkbook) return;
    setCreatingWorkbook(true);
    try {
      const title = `${examType} ${category} ${selectedSubjects.map((s) => s.name).join("·")} 문제집`;
      const wb = await createWorkbook.mutateAsync({ title, visibility: "PRIVATE" });
      setCreatedWorkbookId(wb.id);
    } catch (e) {
      console.error("문제집 생성 실패:", e);
      toast.error(e instanceof Error ? e.message : "문제집 생성에 실패했습니다.");
    } finally {
      setCreatingWorkbook(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!selectedSubjects.length || !createdWorkbookId) return;
    try {
      // AI 생성은 문항당 세부과목 하나만 받는다 — 다중 선택 시 첫 과목 기준으로 요청.
      const gen = await createAiGen.mutateAsync({
        subjectId: selectedSubjects[0].id,
        prompt: aiTopic,
        difficulty,
        questionCount: aiCount,
        questionType,
        includePassage,
      });
      setGenerationId(gen.id);
    } catch (e) {
      console.error("AI 생성 요청 실패:", e);
      toast.error(e instanceof Error ? e.message : "AI 생성 요청에 실패했습니다.");
    }
  };

  /* ── 초기 로딩: examType 자동 선택 ── */
  useEffect(() => {
    if (subjectTree && !examType && examTypes.length > 0) {
      setExamType(examTypes[0]);
    }
  }, [subjectTree, examType, examTypes]);

  /* ── AI 생성 완료 시 생성된 문항을 문제집에 자동 연결 (generationId당 1회) ── */
  useEffect(() => {
    if (
      !isCompleted ||
      !createdWorkbookId ||
      !generationId ||
      linkedGenerationId === generationId ||
      !generation?.questions?.length
    ) {
      return;
    }
    setLinkedGenerationId(generationId);
    generation.questions.forEach((q) => {
      addQuestionToWorkbook.mutate({
        workbookId: createdWorkbookId,
        questionId: q.id,
      });
    });
  }, [isCompleted, createdWorkbookId, generationId, linkedGenerationId, generation, addQuestionToWorkbook]);

  return (
    <div className="mx-auto max-w-[980px] px-8 py-8">
      {/* ── 헤더 ── */}
      <div className="mb-10">
        <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Create workbook
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">문제집 만들기</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          과목을 고르면 바로 AI 생성이나 직접 출제로 넘어갑니다.
        </p>
      </div>

      {/* ── 스테퍼(2단계로 축소 — 제목/설명 폼은 없앴다) ── */}
      <div className="mb-10 flex items-center justify-center gap-3 text-sm">
        <span className={`flex items-center gap-2 ${!createdWorkbookId ? "font-medium text-foreground" : "text-primary"}`}>
          {createdWorkbookId ? (
            <Check size={16} strokeWidth={2} className="text-primary" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-primary font-mono text-xs text-primary-foreground">1</span>
          )}
          과목 선택
        </span>
        <div className="h-px w-10 bg-border" />
        <span className={`flex items-center gap-2 ${createdWorkbookId ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-xs ${createdWorkbookId ? "border-border bg-primary text-primary-foreground" : "border-border bg-surface-raised text-muted-foreground"}`}>2</span>
          생성 방식
        </span>
      </div>

      {/* ── Step 1: 과목 선택 (다중) → 선택 즉시 문제집 생성 후 2단계로 ── */}
      {!createdWorkbookId && (
        <section className="rounded-xl border border-border bg-card p-8">
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-primary">Step 1</span>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">어떤 시험을 준비하고 있나요?</h2>
          <p className="mt-1 text-sm text-muted-foreground">소과목은 여러 개 고를 수 있어요.</p>

          {subjectsLoading ? (
            <div className="mt-6 space-y-4">
              <Skeleton className="h-10 w-32 border border-border bg-surface-raised" />
              <Skeleton className="h-10 w-full border border-border bg-surface-raised" />
              <Skeleton className="h-10 w-3/4 border border-border bg-surface-raised" />
            </div>
          ) : (
            <>
              {/* 시험 카테고리 */}
              <div className="mt-6 flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground/80">시험 카테고리</label>
                <div className="flex flex-wrap gap-2">
                  {examTypes.map((type) => (
                    <button key={type} onClick={() => handleExamTypeChange(type)}
                      className={`${pillBase} ${examType === type ? pillOn : pillOff}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* 대분류 */}
              {examType && (
                <div className="mt-5 flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground/80">대분류</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => handleCategoryChange(cat)}
                        className={`${pillBase} ${category === cat ? pillOn : pillOff}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 소과목 — 다중 선택 */}
              {category && (
                <div className="mt-5 flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground/80">소과목 (여러 개 선택 가능)</label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <button key={s.id} onClick={() => toggleSubject(s)}
                        aria-pressed={selectedSubjects.some((p) => p.id === s.id)}
                        className={`${pillBase} ${selectedSubjects.some((p) => p.id === s.id) ? pillOn : pillOff}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-8 flex justify-end">
            <Button size="lg" disabled={!canProceed || creatingWorkbook} onClick={handleProceed}>
              {creatingWorkbook ? <Loader2 size={16} className="animate-spin" /> : null}
              다음 <ArrowRight size={18} strokeWidth={2} />
            </Button>
          </div>
        </section>
      )}

      {/* ── Step 2: 2-Track 선택 (POST /ai-generations 연동) ── */}
      {createdWorkbookId && (
        <section className="mt-2">
          <div className="mb-5">
            <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {examType} · {category} · {selectedSubjects.map((s) => s.name).join(", ")}
            </span>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">어떻게 문제집을 채울까요?</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* AI 트랙 */}
            <div className="flex min-h-[320px] flex-col items-start rounded-xl border border-primary/30 bg-card p-7">
              <Sparkles className="text-primary" size={28} strokeWidth={2} />
              <h3 className="mb-2 mt-6 text-xl font-semibold">AI와 대화하며 만들기</h3>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                주제와 출제 의도를 말하면 AI가 문항 초안을 제안합니다.
              </p>
              <div className="mb-4 w-full space-y-3">
                <textarea value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="예: 현대시 화자의 태도를 묻는 상 난이도 문항" rows={2}
                  className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring" />

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">유형</label>
                  {(["객관식", "주관식"] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setQuestionType(t)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${questionType === t ? pillOn : pillOff}`}>
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">난이도</label>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button key={d} type="button" onClick={() => setDifficulty(d)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs tabular-nums transition-colors ${difficulty === d ? pillOn : pillOff}`}>
                      {d}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-muted-foreground">문항 수</label>
                  <Input type="number" min={1} max={20} value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="h-9 w-20 font-mono tabular-nums" />
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={includePassage}
                    onChange={(e) => setIncludePassage(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                  지문(본문)도 함께 생성
                </label>
              </div>
              <Button onClick={handleAiGenerate} disabled={isGenerating || !aiTopic.trim() || createAiGen.isPending}
                className="mt-auto">
                {isGenerating || createAiGen.isPending ? <Loader2 size={16} className="animate-spin" /> : <Bot size={18} strokeWidth={2} />}
                {isGenerating ? "생성 중..." : "AI 대화 시작"}
              </Button>
            </div>

            {/* 직접 출제 트랙 */}
            <div className="flex min-h-[320px] flex-col items-start rounded-xl border border-border bg-card p-7">
              <PencilLine className="text-primary" size={28} strokeWidth={2} />
              <h3 className="mb-2 mt-6 text-xl font-semibold">직접 문항 만들기</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">빈 문항부터 시작해 지문, 선지, 해설을 자유롭게 작성합니다.</p>
              <Button asChild variant="outline" className="mt-auto">
                <Link href={`/studio/editor?workbookId=${createdWorkbookId}`}>
                  에디터 열기 <ArrowRight size={18} strokeWidth={2} />
                </Link>
              </Button>
            </div>
          </div>

          {/* AI 생성 대기: 스켈레톤 카드 (3초 폴링) */}
          {isGenerating && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{aiCount}</span>개의 문항을 생성하고 있어요...
              </p>
              {Array.from({ length: aiCount }).map((_, i) => (
                <div key={i} className="relative overflow-hidden rounded-xl border border-border bg-surface-raised p-5"
                  style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Skeleton className="h-10 rounded-lg" />
                      <Skeleton className="h-10 rounded-lg" />
                    </div>
                  </div>
                  <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                </div>
              ))}
            </div>
          )}

          {/* AI 생성 완료 */}
          {isCompleted && generation?.questions && (
            <div className="mt-6">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                <Check size={16} strokeWidth={2} />
                <span className="font-mono tabular-nums">{generation.questions.length}</span>개 문항이 생성되어 문제집에 추가되었습니다.
              </p>
              <div className="space-y-3">
                {generation.questions.map((q, i) => (
                  <div key={q.id} className="rounded-xl border border-border bg-card p-5 transition-colors duration-150 hover:border-primary/40 motion-reduce:transition-none"
                    style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        <span className="font-mono tabular-nums">문항 {i + 1}</span> · {q.questionType}
                      </span>
                      <Link href={`/studio/editor?questionId=${q.id}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                        <PencilLine size={13} strokeWidth={2} /> 정밀 편집
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="mt-5" onClick={() => router.push(`/workbook/mine`)}>
                문제집으로 이동 <ArrowRight size={18} strokeWidth={2} />
              </Button>
            </div>
          )}

          {/* AI 생성 실패 */}
          {isFailed && (
            <div className="mt-6 rounded-xl border border-wrong/30 bg-wrong/10 p-4">
              <p className="text-sm font-medium text-wrong">
                문항 생성에 실패했습니다. 모델이 유효한 문항을 반환하지 못했어요 — 출제 지시를 조금 더 구체적으로 써보거나 다시 시도해주세요.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
