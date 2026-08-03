import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { AiGenerationProcessor } from './ai-generation.processor';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';

/**
 * AI 자동 키워드 태깅 — keywords 문자열 배열을 "키워드" 카테고리 태그로 upsert한다.
 * tags는 (category, name)이 유니크라 upsert가 멱등하다. 같은 생성 배치(트랜잭션)
 * 안에서는 캐시로 재조회까지 막는다(catalog.service.createTag와 같은 패턴).
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

  /** upsert 한 번으로 기존 재사용/신규 생성이 모두 처리되므로 목도 하나면 된다. */
  const txWith = (id: string) =>
    ({
      tag: { upsert: jest.fn().mockResolvedValue({ id }) },
    }) as unknown as Prisma.TransactionClient;

  it('기존 태그가 있으면 그 id를 그대로 쓴다', async () => {
    const { resolve } = await setup();
    const tx = txWith('existing-tag');

    const ids = await resolve(tx, new Map(), ['이차방정식']);

    expect(ids).toEqual(['existing-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledTimes(1);
  });

  it('"키워드" 카테고리 복합 유니크 키로 upsert한다 — 중복 행이 생기지 않는다', async () => {
    const { resolve } = await setup();
    const tx = txWith('new-tag');

    const ids = await resolve(tx, new Map(), ['인과관계 오류']);

    expect(ids).toEqual(['new-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category_name: { category: '키워드', name: '인과관계 오류' } },
        update: {},
        create: { name: '인과관계 오류', category: '키워드' },
      }),
    );
  });

  it('같은 배치 안에서 같은 키워드는 캐시로 재사용 — DB를 다시 건드리지 않는다', async () => {
    const { resolve } = await setup();
    const tx = txWith('new-tag');
    const cache = new Map<string, string>();

    const first = await resolve(tx, cache, ['미적분']);
    const second = await resolve(tx, cache, ['미적분']);

    expect(first).toEqual(['new-tag']);
    expect(second).toEqual(['new-tag']);
    expect(tx.tag.upsert).toHaveBeenCalledTimes(1);
  });

  it('빈 문자열/공백만 있는 키워드는 건너뛴다', async () => {
    const { resolve } = await setup();
    const tx = txWith('unused');

    const ids = await resolve(tx, new Map(), ['  ', '']);

    expect(ids).toEqual([]);
    expect(tx.tag.upsert).not.toHaveBeenCalled();
  });
});
