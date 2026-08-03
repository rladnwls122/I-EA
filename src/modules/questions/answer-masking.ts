/**
 * 문제은행 단건 조회(`GET /questions/:id`)에서 정답 정보를 가리는 유틸.
 *
 * **왜 필요한가 — 응시 중 마스킹 우회:**
 * `exam-sessions`는 IN_PROGRESS 세션의 스냅샷을 `maskSnapshot()`으로 가리지만,
 * 같은 응답에 `questionId`를 함께 내려준다. 그 ID로 이 엔드포인트를 부르면
 * `choices[].isCorrect`와 해설이 그대로 나오므로, 요청 한 번이면 마스킹이
 * 무력화됐다. 정답이 XP·코인 → 상점 실물 상품(PHYSICAL, 관리자 배송)으로
 * 이어지므로 이건 표시상의 문제가 아니라 재화 경제 부정 경로다.
 *
 * → 요청자가 **해당 문항을 품은 진행 중 세션**을 갖고 있으면 여기서도 가린다.
 *   세션이 제출(SUBMITTED)되면 원래대로 전부 보인다(복습 흐름 유지).
 */

/** 마스킹 대상 필드를 가진 문항 행의 최소 형태. */
export interface MaskableQuestion {
  choices?: unknown;
  explanation?: unknown;
  correctAnswerText?: string | null;
  hintContent?: string | null;
}

/** 선지에서 남겨도 되는 키. isCorrect와 선지별 해설은 정답을 그대로 드러낸다. */
const SAFE_CHOICE_KEYS = ['id', 'content'] as const;

/**
 * 정답 관련 필드를 제거한 사본을 돌려준다(입력은 변형하지 않는다).
 * `maskSnapshot()`과 같은 기준으로 가린다: 선지 isCorrect·선지 해설·문항 해설·주관식 정답.
 * 힌트는 응시 중에도 별도 게이팅(hint-quota)으로 소비되므로 여기서 함께 가린다.
 */
export function maskQuestionAnswers<T extends MaskableQuestion>(question: T): T {
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
        if (!choice || typeof choice !== 'object') return choice;
        const source = choice as Record<string, unknown>;
        const safe: Record<string, unknown> = {};
        for (const key of SAFE_CHOICE_KEYS) {
          if (key in source) safe[key] = source[key];
        }
        return safe;
      })
    : question.choices;

  return {
    ...question,
    choices,
    explanation: null,
    correctAnswerText: null,
    hintContent: null,
  };
}
