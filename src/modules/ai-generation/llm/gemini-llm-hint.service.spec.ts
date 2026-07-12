import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmHintContext } from './llm.types';

/**
 * generateHint는 callGemini(private)를 통해 Gemini를 부른다.
 * 네트워크를 태우지 않도록 callGemini를 스파이로 갈아끼워, 파싱/검증만 격리 검증한다.
 * ConfigService는 키가 있는 것처럼 스텁해 keyPool.hasKeys=true로 만든다.
 */
describe('GeminiLlmService.generateHint', () => {
  let service: GeminiLlmService;

  const ctx: LlmHintContext = {
    questionType: '객관식',
    stemText: '다음 중 옳은 것은?',
    choices: [
      { content: '가', isCorrect: false },
      { content: '나', isCorrect: true },
    ],
    difficulty: 3,
    subjectName: '문학',
    examCategory: '국어',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GeminiLlmService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
      ],
    }).compile();
    service = module.get(GeminiLlmService);
  });

  it('모델 JSON에서 hint 문자열을 뽑아 반환한다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('{"hint":"정답을 직접 말하지 않는 접근 힌트"}');

    const res = await service.generateHint(ctx);
    expect(res).toEqual({ hint: '정답을 직접 말하지 않는 접근 힌트' });
  });

  it('hint가 비면 예외를 던진다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('{"hint":"   "}');

    await expect(service.generateHint(ctx)).rejects.toThrow();
  });

  it('JSON이 아니면 예외를 던진다', async () => {
    jest
      .spyOn(service as unknown as { callGemini: (...a: unknown[]) => Promise<string> }, 'callGemini')
      .mockResolvedValue('힌트: 그냥 산문');

    await expect(service.generateHint(ctx)).rejects.toThrow();
  });
});
