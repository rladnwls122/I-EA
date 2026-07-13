/**
 * Q-Idea 커스텀 훅
 *
 * TanStack Query 기반 데이터 페칭 훅 + 클라이언트 유틸 훅
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchSubjects,
  fetchQuestions,
  fetchQuestion,
  fetchQuestionStats,
  fetchWorkbooks,
  fetchWorkbook,
  fetchComments,
  fetchAnnotations,
  fetchMyNotes,
  fetchMyExamSessions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  createWorkbook,
  deleteWorkbook,
  addQuestionToWorkbook,
  createComment,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  fetchSession,
  submitSessionAnswer,
  revealSessionHint,
  submitSession,
  selfGradeSessionQuestion,
  fetchReviews,
  upsertReview,
  createSession,
  startWorkbook,
  fetchMilestones,
  fetchActiveSession,
  fetchMe,
  fetchWallet,
  fetchShopItems,
  fetchLootBoxes,
  openLootBox,
  purchaseItem,
  equipCosmetic,
  fetchMyPurchases,
} from './api';
import type {
  Subject,
  Question,
  QuestionStatus,
  Workbook,
  AiGeneration,
  SubmitAnswerInput,
} from './types';

// ─── 과목 ───────────────────────────────────────────────────────────

/** 전체 과목 목록 */
export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
    staleTime: 5 * 60 * 1000, // 5분 캐시
  });
}

/**
 * 3단계 과목 트리 (examType -> examCategory -> subjects)
 * UI에서 계층적 선택 드롭다운에 사용됩니다.
 */
export function useSubjectTree() {
  return useQuery({
    queryKey: ['subjects'],
    queryFn: fetchSubjects,
    select: (subjects: Subject[]) => {
      const tree: Record<string, Record<string, Subject[]>> = {};
      for (const s of subjects) {
        if (!tree[s.examType]) tree[s.examType] = {};
        if (!tree[s.examType][s.examCategory])
          tree[s.examType][s.examCategory] = [];
        tree[s.examType][s.examCategory].push(s);
      }
      return tree;
    },
  });
}

// ─── 문제 ───────────────────────────────────────────────────────────

/** 문제 목록 (페이지네이션 + 필터) */
export function useQuestions(params?: {
  page?: number;
  limit?: number;
  subjectId?: string;
  subjectIds?: string[];
  status?: QuestionStatus;
  questionType?: string;
  difficulty?: number;
  search?: string;
  sort?: 'latest' | 'popular';
}, enabled = true) {
  return useQuery({
    queryKey: ['questions', params],
    queryFn: () => fetchQuestions(params),
    enabled,
  });
}

/** 문제 상세 */
export function useQuestion(id: string | null) {
  return useQuery({
    queryKey: ['question', id],
    queryFn: () => fetchQuestion(id!),
    enabled: !!id,
  });
}

/** 문제 통계 */
export function useQuestionStats(id: string | null) {
  return useQuery({
    queryKey: ['question-stats', id],
    queryFn: () => fetchQuestionStats(id!),
    enabled: !!id,
  });
}

/** 문제 생성 뮤테이션 */
export function useCreateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}

/** 문제 수정 뮤테이션 */
export function useUpdateQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Parameters<typeof updateQuestion>[1];
    }) => updateQuestion(id, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({
        queryKey: ['question', variables.id],
      });
    },
  });
}

/** 문제 삭제 뮤테이션 */
export function useDeleteQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteQuestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
  });
}

// ─── 문제집 ─────────────────────────────────────────────────────────

/** 문제집 목록 */
export function useWorkbooks(params?: {
  page?: number;
  limit?: number;
  visibility?: string;
  search?: string;
  sort?: 'popular' | 'recent';
  mine?: boolean;
  examType?: string;
  examCategory?: string;
  subjectId?: string;
  subjectIds?: string[];
}, enabled = true) {
  return useQuery({
    queryKey: ['workbooks', params],
    queryFn: () => fetchWorkbooks(params),
    enabled,
  });
}

/** 문제집 상세 */
export function useWorkbook(id: string | null) {
  return useQuery({
    queryKey: ['workbook', id],
    queryFn: () => fetchWorkbook(id!),
    enabled: !!id,
  });
}

/** 문제집 생성 뮤테이션 */
export function useCreateWorkbook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkbook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbooks'] });
    },
  });
}

/** 문제집 삭제 뮤테이션 */
export function useDeleteWorkbook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkbook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workbooks'] });
    },
  });
}

/** 문제집에 문제 추가 뮤테이션 */
export function useAddQuestionToWorkbook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workbookId,
      questionId,
      displayOrder,
    }: {
      workbookId: string;
      questionId: string;
      displayOrder?: number;
    }) => addQuestionToWorkbook(workbookId, { questionId, displayOrder }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workbook', variables.workbookId],
      });
    },
  });
}

// ─── 댓글 ───────────────────────────────────────────────────────────

/** 문제 댓글 목록 */
export function useComments(questionId: string | null) {
  return useQuery({
    queryKey: ['comments', questionId],
    queryFn: () => fetchComments(questionId!),
    enabled: !!questionId,
  });
}

/** 댓글 작성 뮤테이션 */
export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      data,
    }: {
      questionId: string;
      data: { content: string; parentCommentId?: string };
    }) => createComment(questionId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['comments', variables.questionId],
      });
    },
  });
}

// ─── 오답노트 주석 ──────────────────────────────────────────────────

/** 문제 주석 목록 */
export function useAnnotations(questionId: string | null) {
  return useQuery({
    queryKey: ['annotations', questionId],
    queryFn: () => fetchAnnotations(questionId!),
    enabled: !!questionId,
  });
}

/** 주석 생성 뮤테이션 */
export function useCreateAnnotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      data,
    }: {
      questionId: string;
      data: Parameters<typeof createAnnotation>[1];
    }) => createAnnotation(questionId, data),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['annotations', variables.questionId],
      });
    },
  });
}

/** 주석 수정 뮤테이션 */
export function useUpdateAnnotation(questionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      annotationId,
      data,
    }: {
      annotationId: string;
      data: Parameters<typeof updateAnnotation>[1];
    }) => updateAnnotation(annotationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['annotations', questionId],
      });
    },
  });
}

/** 주석 삭제 뮤테이션 */
export function useDeleteAnnotation(questionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAnnotation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['annotations', questionId],
      });
    },
  });
}

// ─── 내 정보 (me) ───────────────────────────────────────────────────

/** 오답노트 (요약 + 틀린 문제). 시험/대분류/세부과목 범위 필터 지원. */
export function useMyNotes(
  params?: { examType?: string; examCategory?: string; subjectId?: string },
  enabled = true,
) {
  return useQuery({
    queryKey: ['my-notes', params],
    queryFn: () => fetchMyNotes(params),
    enabled,
  });
}

/** 내 시험 세션 이력 */
export function useMyExamSessions(enabled = true) {
  return useQuery({
    queryKey: ['my-exam-sessions'],
    queryFn: fetchMyExamSessions,
    enabled,
  });
}

// ─── 클라이언트 유틸 ────────────────────────────────────────────────

export interface RecentQuestionItem {
  id: string;
  title: string;
  subject: string;
  viewedAt: string;
}

const RECENT_QUESTIONS_KEY = 'recentQuestions';
const MAX_RECENT = 10;

/**
 * 최근 본 문제 (localStorage)
 *
 * 최대 10개까지 저장되며, 중복 추가 시 최상단으로 이동합니다.
 */
export function useRecentQuestions() {
  const [recent, setRecent] = useState<RecentQuestionItem[]>([]);

  // 마운트 시 localStorage에서 복원
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_QUESTIONS_KEY);
      if (stored) {
        setRecent(JSON.parse(stored));
      }
    } catch {
      // localStorage 접근 실패 시 무시
    }
  }, []);

  /** 최근 본 문제 추가 */
  const addRecent = useCallback(
    (item: Omit<RecentQuestionItem, 'viewedAt'>) => {
      const newItem: RecentQuestionItem = {
        ...item,
        viewedAt: new Date().toISOString(),
      };
      const updated = [
        newItem,
        ...recent.filter((r) => r.id !== item.id),
      ].slice(0, MAX_RECENT);
      setRecent(updated);
      try {
        localStorage.setItem(
          RECENT_QUESTIONS_KEY,
          JSON.stringify(updated),
        );
      } catch {
        // localStorage 쓰기 실패 시 무시
      }
    },
    [recent],
  );

  /** 최근 본 문제 초기화 */
  const clearRecent = useCallback(() => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_QUESTIONS_KEY);
    } catch {
      // localStorage 삭제 실패 시 무시
    }
  }, []);

  return { recent, addRecent, clearRecent };
}

/**
 * 디바운스 훅 — 검색 입력 등에 사용
 *
 * @param value - 디바운스할 값
 * @param delay - 지연 시간 (ms), 기본 300ms
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ─── 시험 세션 응시 ─────────────────────────────────────────────────

/** 세션 응시 데이터. IN_PROGRESS/SUBMITTED로 프론트가 모드를 분기한다 */
export function useSession(id: string | null) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => fetchSession(id!),
    enabled: !!id,
  });
}

/**
 * 답안 저장(autosave). mutationKey에 sessionQuestionId를 포함해
 * SolveBottomBar가 useIsMutating(['submit-answer'])으로 "저장중" 여부를
 * 전역에서 알 수 있게 한다. 세션 전체를 invalidate하지 않는다 —
 * 매 저장마다 리페치하면 카드가 깜빡인다(로컬 상태가 이미 최신).
 */
export function useSubmitAnswer(sessionQuestionId: string) {
  return useMutation({
    mutationKey: ['submit-answer', sessionQuestionId],
    mutationFn: (data: SubmitAnswerInput) =>
      submitSessionAnswer(sessionQuestionId, data),
  });
}

/** 힌트 열람. 힌트 없는 문항이면 apiFetch가 Error를 throw(404) */
export function useRevealHint() {
  return useMutation({
    mutationFn: (sessionQuestionId: string) =>
      revealSessionHint(sessionQuestionId),
  });
}

/**
 * 세션 최종 제출. 성공 시:
 *  - ['session', id] → SUBMITTED 재조회(결과 모드 전환)
 *  - ['me']/['milestones']/['active-session'] → 제출로 적립된 XP·레벨·스트릭 반영.
 *    (전역 staleTime 30s라 이걸 안 하면 프로필/대시보드 XP가 30초간 옛값으로 남는다 — "EXP 안 오름" 증상)
 */
export function useSubmitSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitSession(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['session', id] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      queryClient.invalidateQueries({ queryKey: ['active-session'] });
    },
  });
}

/**
 * 서술형 자기채점. 세션 쿼리 invalidate는 호출부가 처리(id를 몰라 여기선 못함).
 * 단 자기채점도 XP를 적립하므로 프로필·게이미피케이션 캐시는 여기서 무효화한다.
 */
export function useSelfGrade() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionQuestionId,
      isCorrect,
    }: {
      sessionQuestionId: string;
      isCorrect: boolean;
    }) => selfGradeSessionQuestion(sessionQuestionId, isCorrect),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
    },
  });
}


// ─── 문항 리뷰 ─────────────────────────────────────────────────────

/** 문제별 리뷰 목록 + 평점 요약 */
export function useReviews(questionId: string | null) {
  return useQuery({
    queryKey: ['reviews', questionId],
    queryFn: () => fetchReviews(questionId!),
    enabled: !!questionId,
  });
}

/** 내 리뷰 등록/수정(upsert). 성공 시 해당 문항 리뷰 목록 갱신 */
export function useUpsertReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      questionId,
      data,
    }: {
      questionId: string;
      data: { rating: number; perceivedDifficulty?: number; reviewText?: string };
    }) => upsertReview(questionId, data),
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reviews', variables.questionId] });
    },
  });
}


// ─── 세션 조립 ─────────────────────────────────────────────────────

/** 세션 조립(플레이리스트/필터/복습). 성공 시 /exam-sessions/[id]로 이동은 호출부 몫 */
export function useCreateSession() {
  return useMutation({ mutationFn: createSession });
}

/** 문제집 바로 풀기 — 세션 생성. 라우팅/토스트는 호출부 몫 */
export function useStartWorkbook() {
  return useMutation({ mutationFn: (workbookId: string) => startWorkbook(workbookId) });
}

// ─── 대시보드 ──────────────────────────────────────────────────────

/** 마일스톤/게이미피케이션 요약. 비로그인(enabled=false)일 땐 호출 안 함 */
export function useMilestones(enabled = true) {
  return useQuery({ queryKey: ['milestones'], queryFn: fetchMilestones, enabled });
}

/** 진행 중 세션(이어하기 배너) */
export function useActiveSession(enabled = true) {
  return useQuery({ queryKey: ['active-session'], queryFn: fetchActiveSession, enabled });
}

/** 현재 로그인 사용자 정보 (/me 페이지) */
export function useMe(enabled = true) {
  return useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled });
}

// ─── 상점 / 코인 / 상자 ────────────────────────────────────────────

/** 내 지갑(코인/인벤토리/코스메틱/미개봉 상자 수) */
export function useWallet(enabled = true) {
  return useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, enabled });
}

/** 상점 아이템 목록 */
export function useShopItems(enabled = true) {
  return useQuery({
    queryKey: ['shop-items'],
    queryFn: fetchShopItems,
    enabled,
  });
}

/** 내 미개봉 상자 목록 */
export function useLootBoxes(enabled = true) {
  return useQuery({
    queryKey: ['loot-boxes'],
    queryFn: fetchLootBoxes,
    enabled,
  });
}

/** 상자 개봉 뮤테이션. 성공 시 지갑(코인)·상자 목록 갱신 */
export function useOpenBox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => openLootBox(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['loot-boxes'] });
    },
  });
}

/**
 * 상점 아이템 구매 뮤테이션. 성공 시:
 *  - ['wallet'] → 코인/인벤토리/코스메틱 반영
 *  - ['me']/['milestones'] → XP 부스터 등 효과가 프로필·대시보드에 즉시 반영되도록
 *  - ['my-purchases'] → 구매 이력 목록 갱신
 */
export function usePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemKey: string) => purchaseItem(itemKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      queryClient.invalidateQueries({ queryKey: ['my-purchases'] });
    },
  });
}

/** 코스메틱 착용(칭호/닉네임 색) 뮤테이션. 성공 시 지갑 갱신 */
export function useEquipCosmetic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemKey: string) => equipCosmetic(itemKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
}

/** 내 구매 이력 */
export function useMyPurchases(enabled = true) {
  return useQuery({
    queryKey: ['my-purchases'],
    queryFn: fetchMyPurchases,
    enabled,
  });
}
