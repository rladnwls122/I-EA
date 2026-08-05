"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { KEYWORD_TAG_CATEGORY } from "@/lib/tag-categories";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, PencilLine, Plus, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { extractPlainText, blocksToDoc } from "@/lib/prosemirror";
import { buildRichDoc } from "@/lib/prosemirror-assemble";
import {
  createQuestion,
  updateQuestion,
  publishQuestion,
  addQuestionToWorkbook,
  updateWorkbook,
  createPassage,
  publishPassage,
  updatePassage,
  registerMediaAsset,
  fetchQuestion,
  fetchSubjects,
  fetchTags,
  createTag,
} from "@/lib/api";
import { useWorkbook } from "@/lib/hooks";
import type { Question } from "@/lib/types";
import { questionRejectReason, type ParsedQuestion } from "@/lib/authoring-chat";
import { AuthoringChatPanel } from "./AuthoringChatPanel";
import { AuthoringCanvasCard } from "./AuthoringCanvasCard";
import {
  cardImageSrcs,
  collectImageSrcs,
  passageFingerprint,
  questionFingerprint,
  uniquePassages,
  validateSave,
} from "./authoring-save";
import {
  runSave,
  type SaveBaseline,
  type SaveClient,
} from "./authoring-save-run";
import {
  canvasReducer,
  initialCanvasState,
  sharedWith as sharedWithIn,
} from "./authoring-canvas.reducer";

/** 선지 하나 — 본문 + 선지별 해설(공개 여부 토글 가능). */
export interface CanvasChoice {
  text: string;
  explanation: string;
  /** 선지별 해설 공개 여부 — 저장 시 choices Json에 함께 실린다. */
  showExplanation: boolean;
  /**
   * 불러온 선지의 원본 노드(rich). 카드 UI는 선지를 아직 평문 `<input>`으로 편집하므로,
   * 서식이 실린 선지를 열었다가 저장하면 `buildRichDoc(평문)`으로 덮여 서식이 사라진다.
   * 편집기가 캔버스로 일원화된 뒤에도(#41 Phase 3) 서식 유입 경로는 남는다 — AI 생성분,
   * 그리고 이전 편집기 시절에 저장된 문항이 그렇다. 사용자가 그 선지의 텍스트를 실제로
   * 고치지 않았다면 원본을 그대로 돌려보내 파괴를 막는다.
   * 선지 자체를 rich 편집으로 바꾸면 이 방어는 필요 없어진다.
   */
  sourceContent?: any;
  sourceExplanation?: any;
}

/** 좌측 캔버스 카드 — 편집에 쓰는 필드만 담은 경량 문항 모델. */
export interface CanvasCard {
  id: string;
  type: "객관식" | "주관식";
  stem: any;
  passage: any | null;
  /**
   * 어느 지문세트에 속하는가. 저장된 문항은 실제 passage id를, 아직 저장 안 된 지문은
   * `local-passage-` id를 갖는다. 지문이 없으면 null.
   *
   * 예전에는 "지문 평문이 같으면 같은 지문"이었다. 한 글자만 고쳐도 세트가 깨져 지문이
   * 복제됐고, 남남인 문항의 지문이 우연히 같으면 한쪽을 고칠 때 다른 쪽까지 바뀌었다(#41 Phase 3).
   */
  passageGroupId: string | null;
  choices: CanvasChoice[];
  correct: number;
  answerText: string;
  explanation: any;
  /** 배점 — 생성 단계부터 지정 가능. */
  points: number;
  /** #키워드 — 자유 태깅. 저장 시 태그로 find-or-create 후 tagIds로 연결. */
  keywords: string[];
}

/** AI 생성 설정(채팅창 밖 독립 패널) — null은 "자동"(힌트 없음, AI가 판단). */
export interface AiSettings {
  questionType: "객관식" | "주관식" | "OX" | null;
  count: number;
  difficulty: number;
  /**
   * 객관식 선지 개수. null이면 시험별 관행(수능·내신·한능검 5지 / 공무원·토익 4지)을
   * AI가 알아서 따른다. OX일 때는 무시된다(항상 2지).
   */
  choiceCount: number | null;
  /** 지문을 함께 만들지. null이면 AI가 문항 성격에 따라 판단한다. */
  includePassage: boolean | null;
}

/**
 * ParsedQuestion(평문) → CanvasCard(ProseMirror 조립).
 * 객관식인데 선지가 2개 미만이거나 correctIndex가 범위를 벗어나면
 * 임의로 0번을 정답 확정하지 않고 카드 생성을 거부한다(F4).
 * 거부 조건의 단일 출처는 questionRejectReason(사유 문자열까지 제공) — 여기와 어긋나면 안 된다.
 */
type CardContent = Omit<CanvasCard, "id" | "passageGroupId">;

function toCard(q: ParsedQuestion): CardContent | null {
  const isObjective = q.questionType === "객관식";
  const toChoices = (list: string[]): CanvasChoice[] =>
    list.map((text) => ({ text, explanation: "", showExplanation: false }));
  if (isObjective) {
    if (questionRejectReason(q) !== null) return null;
    const choices = q.choices ?? [];
    const correct = q.correctIndex as number; // questionRejectReason 통과 = number & 범위 내
    return {
      type: q.questionType,
      stem: buildRichDoc(q.stem),
      passage: q.passage ? buildRichDoc(q.passage) : null,
      choices: toChoices(choices),
      correct,
      answerText: "",
      explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
      points: 1,
      // AI가 제안한 #키워드 — 카드에 채워두면 사용자가 그대로 두거나 수정할 수 있고,
      // 저장 시 기존 resolveTagIds 로직이 그대로 태그로 만들어 붙인다.
      keywords: q.keywords ?? [],
    };
  }
  return {
    type: q.questionType,
    stem: buildRichDoc(q.stem),
    passage: q.passage ? buildRichDoc(q.passage) : null,
    choices: [],
    correct: -1,
    answerText: q.answerText ?? "",
    explanation: q.explanation ? buildRichDoc(q.explanation) : buildRichDoc(""),
    points: 1,
    keywords: q.keywords ?? [],
  };
}

/**
 * 저장된 rich 값(doc 노드 또는 블록 노드 배열) → 평문.
 * choices[].content/stem은 doc, explanation은 buildRichBlocks가 만든 블록 배열이라
 * 배열이면 doc으로 감싸 extractPlainText가 순회할 수 있게 한다.
 */
function richToText(v: any): string {
  if (!v) return "";
  const doc = Array.isArray(v) ? { type: "doc", content: v } : v;
  return extractPlainText(doc);
}

/**
 * 저장된 Question(GET /questions/:id 상세) → CanvasCard 역매핑.
 * 기존 문제집을 "수정"으로 열 때 원래 문항을 캔버스에 그대로 복원한다.
 * id는 실제 question id를 유지해 저장 시 새로 만들지 않고 그 문항을 갱신하도록 한다.
 */
function questionToCard(q: Question): CanvasCard {
  const isObjective = q.questionType === "객관식";
  const rawChoices: any[] = Array.isArray(q.choices) ? q.choices : [];
  const choices: CanvasChoice[] = rawChoices.map((c) => ({
    text: extractPlainText(c?.content),
    explanation: richToText(c?.explanation),
    // 저장 때 실린 선지별 해설 공개 여부를 그대로 복원.
    showExplanation: !!c?.explanationVisible,
    // 원본 노드 보존 — 편집하지 않은 선지는 저장 시 이걸 그대로 돌려보낸다.
    sourceContent: c?.content,
    sourceExplanation: c?.explanation,
  }));
  const correct = rawChoices.findIndex((c) => c?.isCorrect === true);
  const keywords = (q.tags ?? [])
    .filter((t) => t.category === KEYWORD_TAG_CATEGORY)
    .map((t) => t.name);
  return {
    id: q.id,
    type: isObjective ? "객관식" : "주관식",
    stem: q.stem ?? buildRichDoc(""),
    passage: q.passage?.content ?? null,
    // 서버가 준 실제 passage id가 곧 지문세트 id다 — 평문을 맞춰 보지 않아도
    // 같은 지문을 쓰는 문항끼리 저절로 묶인다.
    passageGroupId: q.passage?.id ?? null,
    choices: isObjective ? choices : [],
    correct: isObjective ? (correct >= 0 ? correct : 0) : -1,
    answerText: q.correctAnswerText ?? "",
    // explanation은 블록 배열로 저장되므로 doc으로 다시 세운다(카드 에디터는 doc을 받는다).
    // 감싸기만 한다 — 평문을 거치면 저장돼 있던 서식이 열 때마다 사라진다.
    explanation: blocksToDoc(q.explanation),
    points: Number(q.points) || 1,
    keywords,
  };
}

/**
 * 불러온 카드들의 "서버와 일치하던 모습" — 저장이 무엇을 건너뛸 수 있는지의 근거.
 *
 * `registeredImages`에 불러온 이미지를 전부 넣는 이유: 이미 문서에 있던 이미지는
 * 등록됐거나(정상) 등록 기능이 없던 시절의 것인데, 어느 쪽이든 다시 등록하면
 * media_assets에 중복 행만 쌓인다. 등록 대상은 "이번에 새로 들어온 것"뿐이다.
 */
function baselineOf(cards: CanvasCard[]): SaveBaseline {
  const questions: Record<string, string> = {};
  const passages: Record<string, string> = {};
  const images: string[] = [];
  for (const c of cards) {
    questions[c.id] = questionFingerprint(c);
    images.push(...cardImageSrcs(c));
  }
  for (const { groupId, passage } of uniquePassages(cards)) {
    passages[groupId] = passageFingerprint(passage);
    images.push(...collectImageSrcs(passage));
  }
  return { questions, passages, registeredImages: images };
}

export function AuthoringCanvas({
  workbookId,
  initialSubjectId,
}: {
  workbookId: string;
  /** 문제집 만들기(Step 1)에서 고른 과목 — URL로 넘어온다. 있으면 최우선. */
  initialSubjectId?: string;
}) {
  /* ── 문서 상태 — 저장하면 서버로 가는 것들은 전부 리듀서 한곳에서 전이한다.
   * (모바일 탭·제목 편집 같은 화면 전용 상태는 아래에 useState로 남긴다.) ── */
  const [doc, dispatch] = useReducer(canvasReducer, initialSubjectId, initialCanvasState);
  const { cards, subjectId, isPublic, workbookKeywords, editingId } = doc;
  const [saving, setSaving] = useState(false);

  /* ── AI 생성 설정 — 채팅창 밖 독립 패널(우측 상단)이 조작 ── */
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    questionType: null,
    count: 1,
    difficulty: 3,
    choiceCount: null,
    includePassage: null,
  });

  /* ── 문제집 #키워드 — 문항 키워드와 별개로 문제집 전체에 붙는 태그.
   * (오답노트 통계는 문항 키워드가 담당, 이건 문제집 탐색/분류용.) ── */
  const [workbookKeywordInput, setWorkbookKeywordInput] = useState("");
  const addWorkbookKeyword = useCallback(() => {
    setWorkbookKeywordInput((raw) => {
      if (raw.trim()) dispatch({ type: "addWorkbookKeyword", name: raw });
      return "";
    });
  }, []);

  /* ── 드래그&드롭 순서 변경 ── */
  const dragIndex = useRef<number | null>(null);

  /* ── ✨AI → 채팅 프리필 ── */
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  // AI가 지금 응답을 만들고 있는지(ChatPanel이 올려줌) — 모바일에서 사용자가
  // 캔버스 탭을 보고 있어도 "AI 도우미" 탭에 살아있는 점으로 알려준다.
  const [aiStreaming, setAiStreaming] = useState(false);

  /* ── 모바일 전용 탭 전환 — md 이상에서는 항상 둘 다 나란히 보인다 ── */
  const [mobileTab, setMobileTab] = useState<"canvas" | "chat">("canvas");

  /* ── 문제집 제목 ── */
  const { data: workbook, isError: workbookError } = useWorkbook(workbookId);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // initialSubjectId가 없는 경우(예: 기존 문제집을 "수정"으로 열었을 때) —
  // 과목 결정은 여기(캔버스)가 단일 소유자다. 문제집 로딩을 기다렸다가
  // ① 담긴 문항의 과목을 잇고, ② 빈 문제집일 때만 과목 목록 첫 번째로 fallback.
  // (예전엔 ChatPanel이 마운트 즉시 목록 첫 번째로 확정해버려, 문제집 로딩이
  // 끝나기 전에 엉뚱한 과목(예: NCS)으로 고정되는 레이스가 있었다.)
  useEffect(() => {
    if (initialSubjectId || subjectId) return;
    if (!workbook?.questions) return; // 문제집 로딩 전엔 결정하지 않는다
    const existingSubjectId = workbook.questions.find((q) => q.question?.subject?.id)
      ?.question?.subject?.id;
    if (existingSubjectId) {
      dispatch({ type: "setSubject", subjectId: existingSubjectId });
      return;
    }
    // 빈 문제집 — 최후의 fallback으로만 목록 첫 번째를 쓴다.
    let cancelled = false;
    fetchSubjects()
      .then((list) => {
        if (!cancelled && list[0]) dispatch({ type: "setSubject", subjectId: list[0].id });
      })
      .catch(() => toast.error("과목 목록을 불러오지 못했습니다."));
    return () => {
      cancelled = true;
    };
  }, [initialSubjectId, subjectId, workbook]);

  /* ── 기존 문항 복원 ──
   * "수정"으로 열면 원래 담긴 문항을 캔버스에 그대로 되살린다(한 번만).
   * 문제집 목록 응답엔 선지/지문/해설이 없으므로 문항별 상세를 따로 불러온다.
   * 실패하면 questionsHydrated를 세우지 않아 다음 재조회에서 다시 시도한다(데이터 유실 방지). */
  const questionsHydrated = doc.questionsHydrated;
  useEffect(() => {
    if (questionsHydrated) return;
    const wqs = workbook?.questions;
    if (!wqs) return; // 아직 로딩 중
    if (wqs.length === 0) {
      dispatch({ type: "hydrateQuestionsEmpty" }); // 새 문제집 — 복원할 것 없음
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const details = await Promise.all(wqs.map((wq) => fetchQuestion(wq.questionId)));
        if (cancelled) return;
        const restored = details.map(questionToCard);
        dispatch({ type: "hydrateQuestions", cards: restored, baseline: baselineOf(restored) });
      } catch (e) {
        console.error("기존 문항 불러오기 실패:", e);
        toast.error("기존 문항을 불러오지 못했어요. 새로고침 해주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workbook, questionsHydrated]);

  /* ── 문제집 #키워드 + 공개 설정 복원 — 한 번만 채운다.
   * isPublic은 원래 workbook.visibility에서 채워지지 않아, 이미 공개인 문제집을
   * "수정"으로 열고 그대로 저장하면 토글 기본값(false=비공개)이 강제 반영돼
   * 조용히 비공개로 되돌아가는 버그가 있었다. ── */
  useEffect(() => {
    if (!workbook) return;
    dispatch({
      type: "hydrateMeta",
      keywords: (workbook.tags ?? [])
        .filter((t) => t.category === KEYWORD_TAG_CATEGORY)
        .map((t) => t.name),
      isPublic: workbook.visibility === "PUBLIC",
    });
  }, [workbook]);

  const commitTitle = async () => {
    setTitleEditing(false);
    const next = titleDraft.trim();
    if (!next || next === workbook?.title) return;
    try {
      await updateWorkbook(workbookId, { title: next });
      toast.success("문제집 제목을 바꿨어요.");
    } catch (e) {
      console.error("제목 수정 실패:", e);
      toast.error("제목 수정에 실패했습니다.");
    }
  };

  /** i번 카드와 지문을 공유하는 다른 카드들의 1-기반 번호. */
  const sharedWith = useCallback((i: number): number[] => sharedWithIn(cards, i), [cards]);

  // 지문 편집을 세트 전체에 반영한 사실은 리듀서가 세어 두고, 알림만 여기서 띄운다.
  useEffect(() => {
    if (doc.propagatedTo === 0) return;
    toast.success(`지문을 공유하는 ${doc.propagatedTo}개 문항에 함께 반영했어요.`);
    dispatch({ type: "noticeShown" });
  }, [doc.propagatedTo]);

  // 채팅 제안 → 좌측 반영. target이 replace:N이면 그 자리 교체, 아니면 append.
  // 검증(toCard)은 dispatch 밖에서 — StrictMode 이중 실행에도 토스트가 두 번 뜨지 않는다.
  // 실패 시 구체적 사유를 반환한다 — 채팅 패널이 스레드에 그대로 표시해, 문항이
  // "조용히 버려지는" 일을 막는다.
  const applyQuestion = useCallback((q: ParsedQuestion, originKey: string): string | null => {
    const reason = questionRejectReason(q);
    const content = reason === null ? toCard(q) : null;
    if (!content) {
      const detail = reason ?? "문항 형식이 올바르지 않아요";
      toast.error(`문항을 적용하지 못했어요 — ${detail}.`);
      return detail;
    }
    dispatch({
      type: "applyAiQuestion",
      card: content,
      target: q.target ?? "new",
      originKey,
      now: Date.now(),
    });
    return null;
  }, []);

  /* ── 카드 편집 핸들러 ── */
  const startEdit = useCallback((id: string) => dispatch({ type: "startEdit", id }), []);
  const finishEdit = useCallback(() => dispatch({ type: "finishEdit" }), []);
  const removeCard = useCallback((id: string) => dispatch({ type: "removeCard", id }), []);
  const updateCard = useCallback(
    (id: string, patch: Partial<CanvasCard>) =>
      dispatch({ type: "updateCard", id, patch, now: Date.now() }),
    [],
  );

  /** ✨AI — 채팅 입력창에 "문제 N 수정: " 프리필. 모바일에선 채팅 탭으로도 전환. */
  const askAi = useCallback((index: number) => {
    setChatPrefill(`문제 ${index + 1} 수정: `);
    setMobileTab("chat");
  }, []);

  const addManualCard = useCallback(() => {
    dispatch({
      type: "addManualCard",
      now: Date.now(),
      card: {
        type: "객관식",
        stem: buildRichDoc(""),
        passage: null,
        choices: Array.from({ length: 4 }, () => ({
          text: "",
          explanation: "",
          showExplanation: false,
        })),
        correct: 0,
        answerText: "",
        explanation: buildRichDoc(""),
        points: 1,
        keywords: [],
      },
    });
  }, []);

  /**
   * runSave가 쓰는 서버 호출 묶음. 이 어댑터가 유일한 네트워크 경계라, 저장 로직은
   * 테스트에서 가짜 구현을 끼워 넣는 것만으로 전부 확인된다.
   */
  const saveClient = useMemo<SaveClient>(
    () => ({
      createPassage: (content) => createPassage(content),
      publishPassage: (id) => publishPassage(id),
      updatePassage: (id, content) => updatePassage(id, content),
      listKeywordTags: () => fetchTags(KEYWORD_TAG_CATEGORY),
      createKeywordTag: (name) => createTag(name, KEYWORD_TAG_CATEGORY),
      createQuestion: (payload) => createQuestion(payload as any),
      updateQuestion: (id, payload) => updateQuestion(id, payload as any),
      publishQuestion: (id) => publishQuestion(id),
      addQuestionToWorkbook: (questionId) => addQuestionToWorkbook(workbookId, { questionId }),
      updateWorkbook: (patch) => updateWorkbook(workbookId, patch),
      registerImage: (args) => registerMediaAsset(args),
    }),
    [workbookId],
  );

  const handleSave = async () => {
    // 사전검증은 순수 규칙이라 authoring-save로 뺐다(테스트 대상).
    const blocked = validateSave({
      cardCount: cards.length,
      subjectId,
      workbookLoaded: !workbookError && !!workbook,
    });
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setSaving(true);
    try {
      // 순서·실패 처리는 runSave가 갖는다. 여기 남는 건 "서버로 나가는 문"(saveClient)과
      // 결과를 화면에 옮기는 일뿐이다 — 저장 규칙을 고칠 때 이 컴포넌트를 열 일이 없다.
      const outcome = await runSave(
        {
          cards,
          subjectId,
          workbookKeywords,
          isPublic,
          visibilityChanged: !!workbook && workbook.visibility !== (isPublic ? "PUBLIC" : "PRIVATE"),
          baseline: doc.baseline,
        },
        saveClient,
      );
      dispatch({ type: "saveSucceeded", outcome });
      for (const n of outcome.notices) {
        if (n.level === "error") toast.error(n.message);
        else toast.success(n.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden md:h-screen md:flex-row">
      {/* 모바일 전용 탭 전환 — md 이상에서는 좌우 나란히 보이므로 숨긴다. */}
      <div className="flex border-b border-border md:hidden">
        <button
          type="button"
          onClick={() => setMobileTab("canvas")}
          aria-pressed={mobileTab === "canvas"}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "canvas" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
          }`}
        >
          문제집
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          aria-pressed={mobileTab === "chat"}
          className={`relative flex-1 py-2.5 text-sm font-medium transition-colors ${
            mobileTab === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"
          }`}
        >
          AI 도우미
          {/* AI가 캔버스 탭 보는 동안에도 응답 중임을 알리는 신호 — 장식이 아니라 실제 상태. */}
          {aiStreaming && mobileTab !== "chat" && (
            <span className="absolute right-[calc(50%-2.75rem)] top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-purple" />
          )}
        </button>
      </div>

      {/* 좌: 캔버스 */}
      <section
        className={`flex-1 min-w-0 flex-col border-r border-border md:flex ${
          mobileTab === "canvas" ? "flex" : "hidden"
        }`}
      >
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/workbook/create"
              className="flex flex-none items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={18} /> 뒤로가기
            </Link>
            {/* 문제집 제목 — 클릭해 인라인 편집 */}
            {workbookError ? (
              <span className="text-sm font-medium text-wrong">
                문제집을 불러오지 못했어요 — 저장이 불가능합니다
              </span>
            ) : titleEditing ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") setTitleEditing(false);
                }}
                className="h-9 w-full max-w-[360px] rounded-lg border border-input bg-transparent px-3 text-sm font-semibold text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(workbook?.title ?? "");
                  setTitleEditing(true);
                }}
                title="제목 수정"
                className="group flex min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate text-sm font-semibold text-foreground">
                  {workbook?.title ?? "문제집"}
                </span>
                <PencilLine
                  size={13}
                  className="flex-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            )}
          </div>
          <div className="flex flex-none items-center gap-3">
            {/* 배포 공개 설정 — 저장(최종 검토) 시 문제집 전체에 반영 */}
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => dispatch({ type: "setPublic", isPublic: !isPublic })}
              className="flex items-center gap-2 text-xs text-muted-foreground"
              title="저장 시 문제집 공개 여부"
            >
              <span className={isPublic ? "text-primary font-medium" : ""}>
                {isPublic ? "공개" : "비공개"}
              </span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  isPublic ? "bg-primary" : "bg-surface-raised border border-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-foreground shadow transition-all ${
                    isPublic ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
            <Button onClick={handleSave} disabled={saving} className="flex-none">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.5} />}
              문제집 저장
            </Button>
          </div>
        </header>
        {/* 문제집 #키워드 — 문항 키워드와 별개, 문제집 전체 분류/탐색용. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-6 py-2.5">
          <span className="mr-1 flex-none text-[11px] font-medium text-muted-foreground">문제집 키워드</span>
          {workbookKeywords.map((k) => (
            <span
              key={k}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
            >
              #{k}
              <button
                type="button"
                onClick={() => dispatch({ type: "removeWorkbookKeyword", name: k })}
                aria-label={`#${k} 삭제`}
                className="text-primary/70 hover:text-primary"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          ))}
          <input
            value={workbookKeywordInput}
            onChange={(e) => setWorkbookKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addWorkbookKeyword();
              }
            }}
            onBlur={addWorkbookKeyword}
            placeholder="키워드 입력 후 Enter"
            className="h-6 min-w-[100px] flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cards.map((c, i) => (
            <div
              key={c.id}
              // 드래그&드롭 순서 변경 — 편집 중인 카드는 드래그 금지(입력 충돌).
              draggable={editingId !== c.id}
              onDragStart={() => {
                dragIndex.current = i;
              }}
              onDragOver={(e) => {
                e.preventDefault(); // drop 허용
              }}
              onDrop={() => {
                if (dragIndex.current !== null)
                  dispatch({ type: "moveCard", from: dragIndex.current, to: i });
                dragIndex.current = null;
              }}
              onDragEnd={() => {
                dragIndex.current = null;
              }}
            >
              <AuthoringCanvasCard
                card={c}
                index={i}
                editing={editingId === c.id}
                sharedWith={sharedWith(i)}
                onStartEdit={() => startEdit(c.id)}
                onFinishEdit={finishEdit}
                onChange={(patch) => updateCard(c.id, patch)}
                onRemove={() => removeCard(c.id)}
                onAskAi={() => askAi(i)}
              />
            </div>
          ))}
          <button
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
            onClick={addManualCard}
          >
            <Plus size={16} /> 문항 추가
          </button>
        </div>
      </section>

      {/* 우: 채팅 — 모바일에선 탭 선택 시에만, md 이상에서는 항상 나란히. */}
      <div className={`min-w-0 flex-1 md:flex md:flex-none ${mobileTab === "chat" ? "flex flex-1" : "hidden"}`}>
        <AuthoringChatPanel
          workbookId={workbookId}
          cards={cards}
          settings={aiSettings}
          onSettingsChange={setAiSettings}
          resolvedSubjectId={subjectId}
          onApplyQuestion={applyQuestion}
          prefill={chatPrefill}
          onPrefillConsumed={() => setChatPrefill(null)}
          onStreamingChange={setAiStreaming}
        />
      </div>
    </div>
  );
}
