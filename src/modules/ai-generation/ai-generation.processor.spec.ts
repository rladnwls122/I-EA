import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AiGenerationProcessor } from './ai-generation.processor';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';

/**
 * AI 자동 키워드 태깅 — keywords 문자열 배열을 "키워드" 카테고리 태그로
 * find-or-create한다. 같은 생성 배치(트랜잭션) 안에서는 캐시로 중복 생성을 막는다
 * (catalog.service의 find-or-create와 같은 이유 — 동시 요청 중복 방지).
 */
describe('AiGenerationProcessor.resolveKeywordTagIds', () => {
  async function setup() {
    const module = await Test.createTestingModule({
      providers: [
        AiGenerationProcessor,
        { provide: PrismaService, useValue: {} },
        { provide: GeminiLlmService, useValue: {} },
      ],
    }).compile();
    const processor = module.get(AiGenerationProcessor);
    const resolve = (
      tx: Prisma.TransactionClient,
      cache: Map<string, string>,
      keywords: string[],
    ) =>
      (
        processor as unknown as {
          resolveKeywordTagIds(
            tx: Prisma.TransactionClient,
            cache: Map<string, string>,
            keywords: string[],
          ): Promise<string[]>;
        }
      ).resolveKeywordTagIds(tx, cache, keywords);
    return { resolve };
  }

  it('기존 태그가 있으면 재사용하고 새로 만들지 않는다', async () => {
    const { resolve } = await setup();
    const tx = {
      tag: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-tag' }),
        create: jest.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    const ids = await resolve(tx, new Map(), ['이차방정식']);

    expect(ids).toEqual(['existing-tag']);
    expect(tx.tag.create).not.toHaveBeenCalled();
  });

  it('없으면 "키워드" 카테고리로 생성한다', async () => {
    const { resolve } = await setup();
    const tx = {
      tag: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-tag' }),
      },
    } as unknown as Prisma.TransactionClient;

    const ids = await resolve(tx, new Map(), ['인과관계 오류']);

    expect(ids).toEqual(['new-tag']);
    expect(tx.tag.create).toHaveBeenCalledWith({
      data: { name: '인과관계 오류', category: '키워드' },
    });
  });

  it('같은 배치 안에서 같은 키워드는 캐시로 재사용 — DB를 다시 조회하지 않는다', async () => {
    const { resolve } = await setup();
    const tx = {
      tag: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-tag' }),
      },
    } as unknown as Prisma.TransactionClient;
    const cache = new Map<string, string>();

    const first = await resolve(tx, cache, ['미적분']);
    const second = await resolve(tx, cache, ['미적분']);

    expect(first).toEqual(['new-tag']);
    expect(second).toEqual(['new-tag']);
    expect(tx.tag.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.tag.create).toHaveBeenCalledTimes(1);
  });

  it('빈 문자열/공백만 있는 키워드는 건너뛴다', async () => {
    const { resolve } = await setup();
    const tx = {
      tag: { findFirst: jest.fn(), create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    const ids = await resolve(tx, new Map(), ['  ', '']);

    expect(ids).toEqual([]);
    expect(tx.tag.findFirst).not.toHaveBeenCalled();
  });
});
