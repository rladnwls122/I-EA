import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from './gemini-llm.service';

/**
 * streamChat SSE 파싱 검증 — Gemini는 프레임을 CRLF("\r\n\r\n")로 구분한다.
 * 이 정규화가 없으면 프레임 분리가 영원히 실패해 "델타 0개"로 조용히 끝난다
 * (프로덕션에서 실제 발생한 버그의 회귀 테스트).
 */
describe('GeminiLlmService.streamChat — SSE 프레임 파싱', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function makeService(): GeminiLlmService {
    const config = {
      get: (k: string) => (k === 'GEMINI_API_KEY' ? 'test-key' : undefined),
    } as unknown as ConfigService;
    return new GeminiLlmService(config);
  }

  /** 주어진 바이트 청크들을 스트리밍하는 fetch 응답 mock. */
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

  const frame = (text: string) =>
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`;

  async function collect(service: GeminiLlmService): Promise<string[]> {
    const out: string[] = [];
    for await (const d of service.streamChat('sys', [], '질문')) out.push(d);
    return out;
  }

  it('CRLF(\\r\\n\\r\\n) 구분 프레임에서 델타를 전부 뽑는다 — 실제 Gemini 형식', async () => {
    mockSseFetch([`${frame('안')}\r\n\r\n${frame('녕')}\r\n\r\n`]);
    const out = await collect(makeService());
    expect(out.join('')).toBe('안녕');
  });

  it('LF(\\n\\n) 구분 프레임도 그대로 동작한다', async () => {
    mockSseFetch([`${frame('a')}\n\n${frame('b')}\n\n`]);
    const out = await collect(makeService());
    expect(out.join('')).toBe('ab');
  });

  it('청크 경계에서 \\r과 \\n이 갈라져도 프레임을 잃지 않는다', async () => {
    const f = `${frame('x')}\r\n\r\n${frame('y')}\r\n\r\n`;
    const cut = f.indexOf('\r\n\r\n') + 1; // "\r" 뒤에서 자름
    mockSseFetch([f.slice(0, cut), f.slice(cut)]);
    const out = await collect(makeService());
    expect(out.join('')).toBe('xy');
  });

  it('종결 프레임(CRLF 미포함 tail)도 마지막에 처리한다', async () => {
    mockSseFetch([`${frame('끝')}`]); // 구분자 없이 스트림 종료
    const out = await collect(makeService());
    expect(out.join('')).toBe('끝');
  });
});
