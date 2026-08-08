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

  describe('다중지문 세트 (gap 3)', () => {
    const multiCtx = { ...baseCtx, includePassage: true, passageCount: 2 };

    /** 지문 n개 + 문항별 passageIndex 배정 응답. */
    function multiResponse(passages: string[], passageIndexes: number[]): string {
      return JSON.stringify({
        passages,
        questions: passageIndexes.map((passageIndex) => ({
          questionType: '객관식',
          stemText: '(가)와 (나)에 대한 이해로 가장 적절한 것은?',
          choices: [
            { content: '선지1', isCorrect: true },
            { content: '선지2', isCorrect: false },
          ],
          passageIndex,
          difficulty: 3,
        })),
      });
    }

    it('지문 개수·인덱스가 맞는 응답은 통과한다', async () => {
      spyCall(multiResponse(['지문 가', '지문 나'], [0, 1, 1]));
      const res = await service.generate(multiCtx);
      expect(res.passages).toHaveLength(2);
      expect(res.questions.map((q) => q.passageIndex)).toEqual([0, 1, 1]);
    });

    it('지문 개수가 요청과 어긋나면 예외', async () => {
      spyCall(multiResponse(['지문 하나뿐'], [0, 0]));
      await expect(service.generate(multiCtx)).rejects.toThrow(/지문 2개를 반환하지 않았습니다/);
    });

    it('빈 지문이 섞이면 예외', async () => {
      spyCall(multiResponse(['지문 가', '   '], [0, 1]));
      await expect(service.generate(multiCtx)).rejects.toThrow(/빈 지문/);
    });

    it('passageIndex가 범위를 벗어나면 예외', async () => {
      spyCall(multiResponse(['지문 가', '지문 나'], [0, 2]));
      await expect(service.generate(multiCtx)).rejects.toThrow(/passageIndex/);
    });

    it('passageIndex가 누락된 문항이 있으면 예외', async () => {
      const raw = JSON.parse(multiResponse(['지문 가', '지문 나'], [0, 1]));
      delete raw.questions[1].passageIndex;
      spyCall(JSON.stringify(raw));
      await expect(service.generate(multiCtx)).rejects.toThrow(/passageIndex/);
    });

    it('문항이 배정되지 않은 지문이 있으면 예외(빈 지문 방지)', async () => {
      spyCall(multiResponse(['지문 가', '지문 나'], [0, 0]));
      await expect(service.generate(multiCtx)).rejects.toThrow(/최소 1문항/);
    });

    it('다중지문 스키마(passages + passageIndex)가 시스템 프롬프트에 실린다', async () => {
      const spy = spyCall(multiResponse(['지문 가', '지문 나'], [0, 1]));
      await service.generate(multiCtx);
      const systemPrompt = spy.mock.calls[0][0] as string;
      expect(systemPrompt).toContain('"passages"');
      expect(systemPrompt).toContain('passageIndex');
      expect(systemPrompt).not.toContain('"passage":');
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('지문 2개 세트');
    });

    it('단일 지문 전제의 시험별 관행보다 다중지문 지시가 우선함을 프롬프트에 명시한다', async () => {
      const spy = spyCall(multiResponse(['지문 가', '지문 나'], [0, 1]));
      // 수능 관행 힌트에는 "지문 세트형(지문 1개에 문항 여러 개)"가 들어 있다 — 모순 공존을 우선순위로 해소.
      await service.generate(multiCtx);
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('지문 1개에');
      expect(userPrompt).toContain('다중지문 지시가 우선한다');
      // 우선순위 선언이 관행 지시보다 먼저 나와야 "아래 형식 지시"라는 지칭이 성립한다.
      expect(userPrompt.indexOf('다중지문 지시가 우선한다')).toBeLessThan(
        userPrompt.indexOf('지문 1개에'),
      );
    });

    it('단일/무지문 모드에서 passages 배열이 섞여 오면 거부한다 — 지문 없는 배치가 COMPLETED 되지 않게', async () => {
      const raw = JSON.parse(response(5)) as Record<string, unknown>;
      raw.passages = ['요청하지 않은 지문'];

      // 단일 지문 모드(passageCount 1)
      spyCall(JSON.stringify(raw));
      await expect(
        service.generate({ ...baseCtx, includePassage: true, passageCount: 1 }),
      ).rejects.toThrow(/요청하지 않은 다중지문/);

      // 무지문 모드(passageCount 0, 기본)
      spyCall(JSON.stringify(raw));
      await expect(service.generate(baseCtx)).rejects.toThrow(/요청하지 않은 다중지문/);
    });

    it('단일 지문 경로(passageCount 1)는 종전 계약 그대로다 — passages 스키마가 실리지 않는다', async () => {
      const spy = spyCall(response(5));
      await service.generate({ ...baseCtx, includePassage: true, passageCount: 1 });
      const systemPrompt = spy.mock.calls[0][0] as string;
      expect(systemPrompt).toContain('"passage":');
      expect(systemPrompt).not.toContain('"passages"');
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

  // 유사(변형) 문항 생성 — 원본 직렬화와 변형 규칙이 사용자 프롬프트에 실리는지.
  describe('유사(변형) 문항 생성 (sourceQuestion)', () => {
    const sourceCtx: LlmGenerationContext = {
      ...baseCtx,
      sourceQuestion: {
        questionType: '객관식',
        stemText: '밑줄 친 부분의 서술상 특징으로 가장 적절한 것은?',
        choices: [
          { content: '원본 선지1', isCorrect: false },
          { content: '원본 선지2', isCorrect: true },
        ],
        explanationText: '원본 해설 문장',
        difficulty: 4,
      },
    };

    it('원본 발문·선지(정답 표시)·해설과 변형 규칙이 프롬프트에 실린다', async () => {
      const spy = spyCall(response(2));
      await service.generate(sourceCtx);
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('[유사(변형) 문항 출제]');
      expect(userPrompt).toContain('원본 발문: 밑줄 친 부분의 서술상 특징으로 가장 적절한 것은?');
      expect(userPrompt).toContain('원본 선지2  ← 정답');
      expect(userPrompt).toContain('원본 해설: 원본 해설 문장');
      // 두 실패 모드(복제·이탈)를 모두 금지하는 지시가 있어야 한다.
      expect(userPrompt).toContain('복제는 금지');
      expect(userPrompt).toContain('이탈도 금지');
    });

    it('원본에 지문이 있으면 새 지문 지시와 원본 지문이 함께 실린다', async () => {
      const spy = spyCall(response(2));
      await service.generate({
        ...sourceCtx,
        sourceQuestion: { ...sourceCtx.sourceQuestion!, passageText: '원본 지문 본문' },
      });
      const userPrompt = spy.mock.calls[0][1] as string;
      expect(userPrompt).toContain('원본 지문 재사용 금지');
      expect(userPrompt).toContain('원본 지문 본문');
    });

    it('sourceQuestion이 없으면 변형 섹션이 실리지 않는다(종전 경로 무변화)', async () => {
      const spy = spyCall(response(5));
      await service.generate(baseCtx);
      expect(spy.mock.calls[0][1] as string).not.toContain('[유사(변형) 문항 출제]');
    });
  });
});
