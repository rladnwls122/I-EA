/**
 * Q-Idea API 클라이언트
 *
 * 모든 엔드포인트 함수는 타입이 지정되어 있으며,
 * 인증 토큰은 localStorage에서 자동으로 첨부됩니다.
 */

import type {
  Subject,
  Question,
  QuestionStatus,
  Workbook,
  WorkbookQuestion,
  AiGeneration,
  QuestionStats,
  QuestionComment,
  UserQuestionAnnotation,
  AuthResponse,
  MyNotesResponse,
  MyExamSession,
  PaginatedResponse,
} from './types';

// ─── 기본 설정 ──────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * 인증 토큰을 자동 첨부하는 범용 API 호출 래퍼
 */
async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('token')
      : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `API 오류: ${res.status}`);
  }

  return res.json();
}

// ─── 인증 ───────────────────────────────────────────────────────────

/** 로그인 */
export function login(email: string, password: string) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/** 회원가입 */
export function register(
  email: string,
  password: string,
  nickname: string,
) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, nickname }),
  });
}

// ─── 과목 ───────────────────────────────────────────────────────────

/** 전체 과목 목록 조회 */
export function fetchSubjects() {
  return apiFetch<Subject[]>('/subjects');
}

/** 과목 상세 조회 */
export function fetchSubject(id: string) {
  return apiFetch<Subject>(`/subjects/${id}`);
}

// ─── 문제 ───────────────────────────────────────────────────────────

/** 문제 목록 조회 (페이지네이션 + 필터) */
export function fetchQuestions(params?: {
  page?: number;
  limit?: number;
  subjectId?: string;
  status?: QuestionStatus;
  questionType?: string;
  difficulty?: number;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.status) query.set('status', params.status);
  if (params?.questionType)
    query.set('questionType', params.questionType);
  if (params?.difficulty)
    query.set('difficulty', String(params.difficulty));
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  return apiFetch<PaginatedResponse<Question>>(
    `/questions${qs ? `?${qs}` : ''}`,
  );
}

/** 문제 상세 조회 */
export function fetchQuestion(id: string) {
  return apiFetch<Question>(`/questions/${id}`);
}

/** 문제 생성 */
export function createQuestion(
  data: Partial<
    Omit<
      Question,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'totalSolvedCount'
      | 'correctSolvedCount'
      | 'viewCount'
      | 'totalTimeSpentSec'
      | 'timedSolvedCount'
    >
  >,
) {
  return apiFetch<Question>('/questions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 문제 수정 */
export function updateQuestion(
  id: string,
  data: Partial<
    Omit<
      Question,
      | 'id'
      | 'creatorId'
      | 'createdAt'
      | 'updatedAt'
      | 'totalSolvedCount'
      | 'correctSolvedCount'
      | 'viewCount'
      | 'totalTimeSpentSec'
      | 'timedSolvedCount'
    >
  >,
) {
  return apiFetch<Question>(`/questions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** 문제 삭제 */
export function deleteQuestion(id: string) {
  return apiFetch<void>(`/questions/${id}`, {
    method: 'DELETE',
  });
}

/** 문제 출판 (상태를 PUBLISHED로 변경) */
export function publishQuestion(id: string) {
  return apiFetch<Question>(`/questions/${id}/publish`, {
    method: 'POST',
  });
}

/** 문제 통계 조회 */
export function fetchQuestionStats(id: string) {
  return apiFetch<QuestionStats>(`/questions/${id}/stats`);
}

/** 선택지 재생성 (AI) — 동기 호출, 10초 타임아웃 */
export function regenerateChoices(
  id: string,
  data: { stemText: string; correctChoiceText: string; choiceCount: number },
) {
  return apiFetch<{ distractors: string[] }>(
    `/questions/${id}/choices/regenerate`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

// ─── 문제집 ─────────────────────────────────────────────────────────

/** 문제집 목록 조회 */
export function fetchWorkbooks(params?: {
  page?: number;
  limit?: number;
  visibility?: string;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.visibility) query.set('visibility', params.visibility);
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  return apiFetch<PaginatedResponse<Workbook>>(
    `/workbooks${qs ? `?${qs}` : ''}`,
  );
}

/** 문제집 상세 조회 */
export function fetchWorkbook(id: string) {
  return apiFetch<Workbook>(`/workbooks/${id}`);
}

/** 문제집 생성 */
export function createWorkbook(data: {
  title: string;
  description?: string;
  coverImageUrl?: string;
  visibility?: string;
}) {
  return apiFetch<Workbook>('/workbooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 문제집 수정 */
export function updateWorkbook(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    coverImageUrl: string;
    visibility: string;
  }>,
) {
  return apiFetch<Workbook>(`/workbooks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/** 문제집 삭제 */
export function deleteWorkbook(id: string) {
  return apiFetch<void>(`/workbooks/${id}`, {
    method: 'DELETE',
  });
}

/** 문제집 포크 */
export function forkWorkbook(id: string) {
  return apiFetch<Workbook>(`/workbooks/${id}/fork`, {
    method: 'POST',
  });
}

/** 문제집 시작 (시험 세션 생성) */
export function startWorkbook(id: string) {
  return apiFetch<{ examSessionId: string }>(
    `/workbooks/${id}/start`,
    {
      method: 'POST',
    },
  );
}

/** 문제집에 문제 추가 */
export function addQuestionToWorkbook(
  workbookId: string,
  data: { questionId: string; displayOrder?: number },
) {
  return apiFetch<WorkbookQuestion>(
    `/workbooks/${workbookId}/questions`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/** 문제집에서 문제 제거 */
export function removeQuestionFromWorkbook(
  workbookId: string,
  questionId: string,
) {
  return apiFetch<void>(
    `/workbooks/${workbookId}/questions/${questionId}`,
    {
      method: 'DELETE',
    },
  );
}

/** 문제집 문제 순서 변경 */
export function reorderWorkbookQuestions(
  workbookId: string,
  questionIds: string[],
) {
  return apiFetch<void>(
    `/workbooks/${workbookId}/questions/reorder`,
    {
      method: 'PATCH',
      body: JSON.stringify({ questionIds }),
    },
  );
}

// ─── AI 생성 ────────────────────────────────────────────────────────

/** AI 문제 생성 요청 (비동기, BullMQ 큐) */
export function createAiGeneration(data: {
  subjectId: string;
  inputParams: Record<string, any>;
}) {
  return apiFetch<AiGeneration>('/ai-generations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** AI 생성 상태 조회 (폴링용) */
export function fetchAiGeneration(id: string) {
  return apiFetch<AiGeneration>(`/ai-generations/${id}`);
}

// ─── 댓글 ───────────────────────────────────────────────────────────

/** 문제 댓글 목록 조회 */
export function fetchComments(questionId: string) {
  return apiFetch<QuestionComment[]>(
    `/questions/${questionId}/comments`,
  );
}

/** 문제 댓글 작성 */
export function createComment(
  questionId: string,
  data: { content: string; parentCommentId?: string },
) {
  return apiFetch<QuestionComment>(
    `/questions/${questionId}/comments`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

// ─── 오답노트 주석 ──────────────────────────────────────────────────

/** 문제 주석 목록 조회 */
export function fetchAnnotations(questionId: string) {
  return apiFetch<UserQuestionAnnotation[]>(
    `/questions/${questionId}/annotations`,
  );
}

/** 문제 주석 생성 */
export function createAnnotation(
  questionId: string,
  data: Omit<
    UserQuestionAnnotation,
    'id' | 'userId' | 'questionId' | 'createdAt' | 'updatedAt'
  >,
) {
  return apiFetch<UserQuestionAnnotation>(
    `/questions/${questionId}/annotations`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/** 주석 수정 */
export function updateAnnotation(
  annotationId: string,
  data: Partial<
    Omit<
      UserQuestionAnnotation,
      'id' | 'userId' | 'questionId' | 'createdAt' | 'updatedAt'
    >
  >,
) {
  return apiFetch<UserQuestionAnnotation>(
    `/annotations/${annotationId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

/** 주석 삭제 */
export function deleteAnnotation(annotationId: string) {
  return apiFetch<void>(`/annotations/${annotationId}`, {
    method: 'DELETE',
  });
}

// ─── 내 정보 (me) ───────────────────────────────────────────────────

/** 오답노트 조회 (요약 + 틀린 문제 + 주석) */
export function fetchMyNotes(params?: {
  subjectId?: string;
  reasonCode?: string;
}) {
  const query = new URLSearchParams();
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.reasonCode)
    query.set('reasonCode', params.reasonCode);

  const qs = query.toString();
  return apiFetch<MyNotesResponse>(
    `/me/notes${qs ? `?${qs}` : ''}`,
  );
}

/** 내 시험 세션 이력 조회 */
export function fetchMyExamSessions(params?: {
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiFetch<PaginatedResponse<MyExamSession>>(
    `/me/exam-sessions${qs ? `?${qs}` : ''}`,
  );
}
