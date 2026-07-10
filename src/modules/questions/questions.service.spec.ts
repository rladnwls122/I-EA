import { Test } from '@nestjs/testing';
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
function buildPrisma() {
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
