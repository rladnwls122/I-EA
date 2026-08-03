import { NotFoundException } from '@nestjs/common';
import { AiGenerationService } from './ai-generation.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';

const ROW = {
  id: 'gen-1',
  creatorId: 'owner',
  status: 'DONE',
  model: 'gemini-2.5-flash',
  createdAt: new Date('2026-01-01'),
  passages: [{ id: 'p1' }],
  questions: [{ id: 'q1', questionType: '객관식', status: 'DRAFT' }],
};

function makeService(row: unknown) {
  const prisma = {
    aiGeneration: { findUnique: jest.fn().mockResolvedValue(row) },
  } as unknown as PrismaService;
  return new AiGenerationService(prisma, {} as GeminiLlmService, {} as never);
}

describe('AiGenerationService.getGeneration — 소유자 검사(IDOR)', () => {
  it('본인 생성 작업은 조회된다', async () => {
    await expect(makeService(ROW).getGeneration('gen-1', 'owner')).resolves.toMatchObject({
      id: 'gen-1',
      passageIds: ['p1'],
    });
  });

  it('남의 생성 작업은 404로 막는다(존재 여부도 노출하지 않는다)', async () => {
    await expect(makeService(ROW).getGeneration('gen-1', 'attacker')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('없는 작업은 404', async () => {
    await expect(makeService(null).getGeneration('nope', 'owner')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
