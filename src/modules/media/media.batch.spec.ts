import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { MEDIA_BATCH_MAX } from './media.constants';
import { BatchCreateMediaDto } from './dto/batch-create-media.dto';

/**
 * 미디어 일괄 등록 (#33 도그푸딩 잔여 3).
 *
 * 고정하는 것은 "왕복이 줄었다"가 아니라 단건 경로에서 물려받아야 할 성질들이다:
 * 항목별 실패, 같은 검증(URL 소유·XOR·형식), 멱등, 그리고 **대상 확인이 N+1이 아님**.
 */

const QUESTION_ID = '33333333-3333-4333-8333-333333333333';
const PASSAGE_ID = '44444444-4444-4444-8444-444444444444';
const url = (n: number) => `https://cdn.example.com/media/${n}.png`;

interface Fixture {
  items: unknown[];
  /** 이미 등록돼 있다고 볼 (storageUrl) 목록 — 멱등 확인용. */
  existing?: string[];
  /** 존재하지 않는 것으로 볼 대상 id. */
  missing?: string[];
}

function run({ items, existing = [], missing = [] }: Fixture) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    question: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => !missing.includes(id)).map((id) => ({ id })),
      ),
    },
    passage: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => !missing.includes(id)).map((id) => ({ id })),
      ),
    },
    mediaAsset: {
      findFirst: jest.fn(async ({ where }: { where: { storageUrl: string } }) =>
        existing.includes(where.storageUrl) ? { id: `existing-${where.storageUrl}` } : null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `new-${created.length}` };
      }),
    },
  };
  const s3 = {
    // 실제 S3Service와 같은 예외 종류를 던진다 — 배치가 사유를 그대로 내보낼지
    // 일반 문구로 덮을지가 HttpException 여부로 갈리기 때문이다.
    assertOwnedPublicUrl: jest.fn((u: string) => {
      if (!u.startsWith('https://cdn.example.com/')) {
        throw new BadRequestException('허용된 스토리지 버킷의 URL만 등록할 수 있습니다.');
      }
    }),
  };
  const service = new MediaService(prisma as never, s3 as never);
  return {
    prisma,
    created,
    result: service.createBatch('user-1', { items } as BatchCreateMediaDto),
  };
}

const item = (n: number, over: Record<string, unknown> = {}) => ({
  assetType: 'IMAGE',
  storageUrl: url(n),
  questionId: QUESTION_ID,
  ...over,
});

describe('MediaService.createBatch', () => {
  it('항목별로 결과가 돌아온다 — 하나가 실패해도 나머지는 등록된다', async () => {
    const { result } = run({
      items: [item(1), item(2, { storageUrl: 'https://evil.example/a.png' }), item(3)],
    });
    const out = await result;

    expect(out.okCount).toBe(2);
    expect(out.failedCount).toBe(1);
    expect(out.results.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(out.results[1].status).toBe('failed');
  });

  it('형식이 깨진 항목은 그 자리만 실패한다 — 전부-아니면-전무가 아니다', async () => {
    const { result } = run({
      items: [item(1), { assetType: 'IMAGE' }, item(3)], // storageUrl 누락
    });
    const out = await result;

    expect(out.results.map((r) => r.status)).toEqual(['ok', 'failed', 'ok']);
    expect(out.results[1].error).toContain('storageUrl');
  });

  it('지문·문항을 동시에 지정한 항목은 XOR 규칙에 걸린다 — 단건과 같은 규칙', async () => {
    const { result } = run({ items: [item(1, { passageId: PASSAGE_ID })] });
    const out = await result;

    expect(out.results[0].status).toBe('failed');
    expect(out.results[0].error).toContain('정확히 하나만');
  });

  it('없는 대상은 단건과 같은 문구로 그 항목만 실패한다', async () => {
    const { result } = run({ items: [item(1), item(2)], missing: [QUESTION_ID] });
    const out = await result;

    expect(out.failedCount).toBe(2);
    expect(out.results[0].error).toBe('문제를 찾을 수 없습니다.');
  });

  it('대상 존재 확인은 항목 수와 무관하게 한 번이다 — 배치가 DB 왕복 N+1이 되면 의미가 없다', async () => {
    const { prisma, result } = run({ items: [item(1), item(2), item(3), item(4)] });
    await result;

    expect(prisma.question.findMany).toHaveBeenCalledTimes(1);
    // 같은 문항을 네 번 보내도 조회는 id 한 개로 접힌다.
    expect(prisma.question.findMany.mock.calls[0][0].where.id.in).toEqual([QUESTION_ID]);
  });

  it('지문 대상이 하나도 없으면 지문 조회를 아예 하지 않는다', async () => {
    const { prisma, result } = run({ items: [item(1)] });
    await result;
    expect(prisma.passage.findMany).not.toHaveBeenCalled();
  });

  it('같은 그림을 같은 자리에 다시 보내도 행이 늘지 않는다(멱등)', async () => {
    const { created, result } = run({ items: [item(1), item(2)], existing: [url(1)] });
    const out = await result;

    expect(out.okCount).toBe(2);
    expect(out.results[0].mediaId).toBe(`existing-${url(1)}`); // 기존 행을 그대로 돌려준다
    expect(created).toHaveLength(1); // 새로 만든 건 하나뿐
  });

  it('성공 항목은 mediaId를 단다 — 클라이언트가 등록 여부를 자리별로 되짚는다', async () => {
    const { result } = run({ items: [item(1)] });
    const out = await result;
    expect(out.results[0]).toEqual({ index: 0, status: 'ok', mediaId: 'new-1' });
  });
});

describe('BatchCreateMediaDto 상한', () => {
  it('이미지는 문항보다 많이 나올 수 있어 상한을 문항 배치보다 크게 잡는다', () => {
    expect(MEDIA_BATCH_MAX).toBeGreaterThan(50);
  });
});
