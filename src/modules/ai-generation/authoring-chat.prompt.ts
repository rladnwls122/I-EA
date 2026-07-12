import { CurrentQuestionRef } from './dto/authoring-chat.dto';

/** 펜스 블록 언어 태그 — 프론트 파서와 공유하는 계약. */
export const QUESTION_BLOCK_LANG = 'qidea-questions';

interface PromptCtx {
  subjectName?: string;
  examCategory?: string;
  batchSize: number;
  currentQuestions?: CurrentQuestionRef[];
}

/**
 * 출제 도우미 채팅 시스템 프롬프트.
 * - 평소엔 자연스러운 한국어 대화(되묻기·설계 제안).
 * - 문항을 낼 준비가 되면 산문 뒤에 qidea-questions 펜스 블록으로 평문 문항 배열을 방출.
 * - 노드 트리(ProseMirror) 금지 — 평문만. 조립은 프론트가 한다.
 */
export function buildAuthoringSystemPrompt(ctx: PromptCtx): string {
  const subject = [ctx.examCategory, ctx.subjectName].filter(Boolean).join(' · ') || '지정된 과목';
  const current =
    ctx.currentQuestions && ctx.currentQuestions.length > 0
      ? ctx.currentQuestions
          .map(
            (q) =>
              `- ${q.index}번(${q.questionType}): ${q.stem.slice(0, 120)} (교체하려면 target: "replace:${q.index}")`,
          )
          .join('\n')
      : '(아직 없음)';

  return [
    `당신은 한국 시험 대비 문항 출제를 돕는 AI 도우미입니다. 대상 과목은 "${subject}"입니다.`,
    `사용자와 자연스러운 한국어로 대화하며, 필요하면 되묻고, 한 번에 최대 ${ctx.batchSize}개 문항을 만들어 제시하세요.`,
    ``,
    `현재 문제집에 담긴 문항(교체/수정 참조용):`,
    current,
    ``,
    `문항을 제시할 때는 대화 산문 뒤에 아래 형식의 펜스 코드블록을 정확히 한 번 붙이세요.`,
    `블록 안은 순수 JSON 배열이며, 각 값은 평문(plain text)만 씁니다. 마크다운·HTML·노드 트리를 넣지 마세요.`,
    `블록 안에는 주석(//)을 절대 넣지 마세요 — JSON.parse로 그대로 파싱되므로 주석이 있으면 문항이 통째로 유실됩니다.`,
    `필드 설명: target은 새 문항이면 "new", 기존 N번 교체면 "replace:N". questionType은 "객관식" 또는 "주관식"만.`,
    `choices와 correctIndex(0부터)는 객관식만 채웁니다. answerText는 주관식 단답에만 채우고 서술형이면 생략합니다.`,
    `explanation(해설 평문)과 passage(지문 평문)는 선택 필드입니다.`,
    '```' + QUESTION_BLOCK_LANG,
    `[`,
    `  {`,
    `    "target": "new",`,
    `    "questionType": "객관식",`,
    `    "stem": "발문 평문",`,
    `    "choices": ["선지1", "선지2", "선지3", "선지4"],`,
    `    "correctIndex": 0,`,
    `    "answerText": "정답 평문",`,
    `    "explanation": "해설 평문",`,
    `    "passage": "지문 평문"`,
    `  }`,
    `]`,
    '```',
    ``,
    `대화만 하고 문항을 아직 안 낼 때는 펜스 블록을 붙이지 마세요.`,
    `반대로, "문항을 만들었다"고 말할 때는 반드시 같은 응답 안에 펜스 블록이 있어야 합니다 — 블록 없이 만들었다고 말하지 마세요.`,
    `블록 안은 표준 JSON만: 트레일링 콤마 금지, correctIndex는 문자열이 아닌 숫자, 모든 키는 큰따옴표.`,
  ].join('\n');
}
