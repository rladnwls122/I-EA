import { Test } from '@nestjs/testing';
import { MeService, NOTES_GRADED_LIMIT } from './me.service';
import { RUBRIC_SCORE_MIN_SAMPLE } from './rubric-score.util';
import { PrismaService } from '@/prisma/prisma.service';

describe('MeService.notes', () => {
  it('오답을 세부과목·유형별로 집계하고 원인 태그·주석을 조인한다', async () => {
    const prisma = {
      examSessionAnswer: {
        // 미채점 서술형(자기채점 대기) 2건 — summary.ungradedCount로 그대로 노출.
        count: jest.fn().mockResolvedValue(2),
        // 서술형 부분점수 집계(#43 gap 8 후속) — 이 케이스는 채점기준표 채점 이력이 없다.
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: 0, _sum: { earnedPoints: null, rubricTotalPoints: null } }),
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
                // 하위요소(4단계) 지정 문항 — bySubjectDetail의 일반 버킷으로 집계.
                subjectDetailId: 'd1',
                detail: { name: '문서이해' },
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
                // 하위요소 미지정(null) 문항 — 미분류 버킷으로 집계.
                subjectDetailId: null,
                detail: null,
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
      // 복습 실패율(#37) 원천 — 이 케이스는 전이 이력이 없다.
      userQuestionReviewTransition: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.notes('user-1');

    expect(result.summary.bySubject).toEqual([
      { key: 'sub1', label: '문학', total: 2, wrong: 1, wrongRatio: 0.5 },
    ]);
    // 하위요소(4단계)별 — 지정 문항은 d1 버킷, null 문항은 미분류 버킷으로(표본이 새지 않는다).
    expect(result.summary.bySubjectDetail).toEqual([
      { key: 'd1', label: '문서이해', total: 1, wrong: 1, wrongRatio: 1 },
      { key: 'UNCLASSIFIED', label: '미분류', total: 1, wrong: 0, wrongRatio: 0 },
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
          subjectDetailId: null,
          detail: null,
          questionTags: [],
        },
      },
    }));
    const prisma = {
      examSessionAnswer: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: 0, _sum: { earnedPoints: null, rubricTotalPoints: null } }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      userQuestionAnnotation: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewState: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewTransition: { findMany: jest.fn().mockResolvedValue([]) },
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

  /**
   * 복습 실패율(#37) — 전이 이력을 축(하위요소)별로 접어 weakness.util에 넘기는 경로.
   * 순수 함수는 DB를 모르므로, "어느 문항이 어느 축인가"를 붙이는 책임이 여기 있다.
   */
  it('X 상태 전이 이력을 축별로 접어 복습 실패율로 내려준다', async () => {
    // d1 축에 6문항(표본 하한 5 통과), 그중 4개 오답.
    const rows = Array.from({ length: 6 }, (_, i) => ({
      isCorrect: i >= 4,
      examSessionQuestion: {
        examSessionId: 's1',
        questionId: `q${i}`,
        question: {
          subjectId: 'sub1',
          questionType: '객관식',
          subject: { name: '문학' },
          subjectDetailId: 'd1',
          detail: { name: '문서이해' },
          questionTags: [],
        },
      },
    }));
    const transitionFindMany = jest.fn().mockResolvedValue([
      // X에서 또 틀림(X→X) 3건 + X에서 맞힘 1건 → 3/4.
      { questionId: 'q0', correct: false },
      { questionId: 'q1', correct: false },
      { questionId: 'q2', correct: false },
      { questionId: 'q3', correct: true },
      // 축을 알 수 없는 문항(1차 응시 이력 밖)은 집계에서 조용히 버린다.
      { questionId: 'q-unknown', correct: false },
    ]);
    const prisma = {
      examSessionAnswer: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _count: 0, _sum: { earnedPoints: null, rubricTotalPoints: null } }),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      userQuestionAnnotation: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewState: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewTransition: { findMany: transitionFindMany },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = module.get(MeService);

    const result = await service.notes('user-1');

    expect(result.summary.weakness?.weaknesses[0]).toMatchObject({
      key: 'd1',
      reviewFailure: { total: 4, failed: 3, ratio: 0.75, stuck: true },
    });
    // 분모는 "X 상태에서 일어난 전이"라 fromStatus=X만 읽어야 하고,
    // 조회 범위는 축이 확정된 문항으로 제한해 유저 전체 이력이 딸려오지 않게 한다.
    expect(transitionFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        fromStatus: 'X',
        questionId: { in: ['q0', 'q1', 'q2', 'q3', 'q4', 'q5'] },
      },
      select: { questionId: true, correct: true },
    });
  });
});

/**
 * 서술형 부분점수 지표(#43 gap 8 후속).
 *
 * 여기서 지키는 계약: (1) 집계는 앱이 아니라 DB(aggregate)가 한다, (2) 대상은 두 컬럼이
 * NOT NULL인 답안(=채점기준표로 채점된 답안)뿐이다, (3) 1차 응시만 센다(#39 B-1),
 * (4) 표본 하한 미만이면 아무것도 말하지 않는다.
 */
describe('MeService.notes — 서술형 부분점수 지표', () => {
  /** 축별 조회가 돌려줄 답안 행 하나(하위요소 축 + 점수). */
  const axisRow = (detailId: string | null, name: string | null, earned: number, total: number) => ({
    earnedPoints: earned,
    rubricTotalPoints: total,
    examSessionQuestion: {
      question: { subjectDetailId: detailId, detail: name ? { name } : null },
    },
  });

  async function makeService(aggregateResult: unknown, axisRows: unknown[] = []) {
    const aggregate = jest.fn().mockResolvedValue(aggregateResult);
    // notes()는 examSessionAnswer.findMany를 두 번 부른다: 채점 이력(include)과
    // 축별 득점률(select). 어느 쪽인지 본문 모양으로 갈라 답한다.
    const findMany = jest.fn(async (args: { select?: unknown }) =>
      args.select ? axisRows : [],
    );
    const prisma = {
      examSessionAnswer: {
        count: jest.fn().mockResolvedValue(0),
        aggregate,
        findMany,
      },
      userQuestionAnnotation: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewState: { findMany: jest.fn().mockResolvedValue([]) },
      userQuestionReviewTransition: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const module = await Test.createTestingModule({
      providers: [MeService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return { service: module.get(MeService), aggregate, findMany };
  }

  it('SUM/COUNT를 DB에서 받아 평균 득점률로 접는다(답안을 앱으로 끌어오지 않는다)', async () => {
    // Decimal 컬럼이라 Prisma는 Decimal 객체를 돌려준다 — toString만 있는 객체로 흉내 내
    // 서비스가 숫자로 접는지까지 확인한다(안 접으면 JSON에서 문자열이 된다).
    const decimal = (v: string) => ({ toString: () => v, toJSON: () => v });
    const { service, aggregate } = await makeService({
      _count: 4,
      _sum: { earnedPoints: decimal('27'), rubricTotalPoints: decimal('40') },
    });

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore).toEqual({
      count: 4,
      earnedPoints: 27,
      totalPoints: 40,
      ratio: 0.68, // 27/40 = 0.675 → 소수 둘째 자리
      byDetail: [],
      needsMoreData: [],
    });
    // 대상 선별은 "두 컬럼이 NOT NULL" + 1차 응시. 집계 자체가 DB에서 돌아야 한다.
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        earnedPoints: { not: null },
        rubricTotalPoints: { not: null },
        examSessionQuestion: {
          examSession: { userId: 'user-1', status: 'SUBMITTED', isReview: false },
        },
      },
      _sum: { earnedPoints: true, rubricTotalPoints: true },
      _count: true,
    });
  });

  it('표본이 하한 미만이면 null — 두 문항으로 "평균 득점률"이라 말하지 않는다', async () => {
    const { service } = await makeService({
      _count: RUBRIC_SCORE_MIN_SAMPLE - 1,
      _sum: { earnedPoints: 2, rubricTotalPoints: 20 },
    });

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore).toBeNull();
  });

  it('채점기준표로 채점한 답안이 하나도 없으면 null(0%가 아니다)', async () => {
    const { service } = await makeService({
      _count: 0,
      _sum: { earnedPoints: null, rubricTotalPoints: null },
    });

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore).toBeNull();
  });

  it('범위 필터가 있으면 부분점수 집계도 같은 범위를 따라간다', async () => {
    const { service, aggregate } = await makeService({
      _count: 3,
      _sum: { earnedPoints: 9, rubricTotalPoints: 30 },
    });

    await service.notes('user-1', { subjectId: 'sub1' });

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          examSessionQuestion: expect.objectContaining({ question: { subjectId: 'sub1' } }),
        }),
      }),
    );
  });

  /* 분류축별 분해 (#33 도그푸딩 잔여 2) */

  it('축별로 쪼개 낮은 득점률부터 세운다 — 첫 줄이 다음에 손볼 곳이어야 한다', async () => {
    const { service } = await makeService(
      { _count: 6, _sum: { earnedPoints: 30, rubricTotalPoints: 60 } },
      [
        axisRow('d1', '문법', 2, 10),
        axisRow('d1', '문법', 3, 10),
        axisRow('d1', '문법', 5, 10),
        axisRow('d2', '독해', 9, 10),
        axisRow('d2', '독해', 8, 10),
        axisRow('d2', '독해', 10, 10),
      ],
    );

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore?.byDetail).toEqual([
      { key: 'd1', label: '문법', count: 3, earnedPoints: 10, totalPoints: 30, ratio: 0.33 },
      { key: 'd2', label: '독해', count: 3, earnedPoints: 27, totalPoints: 30, ratio: 0.9 },
    ]);
  });

  it('축별 비율은 Σ획득/Σ만점이다 — 배점이 큰 문항이 더 무겁다', async () => {
    const { service } = await makeService(
      { _count: 3, _sum: { earnedPoints: 12, rubricTotalPoints: 44 } },
      [axisRow('d1', '서술', 10, 20), axisRow('d1', '서술', 1, 20), axisRow('d1', '서술', 1, 4)],
    );

    const result = await service.notes('user-1');

    // 답안별 비율의 평균이면 (0.5+0.05+0.25)/3 = 0.27이 된다. 배점 가중은 12/44 = 0.27...
    // 우연히 비슷해 보이지 않게 원점수도 함께 고정한다.
    expect(result.summary.rubricScore?.byDetail[0]).toMatchObject({
      earnedPoints: 12,
      totalPoints: 44,
      ratio: 0.27,
    });
  });

  it('표본이 하한 미만인 축은 숨기지 않고 "판정을 미룬 축"으로 알린다', async () => {
    const { service } = await makeService(
      { _count: 4, _sum: { earnedPoints: 20, rubricTotalPoints: 40 } },
      [
        axisRow('d1', '문법', 5, 10),
        axisRow('d1', '문법', 5, 10),
        axisRow('d1', '문법', 5, 10),
        axisRow('d2', '독해', 5, 10),
      ],
    );

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore?.byDetail.map((d) => d.key)).toEqual(['d1']);
    expect(result.summary.rubricScore?.needsMoreData).toEqual([
      { key: 'd2', label: '독해', count: 1 },
    ]);
  });

  it('하위요소가 없는 문항은 미분류 축으로 모인다 — 표본이 새지 않는다', async () => {
    const { service } = await makeService(
      { _count: 3, _sum: { earnedPoints: 15, rubricTotalPoints: 30 } },
      [axisRow(null, null, 5, 10), axisRow(null, null, 5, 10), axisRow(null, null, 5, 10)],
    );

    const result = await service.notes('user-1');

    expect(result.summary.rubricScore?.byDetail[0]).toMatchObject({
      key: 'UNCLASSIFIED',
      label: '미분류',
      count: 3,
    });
  });

  it('전체가 하한 미달이면 축별 조회를 아예 하지 않는다 — 부분집합이라 볼 것도 없다', async () => {
    const { service, findMany } = await makeService({
      _count: 1,
      _sum: { earnedPoints: 5, rubricTotalPoints: 10 },
    });

    await service.notes('user-1');

    // 채점 이력 조회(include) 한 번만 나가고, 축별 조회(select)는 나가지 않는다.
    expect(findMany.mock.calls.filter((c) => (c[0] as { select?: unknown }).select)).toHaveLength(0);
  });

  it('축별 조회는 전체 집계와 같은 where를 쓴다 — 두 숫자가 다른 모집단을 말하면 안 된다', async () => {
    const { service, aggregate, findMany } = await makeService(
      { _count: 3, _sum: { earnedPoints: 9, rubricTotalPoints: 30 } },
      [axisRow('d1', '문법', 3, 10)],
    );

    await service.notes('user-1', { subjectId: 'sub1' });

    const axisCall = findMany.mock.calls.find((c) => (c[0] as { select?: unknown }).select);
    expect((axisCall?.[0] as { where: unknown }).where).toEqual(
      (aggregate.mock.calls[0][0] as { where: unknown }).where,
    );
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

describe('MeService.reviewQueue', () => {
  const build = (rows: any[]) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { userQuestionReviewState: { findMany } } as unknown as PrismaService;
    return { service: new MeService(prisma), findMany };
  };

  it('복습 상태를 직접 읽는다 — 채점 이력 상한(500)과 무관하게 큐가 완전해야 한다', async () => {
    const past = new Date(Date.now() - 86_400_000);
    const { service, findMany } = build([
      { questionId: 'q1', status: 'X', nextReviewAt: past },
      { questionId: 'q2', status: 'TRIANGLE', nextReviewAt: null },
    ]);

    const out = await service.reviewQueue('u1');

    expect(out.questionIds).toEqual(['q1', 'q2']); // 도래분 → 기록 없음 순
    expect(out.remaining).toBe(0);
    // 오답노트(examSessionAnswer)를 거치지 않는다.
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('O는 DB에서 걷어낸다 — 복습 대상이 아닌 행을 나르지 않는다', async () => {
    const { service, findMany } = build([]);
    await service.reviewQueue('u1');
    expect(findMany.mock.calls[0][0].where.status).toEqual({ notIn: ['O', 'MASTERED'] });
  });

  it('마스터 포함 토글이면 MASTERED는 남기고 O만 뺀다', async () => {
    const { service, findMany } = build([]);
    await service.reviewQueue('u1', { includeMastered: true });
    expect(findMany.mock.calls[0][0].where.status).toEqual({ not: 'O' });
  });

  it('범위 필터를 문항 조건으로 옮긴다 — 화면이 보는 범위와 복습 범위가 같아야 한다', async () => {
    const { service, findMany } = build([]);
    await service.reviewQueue('u1', { examType: '수능', subjectId: 'sub1' });
    expect(findMany.mock.calls[0][0].where.question).toEqual({
      subjectId: 'sub1',
      subject: { examType: '수능' },
    });
  });

  it('범위가 없으면 문항 조건 자체를 걸지 않는다', async () => {
    const { service, findMany } = build([]);
    await service.reviewQueue('u1');
    expect(findMany.mock.calls[0][0].where.question).toBeUndefined();
  });

  it('상한을 넘으면 급한 순으로 자르고 잔여 수를 알린다', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      questionId: `q${i}`,
      status: 'X',
      nextReviewAt: new Date(Date.now() - (5 - i) * 86_400_000),
    }));
    const { service } = build(rows);

    const out = await service.reviewQueue('u1', { limit: 2 });

    expect(out.questionIds).toEqual(['q0', 'q1']); // 가장 오래 밀린 둘
    expect(out.remaining).toBe(3);
  });
});
