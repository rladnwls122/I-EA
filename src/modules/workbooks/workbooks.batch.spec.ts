import { BadRequestException } from '@nestjs/common';
import { WorkbooksService } from './workbooks.service';
import { BatchAddQuestionsDto } from './dto/batch-add-questions.dto';
import { CreateQuestionDto } from '@/modules/questions/dto/create-question.dto';

/**
 * 문항 일괄 생성+발행+담기 (#41 Phase 3 마감).
 *
 * 여기서 고정하는 것은 배치가 단건 경로에서 물려받아야 할 성질들이다:
 * 순서·항목별 실패·소유권. 그중 하나라도 무너지면 왕복을 줄인 대가로 저장이 망가진다.
 */

const item = (n: number): CreateQuestionDto =>
  ({
    subjectId: 'subj-1',
    questionType: '객관식',
    stem: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `발문${n}` }] }] },
  }) as unknown as CreateQuestionDto;

/**
 * 배치를 한 번 돌린다. `failAt`에 든 인덱스는 문항 생성이 던지도록 해
 * 항목별 실패를 만든다.
 */
async function runBatch(opts: {
  count: number;
  failAt?: number[];
  currentMax?: number | null;
  visibility?: string;
}) {
  const failAt = new Set(opts.failAt ?? []);
  let seq = 0;
  const tx = {
    workbookQuestion: { create: jest.fn().mockResolvedValue({}) },
    workbook: { update: jest.fn().mockResolvedValue({}) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ coins: 0, xp: 0, authorRewardDate: null, authorRewardCount: 0 }),
      update: jest.fn().mockResolvedValue({ coins: 20, xp: 20 }),
    },
    coinHistory: { create: jest.fn().mockResolvedValue({}) },
    xpHistory: { create: jest.fn().mockResolvedValue({}) },
  };
  const rolledBack: number[] = [];
  const prisma = {
    workbook: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ ownerId: 'user-1', visibility: opts.visibility ?? 'PRIVATE' }),
    },
    workbookQuestion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { displayOrder: opts.currentMax ?? null } }),
    },
    // 콜백이 던지면 그 트랜잭션은 통째로 되돌아간다 — 실제 Prisma와 같은 계약.
    $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => {
      const at = seq;
      try {
        return await cb(tx);
      } catch (e) {
        rolledBack.push(at);
        throw e;
      }
    }),
  };
  const questions = {
    createPublishedWithin: jest.fn(async () => {
      const index = seq++;
      if (failAt.has(index)) throw new BadRequestException(`${index}번 항목 거부`);
      return { id: `q-${index + 1}` };
    }),
  };

  const service = new WorkbooksService(
    prisma as never,
    {} as never,
    questions as never,
  );
  const dto: BatchAddQuestionsDto = {
    items: Array.from({ length: opts.count }, (_, i) => item(i)),
  };
  const result = await service.addQuestionsBatch('wb-1', dto, 'user-1');
  return { result, tx, prisma, questions, rolledBack };
}

describe('WorkbooksService.addQuestionsBatch — 순서', () => {
  it('요청 순서대로 displayOrder를 매긴다 — items 순서가 곧 문제집 순서다', async () => {
    const { result, tx } = await runBatch({ count: 3 });

    expect(result.results.map((r) => r.displayOrder)).toEqual([0, 1, 2]);
    expect(tx.workbookQuestion.create.mock.calls.map((c) => c[0].data)).toEqual([
      { workbookId: 'wb-1', questionId: 'q-1', displayOrder: 0 },
      { workbookId: 'wb-1', questionId: 'q-2', displayOrder: 1 },
      { workbookId: 'wb-1', questionId: 'q-3', displayOrder: 2 },
    ]);
  });

  it('기존 문항이 있으면 맨 뒤에 이어 붙인다 — 시작 순번은 한 번만 조회한다', async () => {
    const { result, prisma } = await runBatch({ count: 2, currentMax: 4 });

    expect(result.results.map((r) => r.displayOrder)).toEqual([5, 6]);
    expect(prisma.workbookQuestion.aggregate).toHaveBeenCalledTimes(1); // 항목마다 돌면 N+1이다
  });

  it('중간 항목이 실패해도 남은 항목의 순서에 구멍이 생기지 않는다', async () => {
    const { result } = await runBatch({ count: 4, failAt: [1] });

    expect(result.results.map((r) => r.status)).toEqual(['ok', 'failed', 'ok', 'ok']);
    expect(result.results.map((r) => r.displayOrder)).toEqual([0, undefined, 1, 2]);
  });
});

describe('WorkbooksService.addQuestionsBatch — 부분 실패', () => {
  it('한 항목이 실패해도 나머지는 저장된다 — 전부 되돌리면 저장이 아니라 사고다', async () => {
    const { result } = await runBatch({ count: 3, failAt: [0] });

    expect(result.okCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results[0]).toMatchObject({ index: 0, status: 'failed', error: '0번 항목 거부' });
    expect(result.results[1]).toMatchObject({ index: 1, status: 'ok', questionId: 'q-2' });
  });

  it('실패한 항목은 자기 트랜잭션째 되돌아간다 — 어디에도 안 담긴 유령 문항을 남기지 않는다', async () => {
    // FK가 없는 TiDB(relationMode="prisma")에서는 DB가 치워 주지 않는다.
    const { rolledBack, result } = await runBatch({ count: 3, failAt: [2] });

    expect(rolledBack).toEqual([2]);
    expect(result.results[2].questionId).toBeUndefined();
  });

  it('실패 사유는 항목별로 그대로 돌아온다 — 어느 카드가 왜 실패했는지 화면에 옮겨야 한다', async () => {
    const { result } = await runBatch({ count: 3, failAt: [0, 2] });
    expect(result.results.filter((r) => r.status === 'failed').map((r) => r.index)).toEqual([0, 2]);
  });
});

describe('WorkbooksService.addQuestionsBatch — 단건 경로의 검증을 물려받는다', () => {
  it('남의 문제집이면 아무것도 만들지 않는다', async () => {
    const prisma = {
      workbook: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'someone-else', visibility: 'PRIVATE' }) },
      workbookQuestion: { aggregate: jest.fn() },
      $transaction: jest.fn(),
    };
    const questions = { createPublishedWithin: jest.fn() };
    const service = new WorkbooksService(prisma as never, {} as never, questions as never);

    await expect(
      service.addQuestionsBatch('wb-1', { items: [item(0)] }, 'user-1'),
    ).rejects.toThrow('본인 문제집만 수정할 수 있습니다.');
    expect(questions.createPublishedWithin).not.toHaveBeenCalled();
  });

  it('문항 생성은 questions 모듈 코드를 그대로 탄다 — 배치가 검증 우회로가 되면 안 된다', async () => {
    const { questions } = await runBatch({ count: 1 });
    expect(questions.createPublishedWithin).toHaveBeenCalledWith(
      expect.anything(), // 트랜잭션 클라이언트
      'user-1',
      expect.objectContaining({ subjectId: 'subj-1' }),
    );
  });

  it('questionCount는 담긴 수만큼만 오른다', async () => {
    const { tx } = await runBatch({ count: 3, failAt: [1] });
    expect(tx.workbook.update).toHaveBeenCalledTimes(2);
  });

  it('이미 공개된 문제집이면 담기는 곧 발행이라 저자 보상이 나간다 — 단건 addQuestion과 같은 규칙', async () => {
    const { tx } = await runBatch({ count: 2, visibility: 'PUBLIC' });
    expect(tx.coinHistory.create).toHaveBeenCalledTimes(2);
  });

  it('비공개 문제집에서는 보상이 나가지 않는다', async () => {
    const { tx } = await runBatch({ count: 2, visibility: 'PRIVATE' });
    expect(tx.coinHistory.create).not.toHaveBeenCalled();
  });
});
