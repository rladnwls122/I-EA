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
  /** 연결 지문 — getById가 함께 내려준다(id/status/content). 없으면 null. */
  passage?: { id: string; status: string; content: any } | null;
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

  /** 상세 조회(GET /questions/:id)에서만 내려옴 — 이 유저가 제출된 세션에서 실제로 풀었는지. */
  solvedByMe?: boolean;
  correctRatePercent?: number | null;
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
  /** 작성자 — 목록/상세 응답에 include됨(id + nickname만). */
  owner?: { id: string; nickname: string };
  /** 문제집 #키워드 태그 — 상세 조회(findOne)에서만 내려옴. */
  tags?: Tag[];
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
  /** OX(참/거짓) 2지선다 스타일 힌트. 저장되는 questionType은 그대로 객관식. */
  ox?: boolean;
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

// ─── 지문(본문) ─────────────────────────────────────────────────────

/** GET /passages/:id 응답 */
export interface Passage {
  id: string;
  title?: string | null;
  /** 지문 본문 — ProseMirror JSON */
  content: any;
  status: QuestionStatus;
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
  /** 정답률 퍼센트(예: 41.2). 표본 부족이면 null */
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

/** GET /auth/me 응답 */
export interface MeProfile {
  id: string;
  email: string;
  nickname: string;
  xp: number;
  level: number;
  title: string;
  xpToNextTier: number | null;
  streak: {
    current: number;
    longest: number;
    boostActive: boolean;
    boostUntil: string | null;
  };
  roles: string[];
}

// ─── 오답노트 / 내 정보 ────────────────────────────────────────────

/** GET /me/notes 응답 */
/** GET /me/notes — 백엔드 실제 응답 shape (me.service.notes와 1:1). */
export interface WrongStat {
  key: string;
  label: string;
  total: number;
  wrong: number;
  wrongRatio: number;
}

export interface ReasonStat {
  code: string;
  label: string;
  count: number;
}

export interface WrongQuestionItem {
  questionId: string;
  subjectId: string;
  subjectName: string;
  questionType: QuestionType;
  /** 발문 — ProseMirror JSON */
  stem: any;
  difficulty: number;
  sessionId: string;
  annotationCount: number;
  annotations: UserQuestionAnnotation[];
}

export interface MyNotesResponse {
  summary: {
    sessions: number;
    solved: number;
    correct: number;
    scorePercent: number;
    bySubject: WrongStat[];
    byType: WrongStat[];
    byReason: ReasonStat[];
  };
  wrongQuestions: WrongQuestionItem[];
}

/** GET /me/exam-sessions 응답 항목 */
export interface MyExamSession {
  id: string;
  /** 문제집 응시(교차 과목)면 null — 대신 workbookTitle 사용 */
  subjectName: string | null;
  workbookId: string | null;
  workbookTitle: string | null;
  status: string;
  submittedAt: string | null;
  total: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
}

// ─── 페이지네이션 ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── 시험 세션 응시 (GET/PUT/POST /exam-sessions/*) ─────────────────

export type SessionStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';

export interface SessionChoice {
  id: string;
  /** IN_PROGRESS(풀이 중)에는 마스킹되어 없음 */
  isCorrect?: boolean;
  /** ProseMirror JSON */
  content?: any;
  explanation?: any;
}

export interface SessionQuestionSnapshot {
  questionType: QuestionType;
  /** ProseMirror JSON */
  stem: any;
  /** 연결 지문(있으면) — ProseMirror JSON */
  passage?: any;
  choices?: SessionChoice[];
  /** ProseMirror JSON. IN_PROGRESS에는 없음 */
  explanation?: any;
  /** 주관식 단답 정답. IN_PROGRESS에는 없음(undefined) */
  correctAnswerText?: string | null;
  /** 조립 시점 풀이 통계 — 결과 화면 정답률 배지용(선택, 구세션 스냅샷엔 없음) */
  totalSolvedCount?: number;
  correctSolvedCount?: number;
  points: number;
  difficulty: number;
}

export interface SessionAnswer {
  selectedChoiceIds: string[] | null;
  answerText: string | null;
  annotations: any;
  /** IN_PROGRESS에는 undefined(마스킹). SUBMITTED에는 boolean|null(서술형 미채점) */
  isCorrect: boolean | null | undefined;
  timeSpentSec: number | null;
}

export interface SessionQuestionItem {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  isHintUsed: boolean;
  hintUsedAt: string | null;
  snapshot: SessionQuestionSnapshot;
  answer: SessionAnswer | null;
}

export interface SessionDetail {
  id: string;
  subject: { id: string; name: string } | null;
  status: SessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  durationSec: number | null;
  questions: SessionQuestionItem[];
}

export interface SubmitAnswerInput {
  selectedChoiceIds?: string[];
  answerText?: string;
  timeSpentSec?: number;
}

export interface SubmitAnswerResult {
  sessionQuestionId: string;
  saved: true;
}

export interface RevealHintResult {
  sessionQuestionId: string;
  hint: string | null;
  isHintUsed: true;
  hintUsedAt: string;
}

export interface RewardBreakdown {
  solveXp: number;
  comboXp: number;
  weakXp: number;
  streakXp: number;
  dailyXp: number;
  boostActive: boolean;
}

export interface SubmitReward {
  xp: number;
  level: number;
  gained: number;
  breakdown: RewardBreakdown;
  streak: { current: number; longest: number; extended: boolean };
  boostGranted: boolean;
}

export interface SubmitSessionResult {
  id: string;
  status: 'SUBMITTED';
  total: number;
  answered: number;
  correct: number;
  scorePercent: number;
  durationSec: number | null;
  reward: SubmitReward | null;
}

export interface SelfGradeReward {
  xp: number;
  level: number;
  gained: number;
}

export interface SelfGradeResult {
  sessionQuestionId: string;
  isCorrect: boolean;
  reward: SelfGradeReward | null;
}

// ─── 문항 리뷰 (별점 + 체감 난이도) ─────────────────────────────────

export interface QuestionReview {
  id: string;
  questionId: string;
  reviewerId: string;
  /** 문제 품질 추천도 1~5 */
  rating: number;
  /** 체감 난이도 1~5 (선택) */
  perceivedDifficulty?: number | null;
  reviewText?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: { id: string; nickname: string };
}

/** GET /questions/:id/reviews 응답 */
export interface ReviewsResponse {
  summary: {
    averageRating: number | null;
    averagePerceivedDifficulty: number | null;
  };
  items: QuestionReview[];
}

// ─── Pick & Mix 장바구니 / 세션 조립 ────────────────────────────────

/** 장바구니 항목 — 표시에 필요한 최소만 담는다(전체는 필요 시 재조회). */
export interface CartItem {
  id: string;
  stemText: string;
  subjectName?: string;
  questionType: string;
}

/** POST /exam-sessions 입력 — 플레이리스트(questionIds) 또는 필터 모드. */
export interface CreateSessionInput {
  questionIds?: string[];
  isReview?: boolean;
  subjectId?: string;
  workbookId?: string;
  questionCount?: number;
  filter?: {
    tagIds?: string[];
    questionTypes?: string[];
    minDifficulty?: number;
    maxDifficulty?: number;
  };
}

/** POST /exam-sessions 응답 */
export interface CreateSessionResult {
  id: string;
  questionCount: number;
  status: 'IN_PROGRESS';
}

/** POST /workbooks/:id/start 응답 — 발행 문항만 담고 제외분은 skippedQuestionIds */
export interface StartWorkbookResult extends CreateSessionResult {
  skippedQuestionIds: string[];
}

// ─── 대시보드 (마일스톤/이어하기) ───────────────────────────────────

/** GET /me/milestones 응답 */
export interface MilestonesResponse {
  summary: {
    xp: number;
    level: number;
    title: string;
    currentStreak: number;
    longestStreak: number;
    xpToNextTier: number | null;
    achievedCount: number;
    totalCount: number;
  };
  milestones: Array<{
    key: string;
    kind: 'LEVEL' | 'STREAK';
    label: string;
    target: number;
    dependsOn: string | null;
    achieved: boolean;
    achievedAt: string | null;
    progress: { current: number; target: number; ratio: number };
    locked: boolean;
  }>;
}

/** GET /me/exam-sessions/active 응답 — 진행 중 세션 없으면 null */
export interface ActiveSession {
  id: string;
  subjectName: string | null;
  workbookTitle: string | null;
  total: number;
  answered: number;
  startedAt: string | null;
}
