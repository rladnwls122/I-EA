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
              question: {
                subjectId: 'sub1',
                questionType: '객관식',
                subject: { name: '문학' },
                questionTags: [{ tag: { id: 't-meta', name: '비유' } }],
              },
            },
          },
          {
            isCorrect: true,
            examSessionQuestion: {
              examSessionId: 's1',
              questionId: 'q2',
              question: {
                subjectId: 'sub1',
                questionType: '객관식',
                subject: { name: '문학' },
                questionTags: [{ tag: { id: 't-meta', name: '비유' } }],
              },
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
    // 개념별 오답 — 같은 키워드를 2문항이 공유(1오답/1정답) → wrong>0만 노출.
    expect(result.summary.byKeyword).toEqual([
      { key: 't-meta', label: '비유', total: 2, wrong: 1, wrongRatio: 0.5 },
    ]);
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

describe('MeService.activeSession', () => {
  async function makeService(findFirstResult: unknown) {
    const prisma = {
      examSession: { findFirst: jest.fn().mockResolvedValue(findFirstResult) },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return module.get(MeService);
  }

  it('진행 중 세션이 있으면 요약(진행률 포함)을 반환한다', async () => {
    const service = await makeService({
      id: 'sess-1',
      subject: { name: '문학' },
      workbook: null,
      startedAt: new Date('2026-07-12T00:00:00Z'),
      sessionQuestions: [{ answer: { id: 'ans-1' } }, { answer: null }, { answer: null }],
    });

    const result = await service.activeSession('user-1');

    expect(result).toMatchObject({
      id: 'sess-1',
      subjectName: '문학',
      workbookTitle: null,
      total: 3,
      answered: 1,
    });
  });

  it('진행 중 세션이 없으면 null을 반환한다', async () => {
    const service = await makeService(null);
    expect(await service.activeSession('user-1')).toBeNull();
  });
});
