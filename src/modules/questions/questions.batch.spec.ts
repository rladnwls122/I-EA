import { ValidationPipe, ForbiddenException, Logger } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { QUESTION_BATCH_MAX } from '@/common/constants/question';
import { BatchUpdateQuestionsDto } from './dto/batch-update-question.dto';
import { BatchAddQuestionsDto } from '@/modules/workbooks/dto/batch-add-questions.dto';

/**
 * 문항 배치 (#41 Phase 3 마감) — 갱신 배치와 배치 DTO의 계약.
 *
 * 배치가 지켜야 하는 건 "왕복이 줄었다"가 아니라 **단건 경로와 같은 결과**다.
 * 여기서는 그중 서버쪽 계약(항목별 결과·검증 재사용·상한)을 고정한다.
 */

/** update()를 가짜로 바꾼 서비스 — updateBatch가 그 위에서 무엇을 하는지만 본다. */
function serviceWithUpdate(update: jest.Mock) {
  const service = new QuestionsService({} as PrismaService, {} as GeminiLlmService);
  (service as unknown as { update: unknown }).update = update;
  return service;
}

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('QuestionsService.updateBatch', () => {
  it('항목마다 단건 update()를 그대로 부른다 — 배치용 쓰기 경로를 따로 만들지 않는다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = serviceWithUpdate(update);

    await service.updateBatch('user-1', {
      items: [
        { id: 'q-1', points: 2 },
        { id: 'q-2', points: 3 },
      ],
    } as BatchUpdateQuestionsDto);

    expect(update).toHaveBeenNthCalledWith(1, 'q-1', 'user-1', { points: 2 });
    expect(update).toHaveBeenNthCalledWith(2, 'q-2', 'user-1', { points: 3 });
  });

  it('한 항목이 실패해도 나머지는 저장되고, 실패는 항목별로 돌아온다', async () => {
    const update = jest.fn(async (id: string) => {
      if (id === 'q-2') throw new ForbiddenException('본인이 작성한 문제만 수정할 수 있습니다.');
      return {};
    });
    const service = serviceWithUpdate(update as unknown as jest.Mock);

    const out = await service.updateBatch('user-1', {
      items: [{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-3' }],
    } as BatchUpdateQuestionsDto);

    expect(out.okCount).toBe(2);
    expect(out.failedCount).toBe(1);
    expect(out.results[1]).toEqual({
      index: 1,
      status: 'failed',
      questionId: 'q-2',
      error: '본인이 작성한 문제만 수정할 수 있습니다.',
    });
  });

  it('내부 오류(HttpException이 아닌 것)의 문구는 그대로 내보내지 않는다', async () => {
    // 배치는 실패 사유를 대량으로 돌려주는 자리라 단건보다 유출 표면이 넓다.
    // (덮은 원문은 서버 로그에만 남는다 — 테스트 출력을 더럽히지 않게 가린다.)
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const update = jest.fn().mockRejectedValue(new Error('Invalid `prisma.question.update()` ...'));
    const service = serviceWithUpdate(update);

    const out = await service.updateBatch('user-1', {
      items: [{ id: 'q-1' }],
    } as BatchUpdateQuestionsDto);

    expect(out.results[0].error).toBe('저장 중 오류가 발생했습니다.');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('index로 요청 위치를 되짚을 수 있다 — 몇 번째 카드가 실패했는지 화면에 옮겨야 한다', async () => {
    const update = jest.fn().mockResolvedValue({});
    const service = serviceWithUpdate(update);
    const out = await service.updateBatch('user-1', {
      items: [{ id: 'q-1' }, { id: 'q-2' }, { id: 'q-3' }],
    } as BatchUpdateQuestionsDto);
    expect(out.results.map((r) => r.index)).toEqual([0, 1, 2]);
  });
});

describe('배치 DTO — 상한과 원형 보존', () => {
  // main.ts의 전역 파이프와 동일한 설정.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const createItem = () => ({
    subjectId: '11111111-1111-4111-8111-111111111111',
    questionType: '객관식',
    stem: doc('발문'),
    choices: [
      { id: 'c1', isCorrect: true, content: doc('선지1') },
      { id: 'c2', isCorrect: false, content: doc('선지2') },
    ],
    explanation: [{ type: 'paragraph', content: [{ type: 'text', text: '해설' }] }],
  });

  const transform = (metatype: unknown, value: unknown) =>
    pipe.transform(structuredClone(value), {
      type: 'body',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metatype: metatype as any,
    });

  it(`담기 배치는 ${QUESTION_BATCH_MAX}건까지 통과한다`, async () => {
    const items = Array.from({ length: QUESTION_BATCH_MAX }, createItem);
    await expect(transform(BatchAddQuestionsDto, { items })).resolves.toBeDefined();
  });

  it('상한을 넘으면 거부한다 — 상한 없는 배치는 트랜잭션 타임아웃으로 돌아온다', async () => {
    const items = Array.from({ length: QUESTION_BATCH_MAX + 1 }, createItem);
    await expect(transform(BatchAddQuestionsDto, { items })).rejects.toThrow();
  });

  it('빈 배열은 거부한다', async () => {
    await expect(transform(BatchAddQuestionsDto, { items: [] })).rejects.toThrow();
  });

  it('중첩된 항목도 단건 DTO와 같은 검증을 받는다 — 배치가 샛길이 되면 안 된다', async () => {
    const bad = { ...createItem(), questionType: '서술형' }; // QUESTION_KINDS 밖
    await expect(transform(BatchAddQuestionsDto, { items: [bad] })).rejects.toThrow();
  });

  it('중첩 항목의 Json 배열(choices·explanation)이 원형 그대로 살아남는다', async () => {
    // enableImplicitConversion이 Array<Record> 원소를 new Array()로 변조하던 버그가
    // 선지·해설을 통째로 []로 만들었다. 중첩 한 겹이 더 생긴 배치에서도 같은지 확인한다.
    const items = [createItem()];
    const out = (await transform(BatchAddQuestionsDto, { items })) as BatchAddQuestionsDto;
    expect(JSON.parse(JSON.stringify(out.items[0]))).toMatchObject({
      choices: items[0].choices,
      explanation: items[0].explanation,
    });
  });

  it('갱신 배치 항목은 id가 필수다', async () => {
    await expect(transform(BatchUpdateQuestionsDto, { items: [{ points: 2 }] })).rejects.toThrow();
  });

  it('갱신 배치는 나머지 필드가 전부 선택이다(부분 수정)', async () => {
    const out = (await transform(BatchUpdateQuestionsDto, {
      items: [{ id: '11111111-1111-4111-8111-111111111111', tagIds: [], passageId: null }],
    })) as BatchUpdateQuestionsDto;
    // 삭제를 표현하는 값(빈 배열·null)이 파이프를 지나면서 사라지면 안 된다.
    expect(out.items[0].tagIds).toEqual([]);
    expect(out.items[0].passageId).toBeNull();
  });
});
