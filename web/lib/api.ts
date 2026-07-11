/**
 * Q-Idea API 클라이언트
 *
 * 모든 엔드포인트 함수는 타입이 지정되어 있으며,
 * 인증 토큰은 localStorage에서 자동으로 첨부됩니다.
 */

import type {
  Subject,
  Tag,
  Question,
  Passage,
  QuestionStatus,
  Workbook,
  WorkbookQuestion,
  AiGeneration,
  AiGenerationCreated,
  CreateAiGenerationInput,
  QuestionStats,
  QuestionComment,
  UserQuestionAnnotation,
  AuthResponse,
  MeProfile,
  MyNotesResponse,
  MyExamSession,
  PaginatedResponse,
  SessionDetail,
  SubmitAnswerInput,
  SubmitAnswerResult,
  RevealHintResult,
  SubmitSessionResult,
  SelfGradeResult,
  QuestionReview,
  ReviewsResponse,
  CreateSessionInput,
  CreateSessionResult,
  StartWorkbookResult,
  MilestonesResponse,
  ActiveSession,
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

/** 현재 로그인 사용자 정보(xp/level/스트릭 포함) */
export function fetchMe() {
  return apiFetch<MeProfile>('/auth/me');
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
  subjectIds?: string[];
  status?: QuestionStatus;
  questionType?: string;
  difficulty?: number;
  search?: string;
  sort?: 'latest' | 'popular';
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.subjectIds?.length) query.set('subjectIds', params.subjectIds.join(','));
  else if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.status) query.set('status', params.status);
  if (params?.questionType)
    query.set('questionType', params.questionType);
  if (params?.difficulty)
    query.set('difficulty', String(params.difficulty));
  // 백엔드 QueryQuestionDto의 검색 파라미터명은 q(whitelist라 search는 400).
  if (params?.search) query.set('q', params.search);
  if (params?.sort) query.set('sort', params.sort);

  const qs = query.toString();
  return apiFetch<PaginatedResponse<Question>>(
    `/questions${qs ? `?${qs}` : ''}`,
  );
}

/** 문제 상세 조회 */
export function fetchQuestion(id: string) {
  return apiFetch<Question>(`/questions/${id}`);
}

/** 지문(본문) 상세 — content(ProseMirror) 포함 */
export function fetchPassage(id: string) {
  return apiFetch<Passage>(`/passages/${id}`);
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

/** 문제 수정. tagIds를 주면 question_tags 매핑을 통째로 교체한다. */
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
  > & { tagIds?: string[] },
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

/**
 * 선택지 재생성 (AI) — 동기 호출.
 * 요청은 RegenerateChoicesDto와 1:1 (stemText, choiceCount=정답 포함 전체 선지 수, difficulty?).
 * 응답은 정답 1개를 포함한 선지 전체 집합(각 {content, isCorrect}).
 */
export function regenerateChoices(
  id: string,
  data: { stemText: string; choiceCount: number; difficulty?: number },
) {
  return apiFetch<{
    choices: { content: string; isCorrect: boolean; explanation?: string }[];
    persisted: boolean;
  }>(`/questions/${id}/choices/regenerate`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── 문제집 ─────────────────────────────────────────────────────────

/** 문제집 목록 조회 */
export function fetchWorkbooks(params?: {
  page?: number;
  limit?: number;
  visibility?: string;
  search?: string;
  sort?: 'popular' | 'recent';
  mine?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.visibility) query.set('visibility', params.visibility);
  if (params?.search) query.set('q', params.search);
  if (params?.sort) query.set('sort', params.sort);
  if (params?.mine) query.set('mine', 'true');

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
  /** 장바구니 일괄 담기 — 백엔드 CreateWorkbookDto가 벌크 지원 */
  questionIds?: string[];
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

/** 문제집 시작 (시험 세션 생성). 응답 id가 세션 id다 */
export function startWorkbook(id: string) {
  return apiFetch<StartWorkbookResult>(`/workbooks/${id}/start`, {
    method: 'POST',
  });
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
export function createAiGeneration(data: CreateAiGenerationInput) {
  return apiFetch<AiGenerationCreated>('/ai-generations', {
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
  examType?: string;
  examCategory?: string;
  subjectId?: string;
}) {
  const query = new URLSearchParams();
  if (params?.examType) query.set('examType', params.examType);
  if (params?.examCategory) query.set('examCategory', params.examCategory);
  if (params?.subjectId) query.set('subjectId', params.subjectId);

  const qs = query.toString();
  return apiFetch<MyNotesResponse>(
    `/me/notes${qs ? `?${qs}` : ''}`,
  );
}

/** 태그 목록 (category로 선택 필터) */
export function fetchTags(category?: string) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<Tag[]>(`/tags${qs}`);
}

/** 내 시험 세션 이력 조회 */
export function fetchMyExamSessions() {
  return apiFetch<MyExamSession[]>('/me/exam-sessions');
}

// ─── 시험 세션 응시 ─────────────────────────────────────────────────

/** 세션 응시 데이터 조회 (진행 중이면 정답 마스킹, 제출 완료면 공개) */
export function fetchSession(id: string) {
  return apiFetch<SessionDetail>(`/exam-sessions/${id}`);
}

/** 문항 답안 저장(OMR) — autosave용. upsert라 여러 번 호출해도 안전 */
export function submitSessionAnswer(
  sessionQuestionId: string,
  data: SubmitAnswerInput,
) {
  return apiFetch<SubmitAnswerResult>(
    `/exam-sessions/questions/${sessionQuestionId}/answer`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

/** 힌트 열람 (힌트 없는 문항이면 404) */
export function revealSessionHint(sessionQuestionId: string) {
  return apiFetch<RevealHintResult>(
    `/exam-sessions/questions/${sessionQuestionId}/hint`,
    { method: 'POST' },
  );
}

/** 세션 최종 제출 — 채점 집계 + XP 적립 */
export function submitSession(id: string) {
  return apiFetch<SubmitSessionResult>(`/exam-sessions/${id}/submit`, {
    method: 'POST',
  });
}

/** 서술형 자기채점 확정(SUBMITTED 세션에서만 호출 가능) */
export function selfGradeSessionQuestion(
  sessionQuestionId: string,
  isCorrect: boolean,
) {
  return apiFetch<SelfGradeResult>(
    `/exam-sessions/questions/${sessionQuestionId}/self-grade`,
    {
      method: 'PUT',
      body: JSON.stringify({ isCorrect }),
    },
  );
}

// ─── 문항 리뷰 ─────────────────────────────────────────────────────

/** 문제별 리뷰 목록 + 평점 요약 */
export function fetchReviews(questionId: string) {
  return apiFetch<ReviewsResponse>(`/questions/${questionId}/reviews`);
}

/** 내 리뷰 등록/수정 (사용자당 1건 upsert) */
export function upsertReview(
  questionId: string,
  data: { rating: number; perceivedDifficulty?: number; reviewText?: string },
) {
  return apiFetch<QuestionReview>(`/questions/${questionId}/reviews`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── 세션 조립 (Pick & Mix / 복습) ──────────────────────────────────

/** 세션 조립 — questionIds(플레이리스트) 또는 필터 모드 */
export function createSession(data: CreateSessionInput) {
  return apiFetch<CreateSessionResult>('/exam-sessions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── 대시보드 ──────────────────────────────────────────────────────

/** 마일스톤 대시보드 (xp/레벨/스트릭 요약 + 진행률) */
export function fetchMilestones() {
  return apiFetch<MilestonesResponse>('/me/milestones');
}

/** 진행 중 세션(이어하기 배너). 없으면 null */
export function fetchActiveSession() {
  return apiFetch<ActiveSession | null>('/me/exam-sessions/active');
}
