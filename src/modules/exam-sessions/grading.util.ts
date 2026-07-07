import { QuestionType } from '@prisma/client';
import { PMNode } from '@/common/prosemirror/prosemirror.util';

/** exam_session_questions.snapshot에 보존하는 문항 스냅샷 형태. */
export interface QuestionSnapshot {
  questionType: QuestionType;
  stem: PMNode;
  choices?: Array<{ id: string; isCorrect?: boolean; content?: unknown; explanation?: unknown }>;
  explanation?: unknown;
  points: number;
  difficulty: number;
}

export interface AnswerPayload {
  selectedChoiceIds?: string[];
  blankAnswers?: string[];
  answerText?: string;
}

/** 응시자용으로 정답 정보를 제거한 스냅샷(선지 isCorrect·빈칸 answer 마스킹). */
export function maskSnapshot(snapshot: QuestionSnapshot): QuestionSnapshot {
  return {
    ...snapshot,
    stem: maskBlanks(snapshot.stem),
    choices: snapshot.choices?.map(({ id, content }) => ({ id, content })),
    explanation: undefined, // 진행 중에는 해설도 숨긴다
  };
}

/** stem 트리에서 blank 노드의 answer를 제거한다(구조/너비는 유지). */
function maskBlanks(node: PMNode): PMNode {
  const clone: PMNode = { ...node };
  if (clone.type === 'blank' && clone.attrs) {
    clone.attrs = { ...clone.attrs, answer: undefined };
  }
  if (clone.content) clone.content = clone.content.map(maskBlanks);
  return clone;
}

/** stem에서 빈칸 정답을 순서대로 수집(SHORT_ANSWER 채점용). */
export function collectBlankAnswers(node: PMNode, acc: string[] = []): string[] {
  if (node.type === 'blank' && typeof node.attrs?.answer === 'string') {
    acc.push(node.attrs.answer);
  }
  for (const child of node.content ?? []) collectBlankAnswers(child, acc);
  return acc;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * 스냅샷과 제출 답안을 대조해 정오를 판정한다.
 * ESSAY는 자동 채점 불가 → null(수동 채점 대상).
 */
export function grade(snapshot: QuestionSnapshot, answer: AnswerPayload): boolean | null {
  switch (snapshot.questionType) {
    case 'SINGLE_CHOICE':
    case 'OX':
    case 'MULTI_CHOICE': {
      const correct = new Set(
        (snapshot.choices ?? []).filter((c) => c.isCorrect).map((c) => c.id),
      );
      const selected = new Set(answer.selectedChoiceIds ?? []);
      if (correct.size === 0) return null;
      // 정답 집합과 선택 집합이 완전히 일치해야 정답(부분점수 없음).
      return correct.size === selected.size && [...correct].every((id) => selected.has(id));
    }
    case 'SHORT_ANSWER': {
      const expected = collectBlankAnswers(snapshot.stem);
      const given = answer.blankAnswers ?? [];
      if (expected.length === 0) return null;
      if (given.length !== expected.length) return false;
      return expected.every((exp, i) => norm(exp) === norm(given[i] ?? ''));
    }
    case 'ESSAY':
    default:
      return null;
  }
}
