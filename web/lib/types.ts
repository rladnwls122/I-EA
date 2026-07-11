/**
 * Q-Idea 프론트엔드 핵심 타입 정의
 * 백엔드 Prisma 스키마와 1:1 대응
 */

// ─── 과목 (세부과목) ────────────────────────────────────────────────

export interface Subject {
  id: string;
  /** 시험 유형 (e.g. 수능, 모의고사) */
  examType: string;
  /** 대분류 (e.g. 국어, 수학, 영어) */
  examCategory: string;
  /** 세부과목명 (e.g. 문학, 언매) */
  name: string;
  /** 정렬 순서 */
  sortOrder: number;
  /** 활성 여부 */
  isActive: boolean;
}

// ─── 태그 ───────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  /** 태그명 */
  name: string;
  /** 태그 분류 (e.g. 유형, 개념) */
  category: string;
}

// ─── 문제 ───────────────────────────────────────────────────────────

/** 문제 유형 — VARCHAR, enum 아님 */
export type QuestionType = '객관식' | '주관식';

/** 문제 상태 */
export type QuestionStatus = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

export interface Question {
  id: string;
  creatorId: string;
  /** AI 생성 ID (수동 작성이면 null) */
  generationId?: string | null;
  subjectId: string;
  passageId?: string | null;
  questionType: QuestionType;
  /** 문제 본문 — ProseMirror JSON */
  stem: any;
  /** 선택지 배열 — 객관식 전용, ProseMirror JSON */
  choices?: any | null;
  /** 해설 — ProseMirror JSON */
  explanation?: any | null;
  /** 주관식 정답 텍스트 (단답형 자동 채점용) */
  correctAnswerText?: string | null;
  /** 난이도 1~5 */
  difficulty: number;
  /** 배점 */
  points: number;
  /** 문제 상태 */
  status: QuestionStatus;
  /** 추가 메타데이터 (JSON) */
  metadata?: any | null;
  /** 힌트 내용 */
  hintContent?: any | null;

  // ── 통계 캐시 ──
  totalSolvedCount: number;
  correctSolvedCount: number;
  viewCount: number;
  totalTimeSpentSec: number;
  timedSolvedCount: number;

  /** 전문 검색용 평문 캐시 */
  searchText?: string | null;

  createdAt: string;
  updatedAt: string;

  // ── 관계 (선택적 포함) ──
  subject?: Subject;
  tags?: Tag[];
}

// ─── 문제집 ─────────────────────────────────────────────────────────

/** 문제집 공개 범위 */
export type WorkbookVisibility = 'PRIVATE' | 'PUBLIC';

export interface Workbook {
  id: string;
  ownerId: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  visibility: WorkbookVisibility;
  /** 포크 원본 ID */
  forkedFromId?: string | null;
  viewCount: number;
  forkCount: number;
  questionCount: number;
  attemptCount: number;
  /** 총 점수 비율 합산 */
  scoreSumPercent: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // ── 관계 ──
  questions?: WorkbookQuestion[];
}

export interface WorkbookQuestion {
  workbookId: string;
  questionId: string;
  /** 표시 순서 */
  displayOrder: number;
  /** 원본 문제집 ID (포크 시) */
  sourceWorkbookId?: string | null;
  addedAt: string;

  // ── 관계 ──
  question?: Question;
}

// ─── AI 생성 ────────────────────────────────────────────────────────

/** AI 생성 상태 */
export type AiGenerationStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/** POST /ai-generations 요청 바디 — CreateGenerationDto와 1:1 대응 */
export interface CreateAiGenerationInput {
  subjectId: string;
  /** 자연어 출제 지시 (주제/조건 등), 최대 2000자 */
  prompt: string;
  /** 난이도 1~5 */
  difficulty: number;
  /** 생성할 문항 수 1~20 */
  questionCount: number;
  /** 지문(passage)을 함께 생성할지 여부 */
  includePassage?: boolean;
  /** 선호 문제 유형(힌트) */
  questionType?: QuestionType;
}

/** POST /ai-generations 응답 (즉시 202) */
export interface AiGenerationCreated {
  id: string;
  status: AiGenerationStatus;
  createdAt: string;
}

/** GET /ai-generations/:id 응답 (폴링용) */
export interface AiGeneration {
  id: string;
  status: AiGenerationStatus;
  /** 사용된 LLM 모델명 */
  model: string;
  createdAt: string;

  // ── 생성 결과 (COMPLETED 시) ──
  passageIds: string[];
  questions: Pick<Question, 'id' | 'questionType' | 'status'>[];
}

// ─── 문제 통계 ──────────────────────────────────────────────────────

export interface ChoiceDistributionItem {
  /** 선택지 인덱스 (0-based) */
  index: number;
  /** 선택 횟수 */
  count: number;
  /** 정답 여부 */
  isCorrect: boolean;
}

export interface QuestionStats {
  /** 총 풀이 수 */
  totalSolved: number;
  /** 정답률 (0~1, 데이터 없으면 null) */
  correctRate: number | null;
  /** 평균 풀이 시간(초, 데이터 없으면 null) */
  avgTimeSpentSec: number | null;
  /** 선택지별 분포 (객관식) */
  choiceDistribution: ChoiceDistributionItem[];
}

// ─── 댓글 ───────────────────────────────────────────────────────────

export interface QuestionComment {
  id: string;
  questionId: string;
  authorId: string;
  /** 부모 댓글 ID (대댓글) */
  parentCommentId?: string | null;
  /** 댓글 본문 */
  content: string;
  createdAt: string;
  updatedAt: string;

  // ── 관계 ──
  author?: { id: string; nickname: string };
  replies?: QuestionComment[];
}

// ─── 오답노트 주석 ──────────────────────────────────────────────────

export interface UserQuestionAnnotation {
  id: string;
  userId: string;
  questionId: string;
  /** 주석 대상 (e.g. 'stem', 'choice', 'explanation') */
  target: string;
  /** 대상 내 세부 ID */
  targetId?: string | null;
  /** 마크 스타일 (e.g. 'highlight', 'underline') */
  markStyle: string;
  /** 마크 색상 */
  color: string;
  /** 선택된 텍스트 */
  selectedText?: string | null;
  /** 선택 범위 (JSON) */
  selectionRange?: any | null;
  /** 오답 원인 코드 (통계용) */
  reasonCode?: string | null;
  /** 메모 텍스트 */
  memoText?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── 인증 ───────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string;
}

export interface User {
  id: string;
  email: string;
  nickname: string;
  role: string;
}

// ─── 오답노트 / 내 정보 ────────────────────────────────────────────

/** GET /me/notes 응답 */
export interface MyNotesResponse {
  summary: {
    bySubject: Record<string, number>;
    byType: Record<string, number>;
    byReason: Record<string, number>;
  };
  wrongQuestions: {
    question: Question;
    annotations: UserQuestionAnnotation[];
  }[];
}

/** GET /me/exam-sessions 응답 항목 */
export interface MyExamSession {
  id: string;
  subjectId: string;
  status: string;
  totalQuestions: number;
  correctCount: number;
  score: number;
  startedAt: string;
  submittedAt?: string | null;
}

// ─── 페이지네이션 ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
