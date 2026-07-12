"use client";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useSubjectTree, useCreateWorkbook } from "@/lib/hooks";
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

  /* ── 과목 선택 (다중) ── */
  const [examType, setExamType] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [selectedSubjects, setSelectedSubjects] = useState<Subject[]>([]);

  /* ── 문제집 자동 생성 ── */
  const [createdWorkbookId, setCreatedWorkbookId] = useState<string | null>(null);
  const [creatingWorkbook, setCreatingWorkbook] = useState(false);

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

  /** 과목 선택 즉시 문제집을 조용히 만들고 바로 대화형 출제 캔버스(/edit)로 넘어간다 — 제목/설명/공개 여부를 먼저 채우게 하지 않는다. */
  const handleProceed = async () => {
    if (!canProceed || creatingWorkbook) return;
    setCreatingWorkbook(true);
    try {
      const title = `${examType} ${category} ${selectedSubjects.map((s) => s.name).join("·")} 문제집`;
      const wb = await createWorkbook.mutateAsync({ title, visibility: "PRIVATE" });
      setCreatedWorkbookId(wb.id);
      router.push(`/edit?workbookId=${wb.id}`);
    } catch (e) {
      console.error("문제집 생성 실패:", e);
      toast.error(e instanceof Error ? e.message : "문제집 생성에 실패했습니다.");
    } finally {
      setCreatingWorkbook(false);
    }
  };

  /* ── 초기 로딩: examType 자동 선택 ── */
  useEffect(() => {
    if (subjectTree && !examType && examTypes.length > 0) {
      setExamType(examTypes[0]);
    }
  }, [subjectTree, examType, examTypes]);

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
    </div>
  );
}
