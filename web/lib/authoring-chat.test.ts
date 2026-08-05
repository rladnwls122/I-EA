import { vi } from 'vitest';
import { parseQuestionBlocks, stripQuestionBlocks, streamAuthoringChat } from './authoring-chat';

const withBlock = [
  '좋아요, 한 문제 만들어볼게요.',
  '```qidea-questions',
  '[{"target":"new","questionType":"객관식","stem":"지구는?","choices":["a","b"],"correctIndex":1}]',
  '```',
].join('\n');

describe('parseQuestionBlocks', () => {
  it('펜스 블록의 문항 배열을 파싱한다', () => {
    const out = parseQuestionBlocks(withBlock);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe('지구는?');
    expect(out[0].correctIndex).toBe(1);
  });

  it('블록이 없으면 빈 배열', () => {
    expect(parseQuestionBlocks('그냥 대화만 합니다.')).toEqual([]);
  });

  it('JSON이 깨지면 빈 배열(크래시 금지)', () => {
    const broken = '```qidea-questions\n[{ broken json\n```';
    expect(parseQuestionBlocks(broken)).toEqual([]);
  });

  it('여러 블록을 모두 모은다', () => {
    const two =
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q1"}]\n```\n' +
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q2"}]\n```';
    expect(parseQuestionBlocks(two)).toHaveLength(2);
  });

  // ── 모델 출력 드리프트 관대화 ──

  it('json 언어 태그로 흘려도 문항 배열이면 수용한다', () => {
    const t = '```json\n[{"target":"new","questionType":"객관식","stem":"s","choices":["a","b"],"correctIndex":0}]\n```';
    expect(parseQuestionBlocks(t)).toHaveLength(1);
  });

  it('트레일링 콤마·주석이 섞여도 정화 후 파싱한다', () => {
    const t = [
      '```qidea-questions',
      '[',
      '  {',
      '    "target": "new", // 새 문항',
      '    "questionType": "객관식",',
      '    "stem": "s",',
      '    "choices": ["a", "b"],',
      '    "correctIndex": 1,',
      '  },',
      ']',
      '```',
    ].join('\n');
    const out = parseQuestionBlocks(t);
    expect(out).toHaveLength(1);
    expect(out[0].correctIndex).toBe(1);
  });

  it('닫는 펜스가 잘려도(스트림 중단) 마지막 블록을 살린다', () => {
    const t = '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"잘림"}]';
    expect(parseQuestionBlocks(t)).toHaveLength(1);
  });

  it('questionType 변형("객관식(5지선다)")과 문자열 correctIndex를 정규화한다', () => {
    const t =
      '```qidea-questions\n[{"target":"new","questionType":"객관식(5지선다)","stem":"s","choices":["a","b"],"correctIndex":"1"}]\n```';
    const out = parseQuestionBlocks(t);
    expect(out).toHaveLength(1);
    expect(out[0].questionType).toBe('객관식');
    expect(out[0].correctIndex).toBe(1);
  });
});

describe('stripQuestionBlocks', () => {
  it('산문만 남기고 블록을 제거한다', () => {
    expect(stripQuestionBlocks(withBlock).trim()).toBe('좋아요, 한 문제 만들어볼게요.');
  });
});

/* ── SSE 소비 (#33 도그푸딩 잔여 1 — 자기검증 프레임) ───────────────── */

/** SSE 프레임 배열을 흘리는 가짜 fetch를 심고, 끝나면 되돌린다. */
function mockSse(frames: string[], ok = true, status = 200) {
  const encoder = new TextEncoder();
  const body = {
    getReader() {
      let i = 0;
      return {
        read: async () =>
          i < frames.length
            ? { value: encoder.encode(frames[i++]), done: false }
            : { value: undefined, done: true },
      };
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok, status, body: ok ? body : null })) as never;
  return () => {
    globalThis.fetch = original;
  };
}

const body = { workbookId: 'w1', subjectId: 's1', message: '만들어줘' };

describe('streamAuthoringChat — 검수 프레임', () => {
  it('done 뒤에 오는 review 프레임을 받는다 — done에서 끊으면 판정을 영영 못 본다', async () => {
    const restore = mockSse([
      'data: {"delta":"본문"}\n\n',
      'data: {"done":true}\n\n',
      'event: review\ndata: {"model":"m","at":"t","verdicts":[{"index":0,"verdict":"REVISE","axes":["오답매력도"],"issues":["겹친다"]}]}\n\n',
    ]);
    const onDone = vi.fn();
    const onReview = vi.fn();

    await streamAuthoringChat(body, { onDelta: () => {}, onDone, onError: () => {}, onReview });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('본문');
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview.mock.calls[0][0].verdicts[0]).toMatchObject({ index: 0, verdict: 'REVISE' });
    restore();
  });

  it('판정이 오지 않고 끝나면 null로 닫는다 — 배지가 영원히 스피너로 남으면 안 된다', async () => {
    const restore = mockSse(['data: {"delta":"본문"}\n\n', 'data: {"done":true}\n\n']);
    const onReview = vi.fn();

    await streamAuthoringChat(body, {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
      onReview,
    });

    expect(onReview).toHaveBeenCalledWith(null);
    restore();
  });

  it('오류로 끝난 턴은 onDone 없이 판정만 닫는다', async () => {
    const restore = mockSse(['event: error\ndata: {"message":"실패"}\n\n']);
    const onDone = vi.fn();
    const onError = vi.fn();
    const onReview = vi.fn();

    await streamAuthoringChat(body, { onDelta: () => {}, onDone, onError, onReview });

    expect(onError).toHaveBeenCalledWith('실패');
    expect(onDone).not.toHaveBeenCalled();
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledWith(null);
    restore();
  });

  it('요청 자체가 실패해도 판정 기다림을 닫는다', async () => {
    const restore = mockSse([], false, 500);
    const onReview = vi.fn();

    await streamAuthoringChat(body, {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
      onReview,
    });

    expect(onReview).toHaveBeenCalledWith(null);
    restore();
  });
});
