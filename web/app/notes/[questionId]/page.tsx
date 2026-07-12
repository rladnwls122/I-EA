'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Minus, X } from 'lucide-react';
import { useAnnotations, useMyNotes, useQuestion, useSession } from '@/lib/hooks';
import { extractPlainText } from '@/lib/prosemirror';
import { resolveAnnotation, type AnchorStatus } from '@/lib/annotations';
import { useTextSelection } from '@/lib/hooks/useTextSelection';
import { AnnotatedText } from '@/components/notes/AnnotatedText';
import { AnnotationToolbar } from '@/components/notes/AnnotationToolbar';
import { AnnotationPanel } from '@/components/notes/AnnotationPanel';

function NoteDetail() {
  const { questionId } = useParams() as { questionId: string };
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get('sessionId');

  // sessionId 쿼리가 없으면 오답노트 목록에서 이 문항의 첫 오답 세션으로 fallback
  const { data: notes } = useMyNotes(undefined, !sessionIdParam);
  const sessionId =
    sessionIdParam ??
    (notes?.wrongQuestions || []).find((w) => w.questionId === questionId)?.sessionId ??
    null;

  const { data: session, isLoading: sessionLoading } = useSession(sessionId);
  // 세션을 못 찾는 경로(직접 URL 진입 등) 대비 원본 문항 fallback
  const { data: question, isLoading: questionLoading } = useQuestion(questionId);
  const { data: annotations } = useAnnotations(questionId);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { selection, clear } = useTextSelection();

  const sq = useMemo(
    () => (session?.questions || []).find((q) => q.questionId === questionId) ?? null,
    [session, questionId],
  );
  const snapshot = sq?.snapshot ?? null;
  const answer = sq?.answer ?? null;

  // 렌더에 쓸 doc들 — snapshot 우선, 없으면 원본 문항
  // Question 타입에는 passage 필드가 없다(지문은 세션 스냅샷 컨텍스트에서만 내려온다) — 원본 문항 fallback 없음.
  const stemDoc = snapshot?.stem ?? question?.stem;
  const passageDoc = snapshot?.passage;
  const explanationDoc = snapshot?.explanation ?? question?.explanation;
  // Question.choices는 그 자체가 선택지 배열(any) — snapshot.choices와 동일한 shape.
  const choices = snapshot?.choices ?? question?.choices ?? null;
  const questionType = snapshot?.questionType ?? question?.questionType;
  const difficulty = snapshot?.difficulty ?? question?.difficulty;
  const subjectName = session?.subject?.name ?? question?.subject?.name;

  // target별 평문 — selectedText 정규화·status 계산에 사용
  const plainFor = useMemo(() => {
    const map = new Map<string, string>();
    if (stemDoc) map.set('STEM', extractPlainText(stemDoc));
    if (passageDoc) map.set('PASSAGE', extractPlainText(passageDoc));
    if (explanationDoc) map.set('EXPLANATION', extractPlainText(explanationDoc));
    if (Array.isArray(choices)) {
      for (const c of choices) {
        if (c?.id && c?.content) map.set(`CHOICES:${c.id}`, extractPlainText(c.content));
      }
    }
    return map;
  }, [stemDoc, passageDoc, explanationDoc, choices]);

  const plainOf = (target: string, targetId?: string | null) =>
    plainFor.get(targetId ? `${target}:${targetId}` : target) ?? '';

  // 패널 배지용 — 주석별 앵커 status (렌더러와 동일한 resolveAnnotation 사용)
  const statusById = useMemo(() => {
    const out: Record<string, AnchorStatus> = {};
    for (const ann of annotations || []) {
      if (ann.target === 'GENERAL') continue;
      const anchor = resolveAnnotation(plainOf(ann.target, ann.targetId), ann);
      if (anchor) out[ann.id] = anchor.status;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, plainFor]);

  // 선택된 텍스트의 정본 — 브라우저 toString 대신 평문 slice
  const canonicalText = selection
    ? plainOf(selection.target, selection.targetId).slice(selection.start, selection.end)
    : '';

  if (sessionLoading || questionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!stemDoc) {
    return <div className="p-10">문항을 찾을 수 없습니다.</div>;
  }

  const anns = annotations || [];
  const isCorrect = answer?.isCorrect; // true | false | null(서술형 미채점) | undefined(세션 없음)

  return (
    <main className="relative mx-auto w-full max-w-5xl overflow-x-hidden p-4 md:p-10">
      <Link
        href="/notes"
        className="mb-8 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} /> 오답노트로 돌아가기
      </Link>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* 문항 본문 */}
        <section className="min-w-0 flex-1">
          <div className="mb-6">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-primary">
              {subjectName} · {questionType} · 난이도 {difficulty}
            </span>
            <AnnotatedText
              doc={stemDoc}
              target="STEM"
              annotations={anns}
              onMarkClick={setFocusedId}
              className="text-xl font-bold leading-relaxed"
            />
          </div>

          {/* 지문 */}
          {passageDoc && (
            <section className="mb-8 rounded-xl border border-border bg-card p-5">
              <span className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                지문
              </span>
              <AnnotatedText
                doc={passageDoc}
                target="PASSAGE"
                annotations={anns}
                onMarkClick={setFocusedId}
                className="text-sm leading-relaxed"
              />
            </section>
          )}

          {/* 선지 (객관식) — snapshot isCorrect + 내 선택으로 실데이터 표시 */}
          {questionType === '객관식' && Array.isArray(choices) && choices.length > 0 && (
            <div className="mb-10 space-y-3">
              {choices.map((c: any, i: number) => {
                const correct = c.isCorrect === true;
                const selected = (answer?.selectedChoiceIds || []).includes(c.id);
                return (
                  <div
                    key={c.id ?? i}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm font-medium transition-colors ${
                      correct
                        ? 'border-correct/30 bg-correct/10'
                        : selected
                          ? 'border-wrong/30 bg-wrong/10'
                          : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-[11px] font-bold ${
                          correct
                            ? 'bg-correct text-white'
                            : selected
                              ? 'bg-wrong text-white'
                              : 'bg-surface-raised text-muted-foreground'
                        }`}
                      >
                        {correct ? <Check size={12} /> : selected ? <X size={12} /> : i + 1}
                      </span>
                      {c.content ? (
                        <AnnotatedText
                          doc={c.content}
                          target="CHOICES"
                          targetId={c.id}
                          annotations={anns}
                          onMarkClick={setFocusedId}
                          className="min-w-0 break-words"
                        />
                      ) : null}
                    </div>
                    {(correct || selected) && (
                      <span
                        className={`flex-none rounded-md px-2 py-1 text-[10px] font-bold ${
                          correct ? 'bg-correct/20 text-correct' : 'bg-wrong/20 text-wrong'
                        }`}
                      >
                        {correct ? '정답' : '내가 고른 답'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 주관식 — 내 답/정답 */}
          {questionType === '주관식' && (
            <div className="mb-10 space-y-3">
              {answer?.answerText != null && (
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <span className="mb-1 block text-[10px] font-bold text-muted-foreground">내 답안</span>
                  <p className="whitespace-pre-wrap">{answer.answerText}</p>
                </div>
              )}
              {snapshot?.correctAnswerText && (
                <div className="rounded-xl border border-correct/30 bg-correct/10 p-4 text-sm">
                  <span className="mb-1 block text-[10px] font-bold text-correct">정답</span>
                  <p className="whitespace-pre-wrap">{snapshot.correctAnswerText}</p>
                </div>
              )}
            </div>
          )}

          {/* 해설 */}
          {explanationDoc && (
            <section className="mt-10 rounded-xl border border-border/50 bg-surface-raised p-6">
              <span className="mb-3 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                해설
              </span>
              <AnnotatedText
                doc={explanationDoc}
                target="EXPLANATION"
                annotations={anns}
                onMarkClick={setFocusedId}
                className="text-sm leading-relaxed text-foreground/80"
              />
            </section>
          )}
        </section>

        {/* 사이드 — 풀이 결과 + 주석 패널. 모바일에선 본문 아래 스택 */}
        <aside className="flex w-full flex-col gap-5 md:w-[300px]">
          {isCorrect !== undefined && (
            <section className="rounded-xl border border-border bg-card p-5">
              <span className="mb-3 block text-xs font-medium text-muted-foreground">이번 풀이 결과</span>
              {isCorrect === false && (
                <div className="flex items-center gap-2 text-lg font-semibold text-wrong">
                  <X size={20} strokeWidth={2} /> 오답
                </div>
              )}
              {isCorrect === true && (
                <div className="flex items-center gap-2 text-lg font-semibold text-correct">
                  <Check size={20} strokeWidth={2} /> 정답
                </div>
              )}
              {isCorrect === null && (
                <div className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                  <Minus size={20} strokeWidth={2} /> 자가채점 대기
                </div>
              )}
            </section>
          )}

          <AnnotationPanel
            questionId={questionId}
            annotations={anns}
            statusById={statusById}
            focusedId={focusedId}
            onFocus={setFocusedId}
          />
        </aside>
      </div>

      {/* 드래그 선택 → 주석 작성 툴바 */}
      {selection && canonicalText && (
        <AnnotationToolbar
          questionId={questionId}
          selection={selection}
          canonicalText={canonicalText}
          onClose={clear}
        />
      )}
    </main>
  );
}

export default function NoteDetailPage() {
  // useSearchParams는 Suspense 경계 필요 (Next 14)
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      }
    >
      <NoteDetail />
    </Suspense>
  );
}
