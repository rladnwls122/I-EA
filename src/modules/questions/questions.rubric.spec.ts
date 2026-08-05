import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { QuestionsService } from './questions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

/**
 * 채점기준표를 **저장해도 되는 문항인지**는 DTO 혼자 판단할 수 없다(PATCH는 유형 없이
 * rubric만 올 수 있다). questions.service가 기존 행과 병합해 판정하는 그 규칙을 고정한다.
 */

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const RUBRIC = [{ id: 'c1', text: '핵심어 포함', points: 3 }];

function buildPrisma(existing: Record<string, unknown> = {}) {
  const tx = {
    questionChoiceStat: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    question: { update: jest.fn().mockResolvedValue({ id: 'q1', updatedAt: new Date(0) }) },
  };
  const prisma = {
    subject: { findUnique: jest.fn().mockResolvedValue({ id: 'sub1' }) },
    question: {
      create: jest.fn().mockResolvedValue({ id: 'q1', status: 'DRAFT', createdAt: new Date(0) }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'q1',
        creatorId: 'user-1',
        status: 'DRAFT',
        stem: doc('발문'),
        choices: null,
        explanation: null,
        correctAnswerText: null,
        questionType: '주관식',
        rubric: null,
        ...existing,
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
      { provide: GeminiLlmService, useValue: {} },
    ],
  }).compile();
  return module.get(QuestionsService);
}

const createDto = (over: Partial<CreateQuestionDto> = {}): CreateQuestionDto =>
  ({
    subjectId: 'sub1',
    questionType: '주관식',
    stem: doc('발문'),
    ...over,
  }) as CreateQuestionDto;

describe('QuestionsService.create — 채점기준표 허용 규칙', () => {
  it('서술형(정답 텍스트 없음) 주관식에는 저장한다', async () => {
    const { prisma } = buildPrisma();
    const service = await makeService(prisma);

    await service.create('user-1', createDto({ rubric: RUBRIC }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.question.create as any).mock.calls[0][0].data.rubric).toEqual(RUBRIC);
  });

  it('객관식에는 400 — 자동채점이라 기준이 쓰일 자리가 없다', async () => {
    const { prisma } = buildPrisma();
    const service = await makeService(prisma);

    await expect(
      service.create('user-1', createDto({ questionType: '객관식', rubric: RUBRIC })),
    ).rejects.toThrow(BadRequestException);
  });

  it('단답 정답이 있는 주관식에도 400 — 문자열 비교로 자동채점된다', async () => {
    const { prisma } = buildPrisma();
    const service = await makeService(prisma);

    await expect(
      service.create('user-1', createDto({ correctAnswerText: '광합성', rubric: RUBRIC })),
    ).rejects.toThrow(BadRequestException);
  });

  it('빈 배열은 "기준 없음"이라 통과하고, 컬럼에도 쓰지 않는다', async () => {
    const { prisma } = buildPrisma();
    const service = await makeService(prisma);

    await service.create('user-1', createDto({ questionType: '객관식', rubric: [] }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.question.create as any).mock.calls[0][0].data.rubric).toBeUndefined();
  });
});

describe('QuestionsService.update — 채점기준표 허용 규칙(병합 판정)', () => {
  it('유형을 안 보내도 기존 유형이 객관식이면 거부한다', async () => {
    const { prisma } = buildPrisma({ questionType: '객관식' });
    const service = await makeService(prisma);

    await expect(
      service.update('q1', 'user-1', { rubric: RUBRIC } as UpdateQuestionDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('기존 rubric이 있는 문항을 객관식으로 바꾸려 하면 거부한다', async () => {
    const { prisma } = buildPrisma({ rubric: RUBRIC });
    const service = await makeService(prisma);

    await expect(
      service.update('q1', 'user-1', { questionType: '객관식' } as UpdateQuestionDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('빈 배열은 기준 삭제로 저장한다(생략은 "안 건드림"이라 삭제를 표현할 수 없다)', async () => {
    const { prisma, tx } = buildPrisma({ rubric: RUBRIC });
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', { rubric: [] } as UpdateQuestionDto);

    // Json 컬럼을 NULL로 만들려면 Prisma.DbNull이어야 한다(JS null은 "JSON null" 값이다).
    expect(prisma).toBeDefined();
    expect(tx.question.update.mock.calls[0][0].data.rubric).toBe(Prisma.DbNull);
  });

  it('rubric을 안 보내면 기존 값을 건드리지 않는다', async () => {
    const { prisma, tx } = buildPrisma({ rubric: RUBRIC });
    const service = await makeService(prisma);

    await service.update('q1', 'user-1', { hintContent: '힌트' } as UpdateQuestionDto);

    expect(prisma).toBeDefined();
    expect(tx.question.update.mock.calls[0][0].data.rubric).toBeUndefined();
  });
});
