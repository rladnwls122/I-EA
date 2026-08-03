import { Test } from '@nestjs/testing';
import { MeService, NOTES_GRADED_LIMIT } from './me.service';
import { PrismaService } from '@/prisma/prisma.service';

describe('MeService.notes', () => {
  it('오답을 세부과목·유형별로 집계하고 원인 태그·주석을 조인한다', async () => {
    const prisma = {
      examSessionAnswer: {
        // 미채점 서술형(자기채점 대기) 2건 — summary.ungradedCount로 그대로 노출.
        count: jest.fn().mockResolvedValue(2),
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
      // 복습 상태: q1은 X(어제 재노출 도래 → due), q2는 O(복습 대상 아님).
      userQuestionReviewState: {
        findMany: jest.fn().mockResolvedValue([
          {
            questionId: 'q1',
            status: 'X',
            consecutiveCorrect: 0,
            nextReviewAt: new Date('2000-01-01T00:00:00Z'),
          },
          { questionId: 'q2', status: 'O', consecutiveCorrect: 1, nextReviewAt: null },
        ]),
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
    // 복습 큐 현황 — q1(X, 재노출 도래)만 due, 상태 분포는 X 1 / O 1.
    expect(result.summary.review).toEqual({
      due: 1,
      byStatus: { O: 1, TRIANGLE: 0, X: 1, MASTERED: 0 },
    });
    // #39 B-2 — 자기채점 대기 서술형 카운트가 summary에 실린다.
    expect(result.summary.ungradedCount).toBe(2);
    // #39 B-3 — 상한(500) 미도달이면 truncated=false.
    expect(result.truncated).toBe(false);
    // #39 B-1 — 채점 이력 집계는 1차 응시만(isReview: false) + 최신 제출 순 + 상한.
    expect(prisma.examSessionAnswer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          examSessionQuestion: expect.objectContaining({
            examSession: { userId: 'user-1', status: 'SUBMITTED', isReview: false },
          }),
        }),
        orderBy: { examSessionQuestion: { examSession: { submittedAt: 'desc' } } },
        // 상한+1건 조회 — 초과분 존재 여부로 truncated를 판정한다.
        take: NOTES_GRADED_LIMIT + 1,
      }),
    );
    // #39 B-2 — 미채점 카운트도 1차 응시(isReview: false)만 센다.
    expect(prisma.examSessionAnswer.count).toHaveBeenCalledWith({
      where: {
        isCorrect: null,
        examSessionQuestion: {
          examSession: { userId: 'user-1', status: 'SUBMITTED', isReview: false },
        },
      },
    });
    expect(result.wrongQuestions).toEqual([
      {
        questionId: 'q1',
        subjectId: 'sub1',
        subjectName: '문학',
        questionType: '객관식',
        sessionId: 's1',
        annotationCount: 1,
        annotations: [{ id: 'a1', questionId: 'q1', reasonCode: 'CONCEPT', memoText: '개념 놓침' }],
        // q1의 복습 상태가 조인돼 내려온다.
        reviewState: {
          status: 'X',
          consecutiveCorrect: 0,
          nextReviewAt: new Date('2000-01-01T00:00:00Z'),
        },
      },
    ]);
  });

  // 채점 이력 n건짜리 서비스 목 — truncated 경계 케이스 공용 헬퍼.
  async function makeServiceWithGradedRows(count: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      isCorrect: true,
      examSessionQuestion: {
        examSessionId: `s${i}`,
        questionId: 'q1',
        question: {
          subjectId: 'sub1',
          questionType: '객관식',
          subject: { name: '문학' },
          questionTags: [],
        },
      },
    }));
    const prisma = {
      examSessionAnswer: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      userQuestionAnnotation: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewState: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return module.get(MeService);
  }

  it('채점 이력이 상한을 초과하면 truncated=true, 집계는 상한까지만 한다', async () => {
    // 상한+1건 조회가 꽉 찬 경우 = 초과분 존재 → truncated. 여분 1건은 집계에서 제외.
    const service = await makeServiceWithGradedRows(NOTES_GRADED_LIMIT + 1);

    const result = await service.notes('user-1');

    expect(result.truncated).toBe(true);
    expect(result.summary.solved).toBe(NOTES_GRADED_LIMIT);
  });

  it('채점 이력이 정확히 상한 건수면 truncated=false다(오판정 방지)', async () => {
    const service = await makeServiceWithGradedRows(NOTES_GRADED_LIMIT);

    const result = await service.notes('user-1');

    expect(result.truncated).toBe(false);
    expect(result.summary.solved).toBe(NOTES_GRADED_LIMIT);
  });
});

describe('MeService.reviewSummary', () => {
  it('due(재노출 도래)·ungraded(자기채점 대기) 카운트를 count 쿼리로만 조회한다', async () => {
    const prisma = {
      userQuestionReviewState: { count: jest.fn().mockResolvedValue(3) },
      examSessionAnswer: { count: jest.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.reviewSummary('user-1');

    expect(result).toEqual({ due: 3, ungraded: 1 });
    // due 정의 — 마스터 제외 + 재노출 시각 도래(notes()의 due와 동일 기준).
    expect(prisma.userQuestionReviewState.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: { not: 'MASTERED' },
        nextReviewAt: { lte: expect.any(Date) },
      },
    });
    // ungraded — 제출 완료된 1차 응시(isReview: false) 세션의 미채점 답안만.
    expect(prisma.examSessionAnswer.count).toHaveBeenCalledWith({
      where: {
        isCorrect: null,
        examSessionQuestion: {
          examSession: { userId: 'user-1', status: 'SUBMITTED', isReview: false },
        },
      },
    });
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
