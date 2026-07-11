"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useSubjects, useQuestions } from "@/lib/hooks";
import { extractPlainText } from "@/lib/prosemirror";
import { QuestionPreview } from "@/components/questions/QuestionPreview";
import type { Question, Subject } from "@/lib/types";

/** 필터 칩 공통 스타일 — 호버 시 테두리 강조+색 반전(스펙 4 마이크로 인터랙션). */
const chip = (active: boolean) =>
  `whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-all duration-300 ${
    active
      ? "border-transparent bg-primary font-medium text-primary-foreground"
      : "border-border text-muted-foreground hover:border-primary/60 hover:bg-primary/10 hover:text-foreground"
  }`;

/**
 * 스포트라이트 검색 게이트 — 검색바 포커스 시 전면 블러 + 중앙 패널.
 * 다단계 필터: 시험(examType) → 대분류(examCategory) → 소분류(subject).
 * 대분류 확정 시 나머지는 페이드아웃, 선택은 왼쪽 고정 + 우측에 소분류 전개.
 */
export function SpotlightSearch({
  open: openProp,
  onOpenChange,
}: {
  /** 외부(예: "문제집 둘러보기" 버튼)에서 열도록 제어하고 싶을 때만 전달 — 없으면 내부 상태로 자체 관리. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const [keyword, setKeyword] = useState("");
  const [examType, setExamType] = useState("");
  const [category, setCategory] = useState(""); // 확정된 대분류 (Step 3 진입)
  const [subjectIds, setSubjectIds] = useState<string[]>([]); // 소분류 다중 선택
  const [selected, setSelected] = useState<Question | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: subjects } = useSubjects();
  const list: Subject[] = subjects || [];

  const examTypes = useMemo(() => Array.from(new Set(list.map((s) => s.examType))), [list]);
  const categories = useMemo(
    () =>
      examType
        ? Array.from(new Set(list.filter((s) => s.examType === examType).map((s) => s.examCategory)))
        : [],
    [list, examType],
  );
  const leafSubjects = useMemo(
    () =>
      examType && category
        ? list.filter((s) => s.examType === examType && s.examCategory === category)
        : [],
    [list, examType, category],
  );

  // 검색/필터 결과 — 열려 있고 조건이 하나라도 있어야 조회
  const hasCriteria = open && (keyword.trim().length > 0 || subjectIds.length > 0);
  const { data: results, isLoading } = useQuestions(
    { search: keyword.trim() || undefined, subjectIds: subjectIds.length ? subjectIds : undefined, limit: 12 },
    hasCriteria,
  );
  const questions = hasCriteria ? results?.items || [] : [];

  // 열릴 때 input 자동 포커스, ESC로 닫기
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const resetFilter = () => {
    setExamType("");
    setCategory("");
    setSubjectIds([]);
  };

  const toggleSubject = (id: string) => {
    setSubjectIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  return (
    <>
      {/* 트리거 검색바 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-left transition-all duration-300 hover:border-primary/60"
      >
        <Search size={16} className="text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          문제 검색 — 시험·과목으로 좁혀서 찾아보세요
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="mx-auto mt-[8vh] w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 검색 입력 */}
            <div className="relative mb-4">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={inputRef}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="문제 키워드 검색"
                className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-sm text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={15} />
              </button>
            </div>

            {/* Step 1: 시험 */}
            <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
              {examTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setExamType(t === examType ? "" : t);
                    setCategory("");
                    setSubjectIds([]);
                  }}
                  className={chip(examType === t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Step 2/3: 대분류 → 확정 시 나머지 페이드아웃 + 소분류 전개 */}
            {examType && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
                {categories.map((c) =>
                  category && category !== c ? (
                    // 선택 안 된 대분류 — 페이드아웃 후 자리 제거
                    <span
                      key={c}
                      className="hidden"
                      aria-hidden
                    />
                  ) : (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(category === c ? "" : c);
                        setSubjectIds([]);
                      }}
                      className={`${chip(category === c)} ${
                        category === c ? "order-first" : ""
                      } animate-in fade-in duration-300`}
                    >
                      {c}
                    </button>
                  ),
                )}
                {/* 확정된 대분류 우측에 소분류 전개 — 다중 선택 */}
                {category &&
                  leafSubjects.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSubject(s.id)}
                      aria-pressed={subjectIds.includes(s.id)}
                      className={`${chip(subjectIds.includes(s.id))} animate-in fade-in slide-in-from-left-2 duration-300`}
                    >
                      {s.name}
                    </button>
                  ))}
                {/* 필터 취소 — 리스트 마지막 상시 배치(빨강) */}
                {category && (
                  <button
                    type="button"
                    onClick={resetFilter}
                    className="whitespace-nowrap rounded-full border border-wrong/40 bg-wrong/10 px-3.5 py-1.5 text-sm text-wrong transition-all duration-300 hover:bg-wrong hover:text-white"
                  >
                    카테고리 취소
                  </button>
                )}
              </div>
            )}

            {/* 결과 — stem 전체 노출(생략 없음), 클릭 시 미리보기 슬라이드오버 */}
            <div className="max-h-[46vh] space-y-2 overflow-y-auto">
              {!hasCriteria ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  키워드를 입력하거나 과목을 골라보세요.
                </p>
              ) : isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-raised" />
                  ))}
                </div>
              ) : questions.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  조건에 맞는 문제가 없어요.
                </p>
              ) : (
                questions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelected(q)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    {/* 스펙: 미리보기는 stem 생략 없이 전체 노출 + extractPlainText 방어 */}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {extractPlainText(q.stem)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {q.subject?.name ?? ""} · {q.questionType} · 난이도 {q.difficulty}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <QuestionPreview question={selected} onClose={() => setSelected(null)} />
    </>
  );
}
