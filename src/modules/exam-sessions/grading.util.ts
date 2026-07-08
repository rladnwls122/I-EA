import { PMNode } from '@/common/prosemirror/prosemirror.util';
import { QuestionKind } from '@/common/constants/question';

/** exam_session_questions.snapshot에 보존하는 문항 스냅샷 형태. */
export interface QuestionSnapshot {
  questionType: QuestionKind; // "객관식" | "주관식"
  stem: PMNode;
  choices?: Array<{ id: string; isCorrect?: boolean; content?: unknown; explanation?: unknown }>;
  explanation?: unknown;
  // 주관식 정답(단답 자동채점용). 없으면 서술형 → 자기채점 대상.
  correctAnswerText?: string | null;
  points: number;
  difficulty: number;
}

export interface AnswerPayload {
  selectedChoiceIds?: string[];
  answerText?: string;
}

/** 응시자용으로 정답 정보를 제거한 스냅샷(선지 isCorrect·주관식 정답·해설 마스킹). */
export function maskSnapshot(snapshot: QuestionSnapshot): QuestionSnapshot {
  return {
    ...snapshot,
    choices: snapshot.choices?.map(({ id, content }) => ({ id, content })),
    correctAnswerText: undefined,
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
    const correct = new Set((snapshot.choices ?? []).filter((c) => c.isCorrect).map((c) => c.id));
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
