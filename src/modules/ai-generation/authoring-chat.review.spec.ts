import type { Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { AuthoringChatService } from './authoring-chat.service';
import { parseChatQuestions, toReviewInput } from './authoring-chat.review';
import type { AuthoringChatDto } from './dto/authoring-chat.dto';

/**
 * 출제 캔버스의 자기검증 (#33 도그푸딩 잔여 1).
 *
 * 두 가지를 고정한다:
 *  (1) 서버 파서가 프런트 파서와 **같은 배열**을 만든다 — 어긋나면 판정이 다른 문항에 붙는다.
 *  (2) 검수가 채팅 스트림을 방해하지 않는다 — 카드가 먼저 뜨고, 실패는 조용하다.
 */

const block = (questions: unknown[]) =>
  `산문 설명입니다.\n\n\`\`\`qidea-questions\n${JSON.stringify(questions)}\n\`\`\`\n`;

const mcq = (n: number, over: Record<string, unknown> = {}) => ({
  target: 'new',
  questionType: '객관식',
  stem: `발문${n}`,
  choices: ['가', '나', '다', '라'],
  correctIndex: 1,
  explanation: `해설${n}`,
  ...over,
});

describe('parseChatQuestions — 프런트 파서와 같은 배열', () => {
  it('펜스 블록의 문항을 순서대로 읽는다', () => {
    const out = parseChatQuestions(block([mcq(1), mcq(2)]));
    expect(out.map((q) => q.stemText)).toEqual(['발문1', '발문2']);
  });

  it('correctIndex를 선지의 isCorrect로 옮긴다 — 오답 매력도를 보려면 정답을 알아야 한다', () => {
    const [q] = parseChatQuestions(block([mcq(1)]));
    expect(q.choices?.map((c) => c.isCorrect)).toEqual([false, true, false, false]);
  });

  it('유형 변형("객관식(5지선다)")을 정본 값으로 정규화한다', () => {
    const [q] = parseChatQuestions(block([mcq(1, { questionType: '객관식(5지선다)' })]));
    expect(q.questionType).toBe('객관식');
  });

  it('정규화에 실패한 원소는 배열에서 빠진다 — 프런트가 카드로 만들지 않는 것과 같다', () => {
    const out = parseChatQuestions(block([mcq(1), { stem: '유형 없음' }, mcq(3)]));
    expect(out.map((q) => q.stemText)).toEqual(['발문1', '발문3']);
  });

  it('주석·트레일링 콤마가 섞인 블록도 읽는다(프런트와 같은 정화)', () => {
    const raw = '```qidea-questions\n[\n{"questionType":"주관식","stem":"서술하시오"},\n]\n```';
    expect(parseChatQuestions(raw)).toHaveLength(1);
  });

  it('닫는 ```가 잘려도 마지막 블록을 살린다', () => {
    const raw = `\`\`\`qidea-questions\n${JSON.stringify([mcq(1)])}`;
    expect(parseChatQuestions(raw)).toHaveLength(1);
  });

  it('문항 배열이 아닌 코드 펜스는 문항으로 읽지 않는다 — 코드 예시가 문항이 되면 안 된다', () => {
    expect(parseChatQuestions('```js\nconst a = 1;\n```')).toEqual([]);
    expect(parseChatQuestions('```json\n["문자열", "배열"]\n```')).toEqual([]);
  });

  it('블록이 없으면 빈 배열 — 설명만 한 턴은 판정할 것이 없다', () => {
    expect(parseChatQuestions('지문을 더 길게 써 드릴까요?')).toEqual([]);
  });
});

describe('toReviewInput', () => {
  it('요청 난이도를 문항마다 채운다 — 채팅 계약에는 문항별 난이도가 없다', () => {
    const input = toReviewInput(parseChatQuestions(block([mcq(1)])), 4);
    expect(input.questions[0].difficulty).toBe(4);
  });

  it('지문을 딸고 온 문항이 있으면 지문을 함께 싣는다(지문-문항 정합 축)', () => {
    const input = toReviewInput(parseChatQuestions(block([mcq(1, { passage: '지문 본문' })])), 3);
    expect(input.passage?.bodyText).toBe('지문 본문');
    // 판정 입력에는 문항별 passageText가 남지 않는다(계약 밖 필드).
    expect(input.questions[0]).not.toHaveProperty('passageText');
  });
});

/* ── 스트림 동작 ──────────────────────────────────────────────────── */

function makeService(gemini: Partial<GeminiLlmService>) {
  const prisma = {
    workbook: { findUnique: jest.fn().mockResolvedValue({ ownerId: 'me' }) },
    subject: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: '문학', examCategory: '국어', examType: '수능' }),
    },
    tag: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const redis = {
    eval: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
  return new AuthoringChatService(prisma, gemini as GeminiLlmService, redis as never);
}

/** SSE 프레임을 모으는 가짜 Response. */
function makeRes() {
  const frames: string[] = [];
  const res = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk: string) => frames.push(chunk)),
    end: jest.fn(),
  };
  return { res: res as unknown as Response, frames };
}

const dto = (over: Partial<AuthoringChatDto> = {}) =>
  ({
    workbookId: 'w1',
    subjectId: 's1',
    message: '문학 문항 두 개 만들어줘',
    difficulty: 4,
    ...over,
  }) as AuthoringChatDto;

/** 문항 블록을 한 덩이로 흘리는 스트림. */
async function* onePush(text: string) {
  yield text;
}

describe('출제 채팅 자기검증 스트림', () => {
  const reviewFrames = (frames: string[]) => frames.filter((f) => f.startsWith('event: review'));

  it('done 다음에 review 프레임을 보낸다 — 카드가 먼저 떠야 한다', async () => {
    const reviewGeneration = jest.fn().mockResolvedValue({
      verdicts: [
        { index: 0, verdict: 'PASS', axes: [], issues: [] },
        { index: 1, verdict: 'REVISE', axes: ['오답매력도'], issues: ['3번 선지가 정답과 겹친다'] },
      ],
    });
    const service = makeService({
      streamChat: () => onePush(block([mcq(1), mcq(2)])),
      reviewGeneration,
      isSelfReviewEnabled: true,
      selfReviewModel: 'gemini-2.5-flash',
    });
    const { res, frames } = makeRes();

    await service.chat('me', dto(), res);

    const doneAt = frames.findIndex((f) => f.includes('"done":true'));
    const reviewAt = frames.findIndex((f) => f.startsWith('event: review'));
    expect(doneAt).toBeGreaterThanOrEqual(0);
    expect(reviewAt).toBeGreaterThan(doneAt);

    const payload = JSON.parse(frames[reviewAt].split('data: ')[1]);
    expect(payload.model).toBe('gemini-2.5-flash');
    expect(payload.verdicts[1]).toMatchObject({ index: 1, verdict: 'REVISE' });
  });

  it('판정 입력은 이번 턴의 문항과 요청 난이도다', async () => {
    const reviewGeneration = jest.fn().mockResolvedValue({ verdicts: [] });
    const service = makeService({
      streamChat: () => onePush(block([mcq(1)])),
      reviewGeneration,
      isSelfReviewEnabled: true,
      selfReviewModel: 'm',
    });

    await service.chat('me', dto(), makeRes().res);

    const [ctx, result] = reviewGeneration.mock.calls[0];
    expect(ctx).toMatchObject({
      questionCount: 1,
      difficulty: 4,
      examType: '수능',
      examCategory: '국어',
      subjectName: '문학',
    });
    expect(result.questions[0].stemText).toBe('발문1');
  });

  it('꺼져 있으면 호출도 프레임도 없다 — 끈 경로의 동작은 종전 그대로다', async () => {
    const reviewGeneration = jest.fn();
    const service = makeService({
      streamChat: () => onePush(block([mcq(1)])),
      reviewGeneration,
      isSelfReviewEnabled: false,
    });
    const { res, frames } = makeRes();

    await service.chat('me', dto(), res);

    expect(reviewGeneration).not.toHaveBeenCalled();
    expect(reviewFrames(frames)).toHaveLength(0);
  });

  it('문항이 없는 턴은 판정 호출을 하지 않는다 — 설명만 한 답변에 토큰을 쓰지 않는다', async () => {
    const reviewGeneration = jest.fn();
    const service = makeService({
      streamChat: () => onePush('지문을 더 길게 써 드릴까요?'),
      reviewGeneration,
      isSelfReviewEnabled: true,
    });

    await service.chat('me', dto(), makeRes().res);

    expect(reviewGeneration).not.toHaveBeenCalled();
  });

  it('판정이 실패해도 error 프레임을 보내지 않는다 — 멀쩡한 문항이 실패로 보이면 안 된다', async () => {
    const service = makeService({
      streamChat: () => onePush(block([mcq(1)])),
      reviewGeneration: jest.fn().mockRejectedValue(new Error('업스트림 오류')),
      isSelfReviewEnabled: true,
      selfReviewModel: 'm',
    });
    const { res, frames } = makeRes();

    await service.chat('me', dto(), res);

    expect(frames.some((f) => f.startsWith('event: error'))).toBe(false);
    expect(frames.some((f) => f.includes('"done":true'))).toBe(true);
    expect(reviewFrames(frames)).toHaveLength(0);
  });
});
