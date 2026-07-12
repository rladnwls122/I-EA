"use client";
import { X } from "lucide-react";
import { useSubmitAnswer } from "@/lib/hooks";

export type OmrItem = {
  sessionQuestionId: string;
  order: number;
  questionType: string;
  choiceIds: string[]; // 객관식 선지 id 순서(라벨은 index+1)
  selectedChoiceId: string | null;
};

/**
 * 답안지(하단 토글 드로어). 두 가지를 한다:
 *  1) 번호 클릭 → 해당 문항으로 스크롤 이동
 *  2) 객관식은 ①②③… 버블을 직접 마킹 → 답 선택·저장(문제카드와 양방향 동기화)
 * 주관식은 마킹 대상이 아니라 답변/미답 상태만 표시한다.
 */
export function OmrPanel({
  open,
  onClose,
  items,
  answeredIds,
  onJump,
  onSelectChoice,
}: {
  open: boolean;
  onClose: () => void;
  items: OmrItem[];
  answeredIds: Set<string>;
  onJump: (sessionQuestionId: string) => void;
  onSelectChoice: (sessionQuestionId: string, choiceId: string) => void;
}) {
  if (!open) return null;

  return (
    <>
      {/* 배경 딤 — 드로어 밖 클릭 시 닫힘. 하단바(z-40)보다 아래(z-30)라 바는 계속 조작 가능. */}
      <div
        className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 모바일: 하단바(64px)+전역 네비(56px)를 모두 비켜 위에 뜬다. 데스크톱: 하단바(64px)만 비키면 된다. */}
      <div className="fixed inset-x-0 bottom-[7.5rem] z-30 mx-auto max-w-[960px] px-3 md:bottom-16 md:px-6">
        <div className="flex max-h-[58vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-foreground">답안지</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {answeredIds.size}/{items.length} 답변
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="답안지 닫기"
              className="flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-8 md:w-8"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-1 overflow-y-auto p-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <OmrRow
                key={it.sessionQuestionId}
                item={it}
                answered={answeredIds.has(it.sessionQuestionId)}
                onJump={() => onJump(it.sessionQuestionId)}
                onSelectChoice={(choiceId) => onSelectChoice(it.sessionQuestionId, choiceId)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// 문항 한 줄. 자체 submit 뮤테이션을 소유해 버블 클릭 즉시 저장한다.
function OmrRow({
  item,
  answered,
  onJump,
  onSelectChoice,
}: {
  item: OmrItem;
  answered: boolean;
  onJump: () => void;
  onSelectChoice: (choiceId: string) => void;
}) {
  const submitAnswer = useSubmitAnswer(item.sessionQuestionId);
  const isObjective = item.questionType === "객관식";

  const mark = (choiceId: string) => {
    onSelectChoice(choiceId); // 상위 공유 상태 갱신(문제카드에 반영)
    submitAnswer.mutate({ selectedChoiceIds: [choiceId] });
  };

  return (
    <div className="flex items-center gap-2 py-0.5">
      <button
        type="button"
        onClick={onJump}
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-md font-mono text-[11px] tabular-nums transition-colors duration-150 ease-swift hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card md:h-6 md:w-6 ${
          answered ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
        title="문항으로 이동"
      >
        {item.order}
      </button>

      {isObjective ? (
        <div className="flex flex-1 flex-wrap gap-1">
          {item.choiceIds.map((cid, i) => {
            const on = item.selectedChoiceId === cid;
            return (
              <button
                key={cid}
                type="button"
                onClick={() => mark(cid)}
                aria-pressed={on}
                aria-label={`${item.order}번 ${i + 1}번 선택`}
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border font-mono text-[11px] transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card md:h-7 md:w-7 ${
                  on
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={onJump}
          className="flex min-h-10 flex-1 items-center gap-1.5 text-left text-[11px] text-muted-foreground md:min-h-0"
        >
          <span
            className={`h-2 w-2 flex-none rounded-full ${
              answered ? "bg-primary" : "border border-border"
            }`}
          />
          주관식 {answered ? "답변함" : "미답"}
        </button>
      )}
    </div>
  );
}
