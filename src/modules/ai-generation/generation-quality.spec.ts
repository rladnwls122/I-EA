import {
  GOLDEN_PROMPTS,
  checkFormatCompliance,
  hangulRatio,
  templatesMissingGoldenPrompt,
  type ExpectedFormat,
} from './generation-quality';
import { FORMAT_TEMPLATE_IDS } from './format-templates';
import type { LlmGenerationResult } from './llm/llm.types';

const q = (over: Partial<LlmGenerationResult['questions'][number]> = {}) => ({
  questionType: '객관식' as const,
  stemText: '발문',
  choices: [
    { content: '1', isCorrect: true },
    { content: '2', isCorrect: false },
    { content: '3', isCorrect: false },
    { content: '4', isCorrect: false },
  ],
  difficulty: 3,
  ...over,
});

const expected = (over: Partial<ExpectedFormat> = {}): ExpectedFormat => ({
  questionCount: 1,
  passageCount: 0,
  choiceCount: 4,
  answerMode: 'single',
  ...over,
});

describe('checkFormatCompliance — 계약 준수 판정', () => {
  it('요청대로 왔으면 위반이 없다', () => {
    expect(checkFormatCompliance({ questions: [q()] }, expected())).toEqual([]);
  });

  it('문항 수가 다르면 잡는다', () => {
    const v = checkFormatCompliance({ questions: [q(), q()] }, expected({ questionCount: 1 }));
    expect(v.map((x) => x.axis)).toContain('questionCount');
  });

  it('선지 개수가 다르면 잡는다', () => {
    const v = checkFormatCompliance(
      { questions: [q({ choices: [{ content: '1', isCorrect: true }] })] },
      expected({ choiceCount: 4 }),
    );
    expect(v.map((x) => x.axis)).toContain('choiceCount');
  });

  it('choiceCount를 요청하지 않았으면 개수를 따지지 않는다 — 시험별 관행은 유도까지다', () => {
    const v = checkFormatCompliance(
      { questions: [q({ choices: [{ content: '1', isCorrect: true }] })] },
      expected({ choiceCount: undefined }),
    );
    expect(v.map((x) => x.axis)).not.toContain('choiceCount');
  });

  describe('정답 개수 모드', () => {
    const twoCorrect = q({
      choices: [
        { content: '1', isCorrect: true },
        { content: '2', isCorrect: true },
        { content: '3', isCorrect: false },
        { content: '4', isCorrect: false },
      ],
    });

    it('single인데 정답이 둘이면 위반', () => {
      const v = checkFormatCompliance({ questions: [twoCorrect] }, expected());
      expect(v.map((x) => x.axis)).toContain('answerMode');
    });

    it('multiple이면 정답 둘을 허용한다', () => {
      const v = checkFormatCompliance(
        { questions: [twoCorrect] },
        expected({ answerMode: 'multiple' }),
      );
      expect(v.map((x) => x.axis)).not.toContain('answerMode');
    });

    it('multiple이라도 정답이 0개면 위반 — "1개 이상"이 계약이다', () => {
      const none = q({ choices: [{ content: '1', isCorrect: false }] });
      const v = checkFormatCompliance(
        { questions: [none] },
        expected({ answerMode: 'multiple', choiceCount: undefined }),
      );
      expect(v.map((x) => x.axis)).toContain('answerMode');
    });

    it('multiple이고 정답이 하나여도 통과 — 실제 시험에도 그런 문항이 있다', () => {
      const v = checkFormatCompliance(
        { questions: [q()] },
        expected({ answerMode: 'multiple' }),
      );
      expect(v.map((x) => x.axis)).not.toContain('answerMode');
    });
  });

  describe('지문 수 — 모드에 따라 담기는 자리가 다르다', () => {
    it('단일 지문 모드는 passage를 본다', () => {
      const v = checkFormatCompliance(
        { passage: { bodyText: '지문' }, questions: [q()] },
        expected({ passageCount: 1 }),
      );
      expect(v.map((x) => x.axis)).not.toContain('passageCount');
    });

    it('지문을 요청했는데 안 왔으면 잡는다', () => {
      const v = checkFormatCompliance({ questions: [q()] }, expected({ passageCount: 1 }));
      expect(v.map((x) => x.axis)).toContain('passageCount');
    });

    it('공백뿐인 지문은 온 것으로 치지 않는다', () => {
      const v = checkFormatCompliance(
        { passage: { bodyText: '   ' }, questions: [q()] },
        expected({ passageCount: 1 }),
      );
      expect(v.map((x) => x.axis)).toContain('passageCount');
    });

    it('다중 지문 모드는 passages[] 개수를 본다', () => {
      const v = checkFormatCompliance(
        { passages: ['가', '나'], questions: [q()] },
        expected({ passageCount: 2 }),
      );
      expect(v).toEqual([]);
    });
  });

  describe('출력 언어', () => {
    const korean = {
      passage: { bodyText: '이것은 완전히 한국어로 작성된 지문입니다.' },
      questions: [q({ choices: [{ content: '한국어 선지입니다', isCorrect: true }] })],
    };

    it('영어를 요청했는데 한국어로 오면 잡는다', () => {
      const v = checkFormatCompliance(
        korean,
        expected({ passageCount: 1, language: 'en', choiceCount: undefined }),
      );
      expect(v.map((x) => x.axis)).toContain('language');
    });

    it('ko 요청이면 언어를 따지지 않는다', () => {
      const v = checkFormatCompliance(
        korean,
        expected({ passageCount: 1, language: 'ko', choiceCount: undefined }),
      );
      expect(v.map((x) => x.axis)).not.toContain('language');
    });

    it('영어 본문에 고유명사 몇 글자가 섞인 정도는 통과 — 비율로 본다', () => {
      const v = checkFormatCompliance(
        {
          passage: {
            bodyText:
              'The company will relocate its head office next quarter, according to the memo from Seoul(서울) headquarters.',
          },
          questions: [q({ choices: [{ content: 'relocation notice', isCorrect: true }] })],
        },
        expected({ passageCount: 1, language: 'en', choiceCount: undefined }),
      );
      expect(v.map((x) => x.axis)).not.toContain('language');
    });

    it('en-passage-ko-stem은 발문이 한국어여도 통과 — 지문·선지만 본다', () => {
      const v = checkFormatCompliance(
        {
          passage: { bodyText: 'A short English passage about renewable energy sources.' },
          questions: [
            q({
              stemText: '윗글의 내용과 일치하는 것은?',
              choices: [{ content: 'Solar power is renewable.', isCorrect: true }],
            }),
          ],
        },
        expected({ passageCount: 1, language: 'en-passage-ko-stem', choiceCount: undefined }),
      );
      expect(v.map((x) => x.axis)).not.toContain('language');
    });
  });

  it('빈 발문은 잡는다', () => {
    const v = checkFormatCompliance({ questions: [q({ stemText: '  ' })] }, expected());
    expect(v.map((x) => x.axis)).toContain('emptyField');
  });

  it('유형을 요청했는데 다르게 오면 잡는다', () => {
    const v = checkFormatCompliance(
      { questions: [q({ questionType: '주관식', choices: undefined })] },
      expected({ questionType: '객관식', choiceCount: undefined }),
    );
    expect(v.map((x) => x.axis)).toContain('questionType');
  });
});

describe('hangulRatio', () => {
  it('공백은 분모에서 뺀다 — 줄바꿈 많은 지문이 과소평가되지 않게', () => {
    expect(hangulRatio('가 나\n다')).toBe(1);
  });

  it('빈 문자열은 0', () => {
    expect(hangulRatio('   ')).toBe(0);
  });
});

describe('골든 프롬프트 커버리지', () => {
  it('모든 템플릿에 골든 프롬프트가 있다 — 템플릿만 늘고 측정이 안 따라오면 커버리지가 조용히 준다', () => {
    expect(templatesMissingGoldenPrompt(FORMAT_TEMPLATE_IDS)).toEqual([]);
  });

  it('없는 템플릿은 누락으로 보고한다', () => {
    expect(templatesMissingGoldenPrompt(['nope'])).toEqual(['nope']);
  });

  it('골든 프롬프트에 죽은 항목이 없다 — 템플릿을 지웠는데 남아 있으면 헷갈린다', () => {
    const ids = new Set(FORMAT_TEMPLATE_IDS);
    expect(Object.keys(GOLDEN_PROMPTS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
