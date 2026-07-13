import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from './gemini-llm.service';

/**
 * parseChoicesResult 검증 — 여기서 막지 않으면 정답이 0개/2개인 선지 집합이
 * 저장되어 grading.util의 "정답 집합 == 선택 집합" 채점이 조용히 망가진다.
 */
describe('GeminiLlmService.parseChoicesResult', () => {
  let parse: (raw: string, expected: number) => { choices: unknown[] };

  beforeAll(() => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new GeminiLlmService(config);
    parse = (raw, expected) =>
      (
        service as unknown as {
          parseChoicesResult(r: string, e: number): { choices: unknown[] };
        }
      ).parseChoicesResult(raw, expected);
  });

  const ok = JSON.stringify({
    choices: [
      { content: '보기 1', isCorrect: true },
      { content: '보기 2', isCorrect: false },
      { content: '보기 3', isCorrect: false },
    ],
  });

  it('정답 1개 + 개수 일치면 통과한다', () => {
    expect(parse(ok, 3).choices).toHaveLength(3);
  });

  it('코드펜스가 섞여 와도 JSON만 추출한다', () => {
    expect(parse('```json\n' + ok + '\n```', 3).choices).toHaveLength(3);
  });

  it('정답이 0개면 거부한다 (채점이 항상 null이 된다)', () => {
    const raw = JSON.stringify({
      choices: [
        { content: 'a', isCorrect: false },
        { content: 'b', isCorrect: false },
      ],
    });
    expect(() => parse(raw, 2)).toThrow(ServiceUnavailableException);
  });

  it('정답이 2개면 거부한다 (전부 골라야 정답이 되어버린다)', () => {
    const raw = JSON.stringify({
      choices: [
        { content: 'a', isCorrect: true },
        { content: 'b', isCorrect: true },
      ],
    });
    expect(() => parse(raw, 2)).toThrow(ServiceUnavailableException);
  });

  it('요청한 개수와 다르면 거부한다', () => {
    expect(() => parse(ok, 5)).toThrow(ServiceUnavailableException);
  });

  it('빈 선지가 있으면 거부한다', () => {
    const raw = JSON.stringify({
      choices: [
        { content: '정답', isCorrect: true },
        { content: '   ', isCorrect: false },
      ],
    });
    expect(() => parse(raw, 2)).toThrow(ServiceUnavailableException);
  });

  it('JSON이 아니면 거부한다', () => {
    expect(() => parse('죄송합니다, 생성할 수 없습니다.', 3)).toThrow(ServiceUnavailableException);
  });

  it('choices가 배열이 아니면 거부한다', () => {
    expect(() => parse(JSON.stringify({ choices: 'nope' }), 3)).toThrow(
      ServiceUnavailableException,
    );
  });
});
