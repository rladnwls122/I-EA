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
  fetchAiGeneration,
  fetchWorkbooks,
  fetchWorkbook,
  fetchComments,
  fetchAnnotations,
  fetchMyNotes,
  fetchMyExamSessions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  publishQuestion,
  createWorkbook,
  createAiGeneration,
  createComment,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from './api';
import type {
  Subject,
  Question,
  QuestionStatus,
  Workbook,
  AiGeneration,
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
  status?: QuestionStatus;
  questionType?: string;
  difficulty?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: ['questions', params],
    queryFn: () => fetchQuestions(params),
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

/** 문제 출판 뮤테이션 */
export function usePublishQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishQuestion,
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({
        queryKey: ['question', id],
      });
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
}) {
  return useQuery({
    queryKey: ['workbooks', params],
    queryFn: () => fetchWorkbooks(params),
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

// ─── AI 생성 ────────────────────────────────────────────────────────

/** AI 문제 생성 요청 뮤테이션 */
export function useCreateAiGeneration() {
  return useMutation({
    mutationFn: createAiGeneration,
  });
}

/**
 * AI 생성 폴링 (3초 간격, COMPLETED/FAILED에서 정지)
 *
 * 사용법:
 * ```tsx
 * const { data } = useGenerationPolling(generationId);
 * // data?.status === 'COMPLETED' → 결과 표시
 * // data?.status === 'FAILED' → 에러 처리
 * ```
 */
export function useGenerationPolling(genId: string | null) {
  return useQuery({
    queryKey: ['ai-generation', genId],
    queryFn: () => fetchAiGeneration(genId!),
    enabled: !!genId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 3000;
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

/** 오답노트 (요약 + 틀린 문제) */
export function useMyNotes(params?: {
  subjectId?: string;
  reasonCode?: string;
}) {
  return useQuery({
    queryKey: ['my-notes', params],
    queryFn: () => fetchMyNotes(params),
  });
}

/** 내 시험 세션 이력 */
export function useMyExamSessions(params?: {
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['my-exam-sessions', params],
    queryFn: () => fetchMyExamSessions(params),
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
