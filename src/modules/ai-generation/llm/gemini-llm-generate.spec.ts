import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from './gemini-llm.service';
import { LlmGenerationContext } from './llm.types';

/**
 * generate()의 선지 개수 강제(#36 gap 1)와 프롬프트 조립(gap 2·5) 검증.
 * 네트워크를 태우지 않도록 callGemini를 스파이로 갈아끼우고, 넘어간 프롬프트를 그대로 들여다본다.
 */
describe('GeminiLlmService.generate', () => {
  let service: GeminiLlmService;

  const baseCtx: LlmGenerationContext = {
    prompt: '고전소설 지문으로 문항을 만들어줘',
    difficulty: 3,
    questionCount: 1,
    includePassage: false,
    subjectName: '문학',
    examCategory: '국어',
    examType: '수능',
  };

  /** 선지 n개짜리 객관식 1문항 응답(정답은 앞에서부터 correctCount개, 기본 1개). */
  function response(choiceCount: number, correctCount = 1): string {
    const choices = Array.from({ length: choiceCount }, (_, i) => ({
      content: `선지${i + 1}`,
      isCorrect: i < correctCount,
    }));
    return JSON.stringify({
      questions: [
        { questionType: '객관식', stemText: '다음 중 옳은 것은?', choices, difficulty: 3 },
      ],
    });
  }

  function spyCall(raw: string) {
    return jest
      .spyOn(
        service as unknown as { callGemini: (...a: unknown[]) => Promise<string> },
        'callGemini',
      )
      .mockResolvedValue(raw);
  }

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GeminiLlmService, { provide: ConfigService, useValue: { get: () => 'test-key' } }],
    }).compile();
    service = module.get(GeminiLlmService);
  });

  describe('선지 개수 강제', () => {
    it('choiceCount를 명시하면 그 개수의 응답만 통과한다', async () => {
      spyCall(response(5));
      const res = await service.generate({ ...baseCtx, choiceCount: 5 });
      expect(res.questions[0].choices).toHaveLength(5);
    });

    it('choiceCount와 어긋난 응답은 예외로 막는다', async () => {
      spyCall(response(4));
      await expect(service.generate({ ...baseCtx, choiceCount: 5 })).rejects.toThrow(
        /선지 5개를 반환하지 않았습니다/,
      );
    });

    it('choiceCount를 생략하면 개수를 검증하지 않는다(관행은 권고까지)', async () => {
      spyCall(response(3));
      const res = await service.generate(baseCtx);
      expect(res.questions[0].choices).toHaveLength(3);
    });

    it('ox 요청은 종전대로 개수를 강제하지 않는다', async () => {
      spyCall(response(3));
      await expect(service.generate({ ...baseCtx, ox: true, choiceCount: 2 })).resolves.toBeDefined();
    });
  });

  describe('복수정답 모드 (#43 gap 4)', () => {
    it('기본(single) 흐름은 종전대로 정답 정확히 1개를 강제한다', async () => {
      spyCall(response(5, 2));
      await expect(service.generate(baseCtx)).rejects.toThrow(
        /정답 선지 개수가 잘못된 문항/,
      );
    });

    it('answerMode=multiple이면 정답 2개 이상도 통과한다', async () => {
      spyCall(response(5, 3));
      const res = await service.generate({ ...baseCtx, answerMode: 'multiple' });
      expect(res.questions[0].choices?.filter((c) => c.isCorrect)).toHaveLength(3);
    });

    it('answerMode=multiple이어도 정답 0개는 막는다(채점이 항상 오답이 된다)', async () => {
      spyCall(response(5, 0));
      await expect(service.generate({ ...baseCtx, answerMode: 'multiple' })).rejects.toThrow(
        /정답 선지가 없는 문항/,
      );
    });

    it('answerMode=multiple이면 복수정답 지시("모두 고른 것은?")가 프롬프트에 실린다', async () => {
      const spy = spyCall(response(5, 2));
      await service.generate({ ...baseCtx, answerMode: 'multiple' });
      expect(spy.mock.calls[0][1]).toContain('모두 고른 것은?');
    });
  });

  describe('프롬프트 조립', () => {
    it('시험별 관행 선지 개수를 권고로 싣는다', async () => {
      const spy = spyCall(response(5));
      await service.generate(baseCtx);
      expect(spy.mock.calls[0][1]).toContain('5지선다');
    });

    it('choiceCount를 명시하면 권고 대신 강제 지시가 실린다', async () => {
      const spy = spyCall(response(4));
      await service.generate({ ...baseCtx, choiceCount: 4 });
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('정확히 4개');
      expect(userPrompt).not.toContain('관행은');
    });

    it('시험별 형식 지시를 싣는다 — 없으면 전부 수능 스타일로 치우친다', async () => {
      const spy = spyCall(response(4));
      await service.generate({ ...baseCtx, examType: '공무원 9급', choiceCount: 4 });
      expect(spy.mock.calls[0][1]).toContain('공무원 9급 관행');
    });

    it('language=en이면 시스템 프롬프트의 한국어 강제가 풀린다', async () => {
      const spy = spyCall(response(4));
      await service.generate({ ...baseCtx, examType: '토익', language: 'en' });
      const systemPrompt = spy.mock.calls[0][0] as string;
      expect(systemPrompt).toContain('영어로 쓴다');
      expect(systemPrompt).not.toContain('모든 텍스트는 한국어');
    });

    it('language 미지정은 종전대로 한국어를 강제한다', async () => {
      const spy = spyCall(response(5));
      await service.generate(baseCtx);
      expect(spy.mock.calls[0][0]).toContain('모든 텍스트는 한국어');
    });

    it('템플릿 형식 지시(templateHints)가 시험별 관행 지시 뒤에 실린다(#43)', async () => {
      const spy = spyCall(response(5));
      await service.generate({
        ...baseCtx,
        templateHints: ['발문 패턴: "윗글에 대한 이해로 가장 적절한 것은?"'],
      });
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('윗글에 대한 이해로 가장 적절한 것은?');
      expect(userPrompt.indexOf('수능 관행')).toBeLessThan(userPrompt.indexOf('발문 패턴'));
    });

    it('품질 기준 4축(#34)이 시스템 프롬프트에 실린다', async () => {
      const spy = spyCall(response(5));
      await service.generate(baseCtx);
      const systemPrompt = spy.mock.calls[0][0] as string;
      expect(systemPrompt).toContain('품질 기준');
      expect(systemPrompt).toContain('부정발문');
      expect(systemPrompt).toContain('오해·실수');
      expect(systemPrompt).toContain('1=개념 확인');
      expect(systemPrompt).toContain('지문을 읽어야만');
    });
  });
});
