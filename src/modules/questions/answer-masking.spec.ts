import { Test } from '@nestjs/testing';
import { maskQuestionAnswers } from './answer-masking';
import { QuestionsService } from './questions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';

describe('maskQuestionAnswers', () => {
  const question = {
    id: 'q1',
    choices: [
      { id: 'c1', content: '선지1', isCorrect: true, explanation: '이게 정답' },
      { id: 'c2', content: '선지2', isCorrect: false },
    ],
    explanation: [{ type: 'paragraph' }],
    correctAnswerText: '42',
    hintContent: '힌트',
  };

  it('선지에서 isCorrect와 선지별 해설을 제거한다', () => {
    expect(maskQuestionAnswers(question).choices).toEqual([
      { id: 'c1', content: '선지1' },
      { id: 'c2', content: '선지2' },
    ]);
  });

  it('문항 해설·주관식 정답·힌트를 지운다', () => {
    const masked = maskQuestionAnswers(question);
    expect(masked.explanation).toBeNull();
    expect(masked.correctAnswerText).toBeNull();
    expect(masked.hintContent).toBeNull();
  });

  it('입력 객체를 변형하지 않는다', () => {
    maskQuestionAnswers(question);
    expect((question.choices[0] as { isCorrect?: boolean }).isCorrect).toBe(true);
    expect(question.correctAnswerText).toBe('42');
  });

  it('choices가 배열이 아니어도 죽지 않는다(손상 데이터 방어)', () => {
    expect(() => maskQuestionAnswers({ choices: null })).not.toThrow();
    expect(maskQuestionAnswers({ choices: 'broken' }).choices).toBe('broken');
  });
});

const QUESTION_ROW = {
  id: 'q1',
  creatorId: 'author',
  choices: [{ id: 'c1', content: '선지1', isCorrect: true }],
  explanation: [{ type: 'paragraph' }],
  correctAnswerText: '42',
  hintContent: '힌트',
  totalSolvedCount: 20,
  correctSolvedCount: 10,
  totalTimeSpentSec: 200,
  timedSolvedCount: 20,
  questionTags: [],
  choiceStats: [{ choiceId: 'c1', count: 12 }],
};

/** hasActiveSession=true 면 요청자가 이 문항을 품은 IN_PROGRESS 세션을 가진 상태. */
async function makeService(hasActiveSession: boolean) {
  const prisma = {
    question: {
      update: jest.fn().mockResolvedValue(QUESTION_ROW),
      findUnique: jest.fn().mockResolvedValue(QUESTION_ROW),
    },
    examSessionAnswer: { count: jest.fn().mockResolvedValue(0) },
    examSessionQuestion: {
      findFirst: jest.fn().mockResolvedValue(hasActiveSession ? { id: 'sq1' } : null),
    },
  } as unknown as PrismaService;
  const module = await Test.createTestingModule({
    providers: [
      QuestionsService,
      { provide: PrismaService, useValue: prisma },
      { provide: GeminiLlmService, useValue: {} },
    ],
  }).compile();
  return module.get(QuestionsService);
}

describe('GET /questions/:id — 응시 중 정답 마스킹 우회 차단', () => {
  it('진행 중 세션이 있으면 정답·해설을 가린다', async () => {
    const res = (await (await makeService(true)).getById('q1', 'solver')) as Record<string, unknown>;

    expect(res.maskedForActiveSession).toBe(true);
    expect(res.correctAnswerText).toBeNull();
    expect(res.explanation).toBeNull();
    expect(res.choices).toEqual([{ id: 'c1', content: '선지1' }]);
  });

  it('진행 중 세션이 없으면 원본 그대로 준다', async () => {
    const res = (await (await makeService(false)).getById('q1', 'solver')) as Record<
      string,
      unknown
    >;

    expect(res.maskedForActiveSession).toBeUndefined();
    expect(res.correctAnswerText).toBe('42');
    expect(res.choices).toEqual([{ id: 'c1', content: '선지1', isCorrect: true }]);
  });

  it('출제자 본인은 진행 중 세션이 있어도 가리지 않는다(편집 UI가 원본을 쓴다)', async () => {
    const res = (await (await makeService(true)).getById('q1', 'author')) as Record<string, unknown>;

    expect(res.maskedForActiveSession).toBeUndefined();
    expect(res.correctAnswerText).toBe('42');
  });
});

describe('GET /questions/:id/stats — isCorrect 노출 자격', () => {
  it('비로그인에는 isCorrect를 주지 않는다(정답 키 무인증 덤프 차단)', async () => {
    const stats = await (await makeService(false)).getStats('q1', null);
    expect(stats.choiceDistribution[0].isCorrect).toBeNull();
    // 분포 자체는 공개 유지.
    expect(stats.choiceDistribution[0].count).toBe(12);
  });

  it('진행 중 세션을 가진 로그인 사용자에게도 주지 않는다', async () => {
    const stats = await (await makeService(true)).getStats('q1', 'solver');
    expect(stats.choiceDistribution[0].isCorrect).toBeNull();
  });

  it('그 밖의 로그인 사용자에게는 기존대로 노출한다', async () => {
    const stats = await (await makeService(false)).getStats('q1', 'solver');
    expect(stats.choiceDistribution[0].isCorrect).toBe(true);
  });
});
