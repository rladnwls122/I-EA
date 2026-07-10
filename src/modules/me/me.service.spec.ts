import { Test } from '@nestjs/testing';
import { MeService } from './me.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('MeService.notes', () => {
  it('오답을 세부과목·유형별로 집계하고 원인 태그·주석을 조인한다', async () => {
    const prisma = {
      examSessionAnswer: {
        findMany: jest.fn().mockResolvedValue([
          {
            isCorrect: false,
            examSessionQuestion: {
              examSessionId: 's1',
              questionId: 'q1',
              question: { subjectId: 'sub1', questionType: '객관식', subject: { name: '문학' } },
            },
          },
          {
            isCorrect: true,
            examSessionQuestion: {
              examSessionId: 's1',
              questionId: 'q2',
              question: { subjectId: 'sub1', questionType: '객관식', subject: { name: '문학' } },
            },
          },
        ]),
      },
      userQuestionAnnotation: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'a1', questionId: 'q1', reasonCode: 'CONCEPT', memoText: '개념 놓침' }]),
      },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.notes('user-1');

    expect(result.summary.bySubject).toEqual([
      { key: 'sub1', label: '문학', total: 2, wrong: 1, wrongRatio: 0.5 },
    ]);
    expect(result.summary.byType[0]).toMatchObject({ key: '객관식', wrong: 1, total: 2 });
    expect(result.summary.byReason).toEqual([{ code: 'CONCEPT', label: '개념부족', count: 1 }]);
    expect(result.wrongQuestions).toEqual([
      {
        questionId: 'q1',
        subjectId: 'sub1',
        subjectName: '문학',
        questionType: '객관식',
        sessionId: 's1',
        annotationCount: 1,
        annotations: [{ id: 'a1', questionId: 'q1', reasonCode: 'CONCEPT', memoText: '개념 놓침' }],
      },
    ]);
  });
});
