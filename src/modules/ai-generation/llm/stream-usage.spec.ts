import { ConfigService } from '@nestjs/config';
import { LlmUsageRecorder } from '@/modules/ai-usage/llm-usage.recorder';
import { GeminiLlmService } from './gemini-llm.service';

/**
 * 스트리밍 경로의 원가 계측.
 *
 * 스트리밍은 프레임마다 usageMetadata를 싣고 **마지막 값이 누적 총계**다. 더하면
 * 원가가 프레임 수만큼 부풀려지므로, 덮어쓰는지 여기서 못 박는다.
 */
describe('GeminiLlmService.streamChat — 사용량 기록', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function setup() {
    const record = jest.fn();
    const config = {
      get: (k: string) => (k === 'GEMINI_API_KEY' ? 'test-key' : undefined),
    } as unknown as ConfigService;
    const service = new GeminiLlmService(config, { record } as unknown as LlmUsageRecorder);
    return { service, record };
  }

  function mockSseFetch(chunks: string[]): void {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
          controller.close();
        },
      }),
    } as unknown as Response);
  }

  /** 텍스트 델타 + (선택) 그 시점까지의 누적 usageMetadata를 담은 SSE 프레임. */
  const frame = (text: string, total?: number) =>
    `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      ...(total === undefined
        ? {}
        : {
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: total,
              totalTokenCount: 100 + total,
            },
          }),
    })}\r\n\r\n`;

  async function drain(service: GeminiLlmService, meta = { userId: 'u1', feature: 'TUTOR' as const }) {
    const out: string[] = [];
    for await (const d of service.streamChat('sys', [], '질문', meta)) out.push(d);
    return out;
  }

  it('마지막 프레임의 누적 사용량으로 한 행만 남긴다(프레임마다 더하지 않는다)', async () => {
    const { service, record } = setup();
    mockSseFetch([frame('안', 10), frame('녕', 25), frame('하세요', 40)]);

    const deltas = await drain(service);

    expect(deltas.join('')).toBe('안녕하세요');
    expect(record).toHaveBeenCalledTimes(1);
    const [meta, , status, usage] = record.mock.calls[0];
    expect(meta).toEqual({ userId: 'u1', feature: 'TUTOR' });
    expect(status).toBe('OK');
    // 10+25+40=75가 아니라 마지막 값 40이어야 한다.
    expect(usage).toMatchObject({ outputTokens: 40, promptTokens: 100, totalTokens: 140 });
  });

  it('usageMetadata가 한 번도 안 오면 0으로 남긴다 — 행 자체는 남겨야 누락이 보인다', async () => {
    const { service, record } = setup();
    mockSseFetch([frame('안녕')]);

    await drain(service);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][3]).toMatchObject({ totalTokens: 0 });
  });

  it('meta를 주지 않으면 기록하지 않는다 — 호출 주체를 모르는 행은 집계에서 쓸모가 없다', async () => {
    const { service, record } = setup();
    mockSseFetch([frame('안녕', 10)]);

    const out: string[] = [];
    for await (const d of service.streamChat('sys', [], '질문')) out.push(d);

    expect(out.join('')).toBe('안녕');
    expect(record).not.toHaveBeenCalled();
  });
});
