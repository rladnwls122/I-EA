import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { WorkbooksService } from './workbooks.service';
import { PrismaService } from '@/prisma/prisma.service';
import { ExamSessionsService } from '@/modules/exam-sessions/exam-sessions.service';
import { QueryWorkbookDto } from './dto/workbook.dto';

const D = (n: string | number) => new Prisma.Decimal(n);

/** 목록 응답 1건을 만들어 avgScorePercent 환산만 관찰한다. */
async function listOnce(row: { attemptCount: number; scoreSumPercent: Prisma.Decimal }) {
  const prisma = {
    $transaction: jest.fn().mockResolvedValue([[{ id: 'w1', title: 'WB', ...row }], 1]),
    workbook: { findMany: jest.fn(), count: jest.fn() },
  } as unknown as PrismaService;

  const module = await Test.createTestingModule({
    providers: [
      WorkbooksService,
      { provide: PrismaService, useValue: prisma },
      // 이 테스트들은 세션을 만들지 않지만 생성자가 요구한다.
      { provide: ExamSessionsService, useValue: {} },
    ],
  }).compile();
  const service = module.get(WorkbooksService);

  const dto = Object.assign(new QueryWorkbookDto(), { page: 1, limit: 20 });
  const result = await service.list(dto, 'user-1');
  return result.items[0] as Record<string, unknown>;
}

/** addQuestion의 displayOrder 계산만 관찰하는 목. */
async function addQuestionOnce(displayOrder: number | undefined, currentMax: number | null) {
  const tx = {
    workbookQuestion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { displayOrder: currentMax } }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockImplementation((args) => Promise.resolve(args.data)),
    },
    workbook: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    workbook: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'user-1' }) },
    question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1' }]) },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  const module = await Test.createTestingModule({
    providers: [
      WorkbooksService,
      { provide: PrismaService, useValue: prisma },
      // 이 테스트들은 세션을 만들지 않지만 생성자가 요구한다.
      { provide: ExamSessionsService, useValue: {} },
    ],
  }).compile();
  const service = module.get(WorkbooksService);

  const row = await service.addQuestion('w1', { questionId: 'q1', displayOrder }, 'user-1');
  return { row: row as { displayOrder: number }, tx };
}

describe('WorkbooksService.addQuestion — displayOrder', () => {
  it('생략하면 맨 뒤에 붙는다 (max + 1)', async () => {
    const { row, tx } = await addQuestionOnce(undefined, 4);
    expect(row.displayOrder).toBe(5);
    expect(tx.workbookQuestion.updateMany).not.toHaveBeenCalled();
  });

  it('빈 문제집이면 0', async () => {
    const { row } = await addQuestionOnce(undefined, null);
    expect(row.displayOrder).toBe(0);
  });

  it('지정하면 그 값 그대로 쓴다 (+1 하지 않는다)', async () => {
    const { row } = await addQuestionOnce(2, 4);
    expect(row.displayOrder).toBe(2);
  });

  it('중간 삽입 시 그 자리 이후를 한 칸씩 밀어낸다', async () => {
    const { tx } = await addQuestionOnce(2, 4);
    expect(tx.workbookQuestion.updateMany).toHaveBeenCalledWith({
      where: { workbookId: 'w1', displayOrder: { gte: 2 } },
      data: { displayOrder: { increment: 1 } },
    });
  });
});

describe('WorkbooksService — 평균 점수 캐시 환산', () => {
  it('avg = scoreSumPercent / attemptCount, 소수 1자리 반올림', async () => {
    // 3회 응시: 80 + 90 + 75 = 245 → 81.666… → 81.7
    const item = await listOnce({ attemptCount: 3, scoreSumPercent: D(245) });
    expect(item.avgScorePercent).toBe(81.7);
  });

  it('응시 이력이 없으면 null (0으로 내리지 않는다)', async () => {
    const item = await listOnce({ attemptCount: 0, scoreSumPercent: D(0) });
    expect(item.avgScorePercent).toBeNull();
  });

  it('원시 캐시 컬럼(scoreSumPercent)은 응답에서 감춘다', async () => {
    const item = await listOnce({ attemptCount: 2, scoreSumPercent: D(150) });
    expect(item).not.toHaveProperty('scoreSumPercent');
    expect(item.avgScorePercent).toBe(75);
    // attemptCount는 "N명 응시" 표기에 쓰이므로 남긴다.
    expect(item.attemptCount).toBe(2);
  });
});
