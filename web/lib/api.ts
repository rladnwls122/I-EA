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
  ReviewSummaryResponse,
  MyExamSession,
  PaginatedResponse,
  SessionDetail,
  SubmitAnswerInput,
  SubmitAnswerResult,
  SubmitSessionResult,
  SelfGradeResult,
  QuestionReview,
  ReviewsResponse,
  CreateSessionInput,
  CreateSessionResult,
  StartWorkbookResult,
  MilestonesResponse,
  ActiveSession,
  Wallet,
  ShopItem,
  LootBoxSummary,
  OpenBoxResult,
  PurchaseResult,
  MyPurchase,
} from './types';
import type { TagCategory } from "./tag-categories";

// ─── 기본 설정 ──────────────────────────────────────────────────────

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

/**
 * 인증이 만료/무효(401)일 때 토큰을 지우고 로그인으로 보낸다.
 * 원래 있던 주소를 callbackUrl로 들고 가 로그인 후 복귀한다.
 * /login·/signup에서는 리다이렉트하지 않는다(로그인 실패 401은 폼이 처리).
 */
export function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path === '/login' || path === '/signup') return;
  localStorage.removeItem('token');
  const callbackUrl = encodeURIComponent(path + window.location.search);
  window.location.replace(`/login?callbackUrl=${callbackUrl}`);
}

/**
 * 인증 토큰을 자동 첨부하는 범용 API 호출 래퍼.
 * 401 응답은 중앙에서 처리 — 만료/무효 토큰으로 인한 "로그인했는데 Unauthorized"를
 * 페이지마다 방치하지 않고 즉시 재로그인 흐름으로 보낸다.
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
    if (res.status === 401) handleUnauthorized();
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

/**
 * 서버측 로그아웃 — 발급된 토큰을 전부 무효화한다.
 *
 * localStorage에서 토큰을 지우는 것만으로는 그 토큰이 여전히 유효하다(JWT는
 * 만료 전까지 서버가 받아준다). 공용 PC나 유출 상황에서 실제로 끊으려면
 * 서버가 token_version을 올려줘야 한다.
 */
export function logoutAll() {
  return apiFetch<{ revoked: boolean; tokenVersion: number }>('/auth/logout-all', {
    method: 'POST',
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

/** 지문 생성 — content는 ProseMirror doc JSON. */
export function createPassage(content: any) {
  return apiFetch<Passage>('/passages', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/** 지문 발행 */
export function publishPassage(id: string) {
  return apiFetch<Passage>(`/passages/${id}/publish`, { method: 'POST' });
}

/**
 * 지문 수정 — 이미 저장된 지문의 내용만 갈아 끼운다.
 * 이게 없어서 캔버스 저장이 매번 `createPassage`를 불렀고, 기존 문제집을 열어 저장할
 * 때마다 같은 지문이 하나씩 복제됐다(#41 Phase 3).
 */
export function updatePassage(id: string, content: any) {
  return apiFetch<Passage>(`/passages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
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

// ─── 문제집 ─────────────────────────────────────────────────────────

/** 문제집 목록 조회 */
export function fetchWorkbooks(params?: {
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
}) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.visibility) query.set('visibility', params.visibility);
  if (params?.search) query.set('q', params.search);
  if (params?.sort) query.set('sort', params.sort);
  if (params?.mine) query.set('mine', 'true');
  if (params?.examType) query.set('examType', params.examType);
  if (params?.examCategory) query.set('examCategory', params.examCategory);
  if (params?.subjectIds?.length) query.set('subjectIds', params.subjectIds.join(','));
  else if (params?.subjectId) query.set('subjectId', params.subjectId);

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
  /** 문제집 #키워드 태그 ID */
  tagIds?: string[];
}) {
  return apiFetch<Workbook>('/workbooks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** 문제집 수정. tagIds를 주면 문제집 #키워드 매핑을 통째로 교체한다. */
export function updateWorkbook(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    coverImageUrl: string;
    visibility: string;
    tagIds: string[];
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

// ─── AI 생성 (비동기 파이프라인) ────────────────────────────────────
//
// 캔버스는 SSE 채팅을 쓰므로 지금 이 두 함수를 부르는 화면은 없다. 그래도 남긴다 —
// `POST /ai-generations`가 시험별 형식 템플릿(#43)이 얹힌 정본 생성 경로이고,
// 서버 DTO와 1:1로 맞춘 계약이라 지웠다 되살리면 같은 걸 다시 쓰게 된다(types.ts 주석 참고).

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

// ─── 미디어(이미지) 업로드 ──────────────────────────────────────────
//
// 백엔드 파이프라인은 오래전부터 완비돼 있었는데 프런트 호출부가 한 곳도 없었다(#41).
// 흐름은 3단계이고, **2단계는 우리 API가 아니라 S3로 직접 보낸다**:
//   1) POST /media-assets/presign  → { url, fields, publicUrl }
//   2) url 로 multipart/form-data POST (fields 전부 + 마지막에 file)  ← S3
//   3) (선택) POST /media-assets   → media_assets 행 등록
//
// PUT이 아니라 POST인 이유는 서버가 policy로 Content-Type과 크기를 강제하기 위해서다
// (s3.service.ts 주석 참고). fields 순서도 규약이라 file을 마지막에 append 해야 한다.

/** presign이 허용하는 이미지 MIME — 백엔드 media.constants와 같은 목록이어야 한다. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 업로드 최대 크기 5MB — 백엔드 MAX_UPLOAD_BYTES와 같아야 한다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface PresignResult {
  url: string;
  fields: Record<string, string>;
  key: string;
  publicUrl: string;
  expiresInSec: number;
}

/** 1단계 — presigned POST 발급. contentLength는 policy로 정확히 강제되므로 실제 크기여야 한다. */
export function presignMedia(contentType: AllowedImageType, contentLength: number) {
  return apiFetch<PresignResult>('/media-assets/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType, contentLength }),
  });
}

/**
 * 3단계(선택) — media_assets 행 등록.
 * `passageId`와 `questionId` 중 **정확히 하나**가 필요하고 그 대상이 이미 존재해야 한다.
 * 그래서 아직 저장 안 된 새 카드에서는 부를 수 없다 — 업로드/삽입 자체는 이것 없이 동작한다.
 */
export function registerMediaAsset(data: {
  storageUrl: string;
  assetType?: 'IMAGE';
  questionId?: string;
  passageId?: string;
  widthPx?: number;
  heightPx?: number;
}) {
  return apiFetch<{ id: string; storageUrl: string }>('/media-assets', {
    method: 'POST',
    body: JSON.stringify({ assetType: 'IMAGE', ...data }),
  });
}

/** 업로드 전에 브라우저에서 거르는 검증 — 서버 400을 기다리지 않고 즉시 사유를 준다. */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    return 'PNG · JPEG · WebP 이미지만 올릴 수 있어요.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `이미지는 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB 이하만 올릴 수 있어요.`;
  }
  if (file.size < 1) return '빈 파일은 올릴 수 없어요.';
  return null;
}

/**
 * 1~2단계를 묶은 업로드. 성공하면 공개 URL을 돌려준다(에디터 image 노드의 src).
 * 실패는 사용자에게 그대로 보여줄 수 있는 한국어 메시지로 throw 한다.
 */
export async function uploadImage(file: File): Promise<{ publicUrl: string; key: string }> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const presigned = await presignMedia(file.type as AllowedImageType, file.size);

  const form = new FormData();
  // policy 필드를 전부 싣고 file은 **마지막에** — S3 POST 규약.
  Object.entries(presigned.fields).forEach(([k, v]) => form.append(k, v));
  form.append('file', file);

  // 우리 API가 아니라 S3로 직접 보낸다 — apiFetch(Authorization·JSON 헤더)를 쓰면 안 된다.
  // Content-Type은 브라우저가 boundary와 함께 붙이도록 지정하지 않는다.
  const res = await fetch(presigned.url, { method: 'POST', body: form });
  if (!res.ok) {
    // S3는 XML로 에러를 준다. 원문을 그대로 노출하지 않고 상태 코드만 남긴다.
    throw new Error(`이미지 업로드에 실패했어요. (S3 ${res.status})`);
  }

  return { publicUrl: presigned.publicUrl, key: presigned.key };
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

/** 복습 요약 — due 배지용 경량 카운트 (전량 로드 없음) */
export function fetchReviewSummary() {
  return apiFetch<ReviewSummaryResponse>('/me/review-summary');
}

/** 태그 목록 (category로 선택 필터) */
export function fetchTags(category?: TagCategory) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<Tag[]>(`/tags${qs}`);
}

/**
 * 태그 생성 — '키워드'는 모든 유저, 그 외 카테고리는 CREATOR/ADMIN.
 * 정본 밖 카테고리는 백엔드가 400으로 거절한다 — 타입으로 미리 막는다.
 */
export function createTag(name: string, category: TagCategory) {
  return apiFetch<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify({ name, category }),
  });
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

// ─── 상점 / 코인 / 상자 ────────────────────────────────────────────

/** 내 지갑(코인/인벤토리/코스메틱/미개봉 상자 수) 조회 */
export function fetchWallet() {
  return apiFetch<Wallet>('/me/wallet');
}

/** 상점 아이템 목록 조회 */
export function fetchShopItems() {
  return apiFetch<ShopItem[]>('/shop/items');
}

/** 내 미개봉 상자 목록 조회 */
export function fetchLootBoxes() {
  return apiFetch<LootBoxSummary[]>('/loot-boxes');
}

/** 상자 개봉 — 코인 보상 지급 */
export function openLootBox(id: string) {
  return apiFetch<OpenBoxResult>(`/loot-boxes/${id}/open`, {
    method: 'POST',
  });
}

/** 상점 아이템 구매 */
export function purchaseItem(itemKey: string) {
  return apiFetch<PurchaseResult>('/shop/purchase', {
    method: 'POST',
    body: JSON.stringify({ itemKey }),
  });
}

/** 보유 코스메틱 착용(칭호/닉네임 색) */
export function equipCosmetic(itemKey: string) {
  return apiFetch<{ equipped: string }>('/me/cosmetics/equip', {
    method: 'POST',
    body: JSON.stringify({ itemKey }),
  });
}

/** 내 구매 이력 조회 */
export function fetchMyPurchases() {
  return apiFetch<MyPurchase[]>('/me/purchases');
}
