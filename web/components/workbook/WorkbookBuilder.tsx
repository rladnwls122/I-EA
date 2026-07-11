"use client";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bot, Check, PencilLine, Sparkles, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubjectTree, useGenerationPolling, useCreateWorkbook, useCreateAiGeneration, useAddQuestionToWorkbook } from "@/lib/hooks";
import type { Subject } from "@/lib/types";

export function WorkbookBuilder() {
  const router = useRouter();

  /* ── API 데이터 ── */
  const { data: subjectTree, isLoading: subjectsLoading } = useSubjectTree();
  const createWorkbook = useCreateWorkbook();
  const createAiGen = useCreateAiGeneration();
  const addQuestionToWorkbook = useAddQuestionToWorkbook();

  /* ── Step & Selection State ── */
  const [step, setStep] = useState<1 | 2>(1);
  const [examType, setExamType] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  /* ── Step 2: Options ── */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "PUBLIC">("PRIVATE");
  const [questionType, setQuestionType] = useState<"객관식" | "주관식">("객관식");
  const [difficulty, setDifficulty] = useState(3);

  /* ── Track Selection & AI ── */
  const [showTracks, setShowTracks] = useState(false);
  const [createdWorkbookId, setCreatedWorkbookId] = useState<string | null>(null);
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
  const canProceed = !!selectedSubject;

  /* ── 이벤트 핸들러 ── */
  const handleExamTypeChange = useCallback((type: string) => {
    setExamType(type);
    setCategory("");
    setSelectedSubject(null);
  }, []);

  const handleCategoryChange = useCallback((cat: string) => {
    setCategory(cat);
    setSelectedSubject(null);
  }, []);

  const handleCreateAndShowTracks = async () => {
    try {
      const wb = await createWorkbook.mutateAsync({
        title,
        description: description || undefined,
        visibility,
      });
      setCreatedWorkbookId(wb.id);
      setShowTracks(true);
    } catch (e) {
      console.error("문제집 생성 실패:", e);
    }
  };

  const handleAiGenerate = async () => {
    if (!selectedSubject || !createdWorkbookId) return;
    try {
      const gen = await createAiGen.mutateAsync({
        subjectId: selectedSubject.id,
        prompt: aiTopic,
        difficulty,
        questionCount: aiCount,
        questionType,
      });
      setGenerationId(gen.id);
    } catch (e) {
      console.error("AI 생성 요청 실패:", e);
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
    <div className="max-w-[980px] mx-auto px-8 py-8">
      {/* ── 헤더 ── */}
      <div className="mb-10">
        <span className="inline-block bg-surface-raised border-2 border-border text-foreground px-3 py-1 rounded-md text-[12px] font-black tracking-widest uppercase mb-4">Create Workbook</span>
        <h1 className="text-4xl font-black tracking-tighter mt-2">문제집 만들기</h1>
        <p className="text-muted-foreground mt-2 font-bold">과목을 선택하고, 조건을 설정한 뒤 문제집을 생성하세요.</p>
      </div>

      {/* ── 스테퍼 ── */}
      <div className="flex items-center justify-center gap-3 mb-10 text-sm">
        <span className={`flex items-center gap-2 ${step === 1 ? "text-foreground font-black" : "text-primary"}`}>
          {step > 1 ? <Check size={16} strokeWidth={3} className="text-primary" /> : <span className="w-7 h-7 rounded-xl bg-primary text-black text-xs flex items-center justify-center font-black border-2 border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)]">1</span>}
          기본 정보
        </span>
        <div className="w-10 h-[3px] bg-border rounded-full" />
        <span className={`flex items-center gap-2 ${step === 2 ? "text-foreground font-black" : "text-muted-foreground"}`}>
          {showTracks ? <Check size={16} strokeWidth={3} className="text-primary" /> : <span className={`w-7 h-7 rounded-xl text-xs flex items-center justify-center font-black border-2 ${step === 2 ? "bg-primary text-black border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)]" : "bg-surface-raised text-muted-foreground border-border"}`}>2</span>}
          상세 조건
        </span>
        <div className="w-10 h-[3px] bg-border rounded-full" />
        <span className="flex items-center gap-2 text-muted-foreground">
          <span className="w-7 h-7 rounded-xl bg-surface-raised text-muted-foreground text-xs flex items-center justify-center font-black border-2 border-border">3</span>
          문제집 생성
        </span>
      </div>

      {/* ── Step 1: 과목 선택 (GET /subjects 연동) ── */}
      {step === 1 && (
        <section className="bg-card border-2 border-border rounded-2xl p-8 shadow-neo-sm">
          <span className="inline-block bg-primary text-black px-3 py-1 rounded-md text-[12px] font-black tracking-widest uppercase border-2 border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)] mb-2">Step 1</span>
          <h2 className="text-2xl font-black tracking-tight mt-3">어떤 시험을 준비하고 있나요?</h2>
          <p className="text-muted-foreground text-sm mt-1 font-bold">문제집에 맞는 과목 범위를 먼저 정해주세요.</p>

          {subjectsLoading ? (
            <div className="mt-6 space-y-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-3/4" />
            </div>
          ) : (
            <>
              {/* 시험 카테고리 */}
              <div className="mt-6">
                <label className="block text-sm font-black text-foreground/80 mb-3">시험 카테고리</label>
                <div className="flex flex-wrap gap-2">
                  {examTypes.map((type) => (
                    <button key={type} onClick={() => handleExamTypeChange(type)}
                      className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black transition-all active:translate-y-[2px] active:shadow-none ${examType === type ? "border-black bg-primary text-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" : "border-border bg-card text-muted-foreground hover:border-primary hover:-translate-y-0.5 shadow-neo-sm"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* 대분류 */}
              {examType && (
                <div className="mt-5">
                  <label className="block text-sm font-black text-foreground/80 mb-3">대분류</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => handleCategoryChange(cat)}
                        className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors duration-150 ${category === cat ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-surface-raised"}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 소과목 */}
              {category && (
                <div className="mt-5">
                  <label className="block text-sm font-black text-foreground/80 mb-3">소과목</label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <button key={s.id} onClick={() => setSelectedSubject(s)}
                        className={`px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors duration-150 ${selectedSubject?.id === s.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-surface-raised"}`}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-8">
            <button disabled={!canProceed} onClick={() => setStep(2)}
              className="flex items-center gap-2 bg-primary text-black px-6 py-3 rounded-xl font-black text-sm border-2 border-black shadow-[0_4px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40 disabled:pointer-events-none">
              상세 조건 설정 <ArrowRight size={18} strokeWidth={3} />
            </button>
          </div>
        </section>
      )}

      {/* ── Step 2: 상세 조건 (POST /workbooks 연동) ── */}
      {step === 2 && !showTracks && (
        <section className="bg-card border-2 border-border rounded-2xl p-8 shadow-neo-sm">
          <span className="inline-block bg-primary text-black px-3 py-1 rounded-md text-[12px] font-black tracking-widest uppercase border-2 border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)] mb-2">Step 2</span>
          <h2 className="text-2xl font-black tracking-tight mt-3">문항의 결을 맞춰볼까요?</h2>
          <p className="text-muted-foreground text-sm mt-1 font-bold">
            {examType} · {category} · {selectedSubject?.name} 기준으로 생성됩니다.
          </p>

          {/* 제목 */}
          <div className="mt-6">
            <label className="block text-sm font-black text-foreground/80 mb-2">문제집 제목</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 2026 수능 국어 문학 실전 모의"
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none transition-all focus:border-primary shadow-neo-sm" />
          </div>

          {/* 설명 */}
          <div className="mt-4">
            <label className="block text-sm font-black text-foreground/80 mb-2">설명 (선택)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="문제집에 대한 간단한 설명을 입력하세요."
              className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none resize-none transition-all focus:border-primary shadow-neo-sm" />
          </div>

          {/* 공개 설정 */}
          <div className="mt-4">
            <label className="block text-sm font-black text-foreground/80 mb-3">공개 설정</label>
            <div className="flex gap-2">
              {(["PRIVATE", "PUBLIC"] as const).map((v) => (
                <button key={v} onClick={() => setVisibility(v)}
                  className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black transition-all active:translate-y-[2px] active:shadow-none ${visibility === v ? "border-black bg-primary text-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" : "border-border bg-card text-muted-foreground hover:border-primary shadow-neo-sm"}`}>
                  {v === "PRIVATE" ? "비공개" : "공개"}
                </button>
              ))}
            </div>
          </div>

          {/* 문항 유형 */}
          <div className="mt-4">
            <label className="block text-sm font-black text-foreground/80 mb-3">문항 유형</label>
            <div className="flex gap-2">
              {(["객관식", "주관식"] as const).map((t) => (
                <button key={t} onClick={() => setQuestionType(t)}
                  className={`px-4 py-2.5 rounded-xl border-2 text-sm font-black transition-all active:translate-y-[2px] active:shadow-none ${questionType === t ? "border-black bg-primary text-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" : "border-border bg-card text-muted-foreground hover:border-primary shadow-neo-sm"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 난이도 */}
          <div className="mt-4">
            <label className="block text-sm font-black text-foreground/80 mb-3">난이도</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button key={d} onClick={() => setDifficulty(d)}
                  className={`w-11 h-11 rounded-xl border-2 text-sm font-black transition-all active:translate-y-[2px] active:shadow-none ${difficulty === d ? "border-black bg-primary text-black shadow-[0_3px_0_0_rgba(255,255,255,0.2)]" : "border-border bg-card text-muted-foreground hover:border-primary shadow-neo-sm"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between mt-8">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-2 border-2 border-border text-foreground px-5 py-3 rounded-xl font-black text-sm shadow-neo-sm hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all">
              이전
            </button>
            <button disabled={!title.trim() || createWorkbook.isPending} onClick={handleCreateAndShowTracks}
              className="flex items-center gap-2 bg-primary text-black px-6 py-3 rounded-xl font-black text-sm border-2 border-black shadow-[0_4px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40 disabled:pointer-events-none">
              {createWorkbook.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              문제집 생성 <ArrowRight size={18} strokeWidth={3} />
            </button>
          </div>
        </section>
      )}

      {/* ── 2-Track 선택 (POST /ai-generations 연동) ── */}
      {showTracks && (
        <section className="mt-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="inline-block bg-correct text-black px-3 py-1 rounded-md text-[12px] font-black tracking-widest uppercase border-2 border-black shadow-[0_2px_0_0_rgba(255,255,255,0.2)]">Ready</span>
              <h2 className="text-xl font-black tracking-tight mt-2">문제집을 만들 준비가 됐어요.</h2>
            </div>
            <button onClick={() => setShowTracks(false)}
              className="border-2 border-border text-foreground px-4 py-2.5 rounded-xl text-sm font-black shadow-neo-sm hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all">
              조건 수정
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI 트랙 */}
            <div className="flex flex-col items-start p-7 bg-purple text-black border-2 border-black rounded-2xl shadow-[0_6px_0_0_rgba(255,255,255,0.2)] min-h-[260px]">
              <Sparkles className="text-black" size={28} strokeWidth={2.5} />
              <h3 className="text-xl font-black mt-6 mb-2">AI와 대화하며 만들기</h3>
              <p className="text-black/70 text-sm font-bold leading-relaxed mb-4">
                주제와 출제 의도를 말하면 AI가 문항 초안을 제안합니다.
              </p>
              <div className="w-full space-y-3 mb-4">
                <textarea value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="예: 현대시 화자의 태도를 묻는 상 난이도 문항" rows={2}
                  className="w-full bg-black/10 border-2 border-black/30 rounded-xl px-3 py-2.5 text-sm font-bold text-black placeholder:text-black/40 outline-none resize-none focus:border-black" />
                <div className="flex items-center gap-2">
                  <label className="text-xs font-black text-black/60">문항 수</label>
                  <input type="number" min={1} max={20} value={aiCount}
                    onChange={(e) => setAiCount(Number(e.target.value))}
                    className="w-16 bg-black/10 border-2 border-black/30 rounded-xl px-2 py-1.5 text-sm font-bold text-black outline-none focus:border-black" />
                </div>
              </div>
              <button onClick={handleAiGenerate} disabled={isGenerating || !aiTopic.trim() || createAiGen.isPending}
                className="mt-auto flex items-center gap-2 bg-black text-purple px-5 py-3 rounded-xl font-black text-sm border-2 border-black shadow-[0_3px_0_0_rgba(255,255,255,0.3)] hover:-translate-y-0.5 active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-40">
                {isGenerating || createAiGen.isPending ? <Loader2 size={16} className="animate-spin" /> : <Bot size={18} strokeWidth={2.5} />}
                {isGenerating ? "생성 중..." : "AI 대화 시작"}
              </button>
            </div>

            {/* 직접 출제 트랙 */}
            <div className="flex flex-col items-start p-7 bg-card border-2 border-border rounded-2xl shadow-neo min-h-[260px]">
              <PencilLine className="text-primary" size={28} strokeWidth={2.5} />
              <h3 className="text-xl font-black mt-6 mb-2">직접 문항 만들기</h3>
              <p className="text-muted-foreground text-sm font-bold leading-relaxed">빈 문항부터 시작해 지문, 선지, 해설을 자유롭게 작성합니다.</p>
              <Link href={`/studio/editor${createdWorkbookId ? `?workbookId=${createdWorkbookId}` : ""}`}
                className="mt-auto flex items-center gap-2 border-2 border-border text-foreground px-5 py-3 rounded-xl font-black text-sm shadow-neo-sm hover:-translate-y-0.5 hover:border-primary active:translate-y-[2px] active:shadow-none transition-all">
                에디터 열기 <ArrowRight size={18} strokeWidth={3} />
              </Link>
            </div>
          </div>

          {/* AI 생성 대기: 스켈레톤 카드 (3초 폴링) */}
          {isGenerating && (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-muted-foreground">{aiCount}개의 문항을 생성하고 있어요...</p>
              {Array.from({ length: aiCount }).map((_, i) => (
                <div key={i} className="relative overflow-hidden bg-card border border-border rounded-xl p-5"
                  style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                    <div className="grid grid-cols-2 gap-2 mt-3">
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
              <p className="text-sm text-correct font-semibold mb-3">
                ✓ {generation.questions.length}개 문항이 생성되어 문제집에 추가되었습니다!
              </p>
              <div className="space-y-3">
                {generation.questions.map((q, i) => (
                  <div key={q.id} className="bg-card border border-border rounded-xl p-5 transition-colors duration-150 hover:border-primary/20"
                    style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">문항 {i + 1} · {q.questionType}</span>
                      <Link href={`/studio/editor?questionId=${q.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        ✏️ 정밀 편집
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI 생성 실패 */}
          {isFailed && (
            <div className="mt-6 p-4 bg-wrong/10 border border-wrong/30 rounded-xl">
              <p className="text-sm text-wrong font-semibold">문항 생성에 실패했습니다. 다시 시도해주세요.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
