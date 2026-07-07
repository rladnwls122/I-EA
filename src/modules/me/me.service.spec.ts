import { Test } from '@nestjs/testing';
import { MeService } from './me.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('MeService.wrongNotes', () => {
  it('오답을 단원·유형별로 집계하고 비율을 계산한다', async () => {
    const prisma = {
      examSessionAnswer: {
        findMany: jest.fn().mockResolvedValue([
          { isCorrect: false, examSessionQuestion: { question: { primaryUnitId: 'u1', questionType: 'SINGLE_CHOICE', unit: { name: '함수' } }, examSessionId: 's1', questionId: 'q1' } },
          { isCorrect: true,  examSessionQuestion: { question: { primaryUnitId: 'u1', questionType: 'SINGLE_CHOICE', unit: { name: '함수' } }, examSessionId: 's1', questionId: 'q2' } },
        ]),
      },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.wrongNotes('user-1');

    expect(result.byUnit).toEqual([
      { key: 'u1', label: '함수', total: 2, wrong: 1, wrongRatio: 0.5 },
    ]);
    expect(result.byType[0]).toMatchObject({ key: 'SINGLE_CHOICE', wrong: 1, total: 2 });
    expect(result.wrongQuestions).toEqual([
      { questionId: 'q1', unitName: '함수', questionType: 'SINGLE_CHOICE', sessionId: 's1' },
    ]);
  });
});
