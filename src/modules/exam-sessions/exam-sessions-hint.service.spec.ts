import { Test } from '@nestjs/testing';
import { ExamSessionsService } from './exam-sessions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';

/**
 * revealHint 힌트 소스 분기:
 *  - static hintContent 있으면 그 값 반환 + LLM 미호출
 *  - 없으면 generateHint 결과 반환
 *  - 두 경로 모두 isHintUsed=false였다면 기록 update
 */
describe('ExamSessionsService.revealHint — 힌트 소스', () => {
  let service: ExamSessionsService;
  let prisma: {
    examSessionQuestion: { findUnique: jest.Mock; update: jest.Mock };
  };
  let gemini: { generateHint: jest.Mock };

  const baseSq = {
    id: 'sq1',
    isHintUsed: false,
    hintUsedAt: null,
    examSession: { userId: 'u1', status: 'IN_PROGRESS' },
    question: {
      hintContent: null,
      questionType: '객관식',
      stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '발문' }] }] },
      choices: [
        { content: [{ type: 'paragraph', content: [{ type: 'text', text: '가' }] }], isCorrect: false },
        { content: [{ type: 'paragraph', content: [{ type: 'text', text: '나' }] }], isCorrect: true },
      ],
      correctAnswerText: null,
      explanation: null,
      difficulty: 3,
      subject: { name: '문학', examCategory: '국어', examType: '수능' },
    },
  };

  beforeEach(async () => {
    prisma = {
      examSessionQuestion: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    gemini = { generateHint: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ExamSessionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiLlmService, useValue: gemini },
      ],
    }).compile();
    service = module.get(ExamSessionsService);
  });

  it('static hintContent가 있으면 그 값을 반환하고 LLM을 부르지 않는다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      question: { ...baseSq.question, hintContent: '출제자 힌트' },
    });

    const res = await service.revealHint('sq1', 'u1');

    expect(res.hint).toBe('출제자 힌트');
    expect(gemini.generateHint).not.toHaveBeenCalled();
    expect(prisma.examSessionQuestion.update).toHaveBeenCalledTimes(1); // isHintUsed 기록
  });

  it('static 힌트가 없으면 generateHint 결과를 반환한다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue(baseSq);
    gemini.generateHint.mockResolvedValue({ hint: 'AI 넛지 힌트' });

    const res = await service.revealHint('sq1', 'u1');

    expect(res.hint).toBe('AI 넛지 힌트');
    expect(gemini.generateHint).toHaveBeenCalledTimes(1);
    // 평문화된 발문·선지가 컨텍스트로 전달됐는지 확인
    const passed = gemini.generateHint.mock.calls[0][0];
    expect(passed.stemText).toBe('발문');
    expect(passed.choices).toEqual([
      { content: '가', isCorrect: false },
      { content: '나', isCorrect: true },
    ]);
    expect(passed.subjectName).toBe('문학');
  });

  it('이미 열람한 문항이면 update를 다시 하지 않는다', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      isHintUsed: true,
      hintUsedAt: new Date(2026, 6, 1),
      question: { ...baseSq.question, hintContent: '출제자 힌트' },
    });

    await service.revealHint('sq1', 'u1');
    expect(prisma.examSessionQuestion.update).not.toHaveBeenCalled();
  });

  it('다른 사람 세션이면 ForbiddenException', async () => {
    prisma.examSessionQuestion.findUnique.mockResolvedValue({
      ...baseSq,
      examSession: { userId: 'other', status: 'IN_PROGRESS' },
    });
    await expect(service.revealHint('sq1', 'u1')).rejects.toThrow();
  });
});
