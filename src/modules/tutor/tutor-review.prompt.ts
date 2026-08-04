/**
 * 오답 복습 튜터의 시스템 프롬프트 (#40).
 *
 * **풀이 중 튜터(tutor.prompt.ts)와 정반대다.** 그쪽은 정답 누설을 막는 게 존재 이유라
 * 정답을 `<answer_context>`에 격리하고 "번호를 말하지 마라"를 절대 규칙으로 둔다.
 * 여기는 이미 채점이 끝난 뒤라 정답이 학습자에게 정당하게 공개된 상태이고,
 * 역할 자체가 "왜 네 답이 틀렸는지"를 설명하는 것이다.
 *
 * 이 정반대성이 두 프롬프트를 **파일부터 분리한** 이유다. 한 함수에 모드 플래그를 두면
 * 분기 실수 하나가 진행 중인 시험에서 정답을 흘린다. 인가도 엔드포인트별로 갈라 둔다.
 *
 * 코치 관점에서 복습 대화의 마감선은 세 질문이다(#40 초안 §A):
 *   ① 왜 내 답이 틀렸나  ② 왜 이게 정답인가  ③ 다음에 안 틀리려면
 * 잡담·전 과목 과외로 넓히지 않는다 — 비용과 품질을 통제할 수 없다.
 */
import { extractPlainText, PMNode } from '@/common/prosemirror/prosemirror.util';
import { QuestionSnapshot } from '@/modules/exam-sessions/grading.util';

const REVIEW_SYSTEM_INSTRUCTION = [
  '너는 한국 수험생의 오답을 함께 복습하는 AI 코치다. 학생은 이 문제를 이미 풀었고 채점도 끝났다.',
  '정답과 해설은 학생이 이미 볼 수 있는 상태다. 숨기지 말고, 대신 **왜 그렇게 되는지**를 이해시켜라.',
  '',
  '[역할]',
  '- 학생이 고른 답이 왜 매력적으로 보였는지(어떤 오개념·함정에서 나온 선택인지) 먼저 짚는다.',
  '- 그다음 정답의 근거를 학생이 이미 아는 개념에서 출발해 설명한다.',
  '- 마지막으로 같은 유형을 다시 만났을 때 확인할 체크포인트를 하나 준다.',
  '',
  '[하지 말 것]',
  '- 해설을 그대로 복창하지 않는다. 학생은 이미 해설을 읽었고 그래도 막혀서 물어보는 것이다.',
  '- 이 문항과 무관한 잡담·다른 과목 질문에는 짧게 거절하고 이 문항으로 되돌린다.',
  '- 학생이 스스로 적은 오답 원인(reason)이 있으면 그걸 부정하지 말고 출발점으로 삼는다.',
  '  다만 그 진단이 실제 원인과 다르면 부드럽게 교정한다 — 자가 진단이 틀리는 것 자체가 흔한 약점이다.',
  '',
  '[형식]',
  '- 존댓말. 문단을 짧게 나눈다.',
  '- 마크다운 헤딩(#)을 쓰지 않는다. 굵게는 최소한으로.',
  '- 수식은 평문으로 쓴다. 예: x^2 - 2x = 0, f\'(2). LaTeX($...$, \\frac)는 화면에 날것으로 보이므로 쓰지 않는다.',
  '- 한 턴에 다 쏟지 않는다. 학생이 이어서 물을 수 있게 남긴다.',
].join('\n');

/** 학습자의 이번 문항 응답 — 프롬프트에 넣을 최소 형태. */
export interface ReviewAttempt {
  /** 객관식에서 학생이 고른 선지 번호(1-기반). 없으면 미응답. */
  selectedChoiceNumbers: number[];
  /** 주관식 제출 답안. */
  answerText: string | null;
  /** 채점 결과. null이면 자기채점 대기(서술형). */
  isCorrect: boolean | null;
  /** 학습자가 스스로 단 오답 원인 태그(CONCEPT/MISTAKE/TIME/OTHER 등). */
  reasonCodes: string[];
  /** 학습자가 남긴 메모. */
  memos: string[];
}

function choiceLines(snapshot: QuestionSnapshot): string {
  const choices = Array.isArray(snapshot.choices) ? snapshot.choices : [];
  if (choices.length === 0) return '(선지 없음 — 주관식)';
  return choices
    .map((c, i) => {
      const text = extractPlainText(c?.content as PMNode | PMNode[] | null | undefined);
      // 복습 단계라 정답 표시를 그대로 노출한다 — 풀이 중 프롬프트와 다른 지점.
      const mark = c?.isCorrect ? ' ← 정답' : '';
      return `${i + 1}. ${text || '(빈 선지)'}${mark}`;
    })
    .join('\n');
}

function attemptLines(attempt: ReviewAttempt): string {
  const parts: string[] = [];
  if (attempt.selectedChoiceNumbers.length > 0) {
    parts.push(`학생이 고른 선지: ${attempt.selectedChoiceNumbers.join(', ')}번`);
  } else if (attempt.answerText) {
    parts.push(`학생이 쓴 답: ${attempt.answerText}`);
  } else {
    parts.push('학생이 답을 제출하지 않았다.');
  }

  parts.push(
    attempt.isCorrect === true
      ? '채점 결과: 정답'
      : attempt.isCorrect === false
        ? '채점 결과: 오답'
        : '채점 결과: 자기채점 대기(서술형)',
  );

  if (attempt.reasonCodes.length > 0) {
    parts.push(`학생이 스스로 적은 오답 원인: ${attempt.reasonCodes.join(', ')}`);
  }
  if (attempt.memos.length > 0) {
    parts.push(`학생 메모: ${attempt.memos.join(' / ')}`);
  }
  return parts.join('\n');
}

/**
 * 복습 튜터 시스템 프롬프트를 조립한다.
 *
 * 풀이 중 튜터와 달리 `<answer_context>` 격리가 없다 — 정답·해설을 학생과
 * 공유해도 되는 단계이기 때문이다. 대신 컨텍스트는 **이 문항 하나**로 제한한다.
 * 전체 학습 이력은 넣지 않는다: 토큰 비용 대비 답변 품질 기여가 낮고,
 * 학습자 전반의 약점은 약점 진단(#37)이 별도 축으로 다룬다.
 */
export function buildReviewTutorSystemPrompt(
  snapshot: QuestionSnapshot,
  attempt: ReviewAttempt,
): string {
  const stem = extractPlainText(snapshot.stem);
  const passage = snapshot.passage ? extractPlainText(snapshot.passage) : '';
  const explanation = snapshot.explanation
    ? extractPlainText(snapshot.explanation as PMNode | PMNode[])
    : '';
  const correctText = snapshot.correctAnswerText ?? '';

  return [
    REVIEW_SYSTEM_INSTRUCTION,
    '',
    '<question_context>',
    passage ? `[지문]\n${passage}\n` : '',
    `[발문]\n${stem}`,
    '',
    `[선지]\n${choiceLines(snapshot)}`,
    correctText ? `\n[정답(주관식)]\n${correctText}` : '',
    explanation ? `\n[공식 해설]\n${explanation}` : '',
    '</question_context>',
    '',
    '<student_attempt>',
    attemptLines(attempt),
    '</student_attempt>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
