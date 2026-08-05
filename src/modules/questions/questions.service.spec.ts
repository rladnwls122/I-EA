import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { QuestionsService } from './questions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { UpdateQuestionDto } from './dto/update-question.dto';

/** 최소 ProseMirror doc. buildSearchText가 안전하게 훑을 수 있는 형태. */
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/**
 * update()를 트랜잭션 콜백까지 실행시키는 목.
 * $transaction(cb) → cb(tx)를 그대로 호출해 내부에서 어떤 쿼리가 나갔는지 관찰한다.
 */
function buildPrisma(existingMetadata: unknown = null) {
  const tx = {
    questionChoiceStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    question: {
      update: jest.fn().mockResolvedValue({ id: 'q1', updatedAt: new Date(0) }),
    },
  };
  const prisma = {
    question: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'q1',
        creatorId: 'user-1',
        status: 'PUBLISHED',
        stem: doc('원래 발문'),
        choices: [{ id: 'c1', content: doc('보기 1'), isCorrect: true }],
        explanation: null,
        correctAnswerText: null,
        metadata: existingMetadata,
      }),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return { prisma, tx };
}

async function makeService(prisma: PrismaService) {
  const module = await Test.createTestingModule({
    providers: [
      QuestionsService,
      { provide: PrismaService, useValue: prisma },
      // update()는 LLM을 쓰지 않지만 생성자가 요구한다.
      { provide: GeminiLlmService, useValue: {} },
    ],
  }).compile();
  return module.get(QuestionsService);
}

describe('QuestionsService.update — 선지 수정 시 통계 리셋', () => {
  it('choices가 오면 선지 통계를 지우고 집계 캐시를 0으로 되돌린다', async () => {
    const { prisma, tx } = buildPrisma();
    const service = await makeService(prisma);

    const dto = {
      choices: [{ id: 'c1', content: doc('새 보기'), isCorrect: true }],
    } as unknown as UpdateQuestionDto;

    await service.update('q1', 'user-1', dto);

    expect(tx.questionChoiceStat.deleteMany).toHaveBeenCalledWith({ where: { questionId: 'q1' } });

    const data = tx.question.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      totalSolvedCount: 0,
      correctSolvedCount: 0,
      totalTimeSpentSec: 0,
      timedSolvedCount: 0,
    });
  });

  it('발문만 바꾸면 통계를 보존한다 (리셋 쿼리가 나가지 않는다)', async () => {
    const { prisma, tx } = buildPrisma();
    const service = await makeService(prisma);

    const dto = { stem: doc('바뀐 발문') } as unknown as UpdateQuestionDto;
    await service.update('q1', 'user-1', dto);

    expect(tx.questionChoiceStat.deleteMany).not.toHaveBeenCalled();

    const data = tx.question.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('totalSolvedCount');
    expect(data).not.toHaveProperty('timedSolvedCount');
    // 발문이 바뀌었으므로 search_text는 다시 계산된다.
    expect(data.searchText).toContain('바뀐 발문');
  });

  it('빈 배열이어도 choices가 본문에 있으면 리셋한다 (undefined와 구분)', async () => {
    const { prisma, tx } = buildPrisma();
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', { choices: [] } as unknown as UpdateQuestionDto);

    expect(tx.questionChoiceStat.deleteMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * metadata는 주인이 여럿인 필드다(빈칸 번호·OX 표시·자기검증 기록).
 * 통째로 교체하면 캔버스가 판정 하나를 저장할 때 지문 빈칸 번호가 함께 사라진다 —
 * 그래서 예전엔 기존 문항에 판정을 아예 안 실었고, 교체안의 판정이 저장되지 않았다.
 */
describe('QuestionsService.update — metadata 병합과 판정 집계 컬럼', () => {
  it('보낸 키만 덮어쓰고 남의 키는 남긴다', async () => {
    const { prisma, tx } = buildPrisma({ blankIndex: 3 });
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', {
      metadata: { review: { verdict: 'REVISE', axes: ['오답매력도'] } },
    } as unknown as UpdateQuestionDto);

    const data = tx.question.update.mock.calls[0][0].data;
    expect(data.metadata).toEqual({
      blankIndex: 3,
      review: { verdict: 'REVISE', axes: ['오답매력도'] },
    });
    // 근거(Json)와 집계 컬럼은 **같은 쓰기**에서 채워진다.
    expect(data.reviewVerdict).toBe('REVISE');
  });

  it('metadata가 안 오면 컬럼도 판정도 건드리지 않는다', async () => {
    const { prisma, tx } = buildPrisma({ blankIndex: 3 });
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', { stem: doc('발문만') } as unknown as UpdateQuestionDto);

    const data = tx.question.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('metadata');
    expect(data).not.toHaveProperty('reviewVerdict');
  });

  it('마지막 키까지 지우면 컬럼을 null로 되돌린다 (빈 객체를 남기지 않는다)', async () => {
    const { prisma, tx } = buildPrisma({ blankIndex: 3 });
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', {
      metadata: { blankIndex: null },
    } as unknown as UpdateQuestionDto);

    const data = tx.question.update.mock.calls[0][0].data;
    expect(data.metadata).toBe(Prisma.DbNull);
    expect(data.reviewVerdict).toBeNull();
  });
});
