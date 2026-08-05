import { PMNode } from '@/common/prosemirror/prosemirror.util';
import { QuestionKind } from '@/common/constants/question';
import { RubricCriterion } from '@/common/constants/rubric';

/** 스냅샷에 실리는 지문 하나. */
export interface SnapshotPassage {
  content: PMNode;
  /** 세트에서 이 지문을 부르는 이름 — 수능 "(가)", 토익 "Passage 1". 단일 지문이면 없다. */
  label?: string;
}

/** exam_session_questions.snapshot에 보존하는 문항 스냅샷 형태. */
export interface QuestionSnapshot {
  questionType: QuestionKind; // "객관식" | "주관식"
  stem: PMNode;
  /**
   * 함께 읽어야 하는 지문 전체(#43). 세트 문항이 지문을 공유해도 스냅샷엔
   * 각자 통째로 복사해 둔다(원본이 바뀌어도 이미 시작한 세션엔 영향 없게).
   *
   * 수능 (가)(나)·토익 Part 7 double/triple은 문항이 두세 지문을 **교차 참조**해야
   * 풀린다. 예전엔 `passage` 하나만 실어서 근거 지문 외의 나머지가 응시자에게
   * 안 보였고, 통합 추론 문항은 사실상 풀 수 없었다.
   */
  passages?: SnapshotPassage[];
  /**
   * @deprecated 단일 지문 시절 형태. 새로 쓰지 않는다 — 읽기만 지원한다.
   * 이 필드가 박힌 스냅샷이 이미 DB에 있고, 스냅샷은 정의상 소급 수정하지 않는다.
   * 읽을 때는 `snapshotPassages()`를 써서 두 형태를 한 번에 처리할 것.
   */
  passage?: PMNode;
  choices?: Array<{ id: string; isCorrect?: boolean; content?: unknown; explanation?: unknown }>;
  explanation?: unknown;
  // 주관식 정답(단답 자동채점용). 없으면 서술형 → 자기채점 대상.
  correctAnswerText?: string | null;
  /**
   * 서술형 채점기준표(#43 gap 8). 있으면 자기채점이 정오 2지선다 대신 기준별 부분점수로 바뀐다.
   * 스냅샷에 실어야 하는 이유는 다른 필드와 같다 — 세션 시작 뒤 출제자가 기준을 고쳐도
   * 이미 응시한 사람의 채점 근거는 그대로여야 한다. 구세션 스냅샷엔 없다(undefined).
   */
  rubric?: RubricCriterion[] | null;
  points: number;
  difficulty: number;
  // 조립 시점의 풀이 통계 — 결과 화면 정답률 배지용(선택). 스냅샷 원칙대로 이후 변동과 무관.
  totalSolvedCount?: number;
  correctSolvedCount?: number;
}

/**
 * 스냅샷에서 지문 목록을 꺼낸다 — 신형(`passages`)과 구형(`passage`)을 모두 받는다.
 *
 * 스냅샷은 소급 수정하지 않는 기록이라 두 형태가 영원히 공존한다. 소비처마다
 * `?? []`와 삼항으로 분기하면 한 곳을 빼먹는 순간 그 화면만 지문이 사라진다.
 * 읽는 입구를 여기 하나로 모은다.
 */
export function snapshotPassages(snapshot: QuestionSnapshot): SnapshotPassage[] {
  if (snapshot.passages?.length) return snapshot.passages;
  return snapshot.passage ? [{ content: snapshot.passage }] : [];
}

export interface AnswerPayload {
  selectedChoiceIds?: string[];
  answerText?: string;
}

/** 응시자용으로 정답 정보를 제거한 스냅샷(선지 isCorrect·주관식 정답·채점기준·해설 마스킹). */
export function maskSnapshot(snapshot: QuestionSnapshot): QuestionSnapshot {
  return {
    ...snapshot,
    choices: snapshot.choices?.map(({ id, content }) => ({ id, content })),
    correctAnswerText: undefined,
    // 채점기준표는 모범답안을 항목별로 쪼개 놓은 것이라 사실상 정답이다.
    // 응시 중에 보이면 그대로 베껴 쓰면 된다 — 해설과 같은 등급으로 가린다.
    rubric: undefined,
    explanation: undefined, // 진행 중에는 해설도 숨긴다
  };
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * 스냅샷과 제출 답안을 대조해 정오를 판정한다.
 * - 객관식: 정답 선지 집합 == 선택 집합 (부분점수 없음)
 * - 주관식(단답, correctAnswerText 있음): 정규화 문자열 일치
 * - 주관식(서술형, correctAnswerText 없음): null → 자기채점 대상
 */
export function grade(snapshot: QuestionSnapshot, answer: AnswerPayload): boolean | null {
  if (snapshot.questionType === '객관식') {
    // choices가 배열이 아닌 형태로 저장된 손상 스냅샷이어도 채점이 500으로 죽지 않게 방어.
    const choices = Array.isArray(snapshot.choices) ? snapshot.choices : [];
    const correct = new Set(choices.filter((c) => c.isCorrect).map((c) => c.id));
    const selected = new Set(answer.selectedChoiceIds ?? []);
    if (correct.size === 0) return null;
    // 정답 집합과 선택 집합이 완전히 일치해야 정답(부분점수 없음).
    return correct.size === selected.size && [...correct].every((id) => selected.has(id));
  }

  // 주관식: 단답 정답이 있으면 자동 채점, 없으면 서술형(자기채점).
  const expected = snapshot.correctAnswerText;
  if (!expected) return null;
  return norm(expected) === norm(answer.answerText ?? '');
}

/** 서술형(자기채점 대상) 여부 — 주관식이면서 정답 텍스트가 없는 문항. */
export function isSelfGradable(snapshot: QuestionSnapshot): boolean {
  return snapshot.questionType === '주관식' && !snapshot.correctAnswerText;
}
