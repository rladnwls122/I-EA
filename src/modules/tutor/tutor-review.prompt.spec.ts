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
