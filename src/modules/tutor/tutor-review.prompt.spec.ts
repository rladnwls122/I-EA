import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReviewTutorSystemPrompt, ReviewAttempt } from './tutor-review.prompt';
import { QuestionSnapshot } from '@/modules/exam-sessions/grading.util';

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const blocks = (text: string) => [{ type: 'paragraph', content: [{ type: 'text', text }] }];

const SNAPSHOT = {
  questionType: '객관식',
  stem: doc('다음 중 옳은 것은?'),
  passage: doc('지문 본문입니다.'),
  choices: [
    { id: 'c1', content: blocks('첫 번째 선지') },
    { id: 'c2', isCorrect: true, content: blocks('두 번째 선지') },
    { id: 'c3', content: blocks('세 번째 선지') },
  ],
  explanation: blocks('공식 해설 본문'),
  points: 1,
  difficulty: 3,
} as unknown as QuestionSnapshot;

const ATTEMPT: ReviewAttempt = {
  selectedChoiceNumbers: [1],
  answerText: null,
  isCorrect: false,
  reasonCodes: ['CONCEPT'],
  memos: ['개념이 헷갈렸음'],
};

describe('복습 튜터 프롬프트 (#40)', () => {
  const prompt = buildReviewTutorSystemPrompt(SNAPSHOT, ATTEMPT);

  it('정답 표시를 프롬프트에 노출한다 — 설명이 역할이므로', () => {
    expect(prompt).toContain('2. 두 번째 선지 ← 정답');
  });

  it('학습자가 고른 답과 채점 결과를 넣는다', () => {
    expect(prompt).toContain('학생이 고른 선지: 1번');
    expect(prompt).toContain('채점 결과: 오답');
  });

  it('학습자 자가 진단(reasonCode·메모)을 대화의 출발점으로 넣는다', () => {
    expect(prompt).toContain('CONCEPT');
    expect(prompt).toContain('개념이 헷갈렸음');
  });

  it('지문·발문·공식 해설을 함께 준다', () => {
    expect(prompt).toContain('지문 본문입니다.');
    expect(prompt).toContain('다음 중 옳은 것은?');
    expect(prompt).toContain('공식 해설 본문');
  });

  it('해설 복창을 금지한다 — 학생은 이미 읽고도 막혀서 물어본다', () => {
    expect(prompt).toContain('해설을 그대로 복창하지 않는다');
  });

  it('주관식 답안·자기채점 대기 상태도 표현한다', () => {
    const essay = buildReviewTutorSystemPrompt(
      { ...SNAPSHOT, questionType: '주관식', choices: undefined } as unknown as QuestionSnapshot,
      { selectedChoiceNumbers: [], answerText: '내가 쓴 답', isCorrect: null, reasonCodes: [], memos: [] },
    );
    expect(essay).toContain('학생이 쓴 답: 내가 쓴 답');
    expect(essay).toContain('자기채점 대기');
  });

  it('미응답도 구분해 표현한다', () => {
    const skipped = buildReviewTutorSystemPrompt(SNAPSHOT, {
      selectedChoiceNumbers: [],
      answerText: null,
      isCorrect: false,
      reasonCodes: [],
      memos: [],
    });
    expect(skipped).toContain('답을 제출하지 않았다');
  });
});

/**
 * 수식 규약(#35 후속).
 *
 * 이 프롬프트는 한때 "수식은 평문으로 쓴다 / LaTeX 금지"였다. 패널에 KaTeX 렌더러가
 * 없던 시절엔 옳았지만, 지금은 문항이 math 노드로 저장·렌더되고 복습 패널도
 * `$...$`를 그린다. 규약이 생성 쪽과 갈리면 같은 학습자가 문항에서는 렌더된 수식을,
 * 튜터 답변에서는 `x^2` 평문을 보게 된다.
 */
describe('수식 규약은 생성 프롬프트와 같다', () => {
  const MATH_RULE =
    '- 수식·화학식은 LaTeX로 쓰고 $...$(인라인) 또는 $$...$$(별행)로 감싼다. ×·²·√·½ 같은 유니코드 수학 기호로 흉내내지 않는다(화학식은 $\\ce{H2O}$ 형태).';
  const prompt = buildReviewTutorSystemPrompt(SNAPSHOT, ATTEMPT);

  it('LaTeX를 델리미터로 감싸라고 지시한다 — 금지가 아니라', () => {
    expect(prompt).toContain(MATH_RULE);
    expect(prompt).not.toContain('수식은 평문으로 쓴다');
  });

  it('화학식(\\ce)도 같이 허용한다 — 렌더 경로가 mhchem을 함께 로드한다', () => {
    expect(prompt).toContain('\\ce{H2O}');
  });

  it('생성 프롬프트(gemini-llm.service.ts)와 문구가 같다', () => {
    // 상수를 공유할 수 없어(생성 모듈은 이 기능의 소관 밖) 문구를 복제했다.
    // 복제가 갈라지는 것 자체가 사고이므로, 원문 파일과 직접 대조해 락스텝을 지킨다.
    const source = readFileSync(
      join(__dirname, '../ai-generation/llm/gemini-llm.service.ts'),
      'utf8',
    );
    // 소스에는 `\ce`가 TS 문자열 이스케이프(`\\ce`)로 적혀 있다 — 같은 형태로 맞춰 비교한다.
    expect(source).toContain(MATH_RULE.replace(/\\/g, '\\\\'));
  });
});

/**
 * 튜터에게 **주는** 컨텍스트도 수식을 실어야 한다.
 * `extractPlainText`가 math 노드를 델리미터째 역직렬화하므로, 튜터는 문항의 수식을
 * 자기가 써야 할 표기와 같은 형태로 본다. 여기가 깨지면 튜터는 발문에서 수식이
 * 통째로 사라진 문장을 읽게 된다(math 노드는 atom이라 text도 content도 없다).
 */
describe('문항 컨텍스트의 수식', () => {
  const mathSnapshot = {
    ...SNAPSHOT,
    stem: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '방정식 ' },
            { type: 'inlineMath', attrs: { latex: 'x^2 - 2x = 0' } },
            { type: 'text', text: '의 해는?' },
          ],
        },
      ],
    },
    choices: [
      {
        id: 'c1',
        isCorrect: true,
        content: [
          { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x = 0, 2' } }] },
        ],
      },
    ],
    explanation: [{ type: 'blockMath', attrs: { latex: 'x(x-2)=0' } }],
  } as unknown as QuestionSnapshot;

  const prompt = buildReviewTutorSystemPrompt(mathSnapshot, ATTEMPT);

  it('발문의 inlineMath가 $...$로 실린다', () => {
    expect(prompt).toContain('$x^2 - 2x = 0$');
  });

  it('선지의 수식도 실린다', () => {
    expect(prompt).toContain('$x = 0, 2$');
  });

  it('해설의 blockMath는 $$...$$로 실린다', () => {
    expect(prompt).toContain('$$x(x-2)=0$$');
  });
});

/**
 * 풀이 중 튜터(정답 발설 금지)는 계획이 무효화돼 2026-08-04에 제거됐다.
 * 그 결과 "응시 중에는 정답을 숨긴다"는 경계가 **인가 한 곳**에만 남았다
 * (`authorizeReview`의 진행 중 세션 차단 — tutor-review.service.spec.ts).
 * 프롬프트는 이제 정답을 설명하는 쪽 하나뿐이므로, 이 프롬프트에 접근할 수 있다는 것
 * 자체가 "정답을 봐도 되는 사용자"라는 뜻이 되도록 인가가 지켜져야 한다.
 */
describe('복습 프롬프트는 정답을 격리하지 않는다', () => {
  it('<answer_context> 같은 격리 블록이 없다 — 공개해도 되는 단계', () => {
    expect(buildReviewTutorSystemPrompt(SNAPSHOT, ATTEMPT)).not.toContain('<answer_context>');
  });

  it('정답 표시가 프롬프트에 그대로 들어간다', () => {
    expect(buildReviewTutorSystemPrompt(SNAPSHOT, ATTEMPT)).toContain('← 정답');
  });
});
