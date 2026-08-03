import {
  defaultChoiceCount,
  examFormatHints,
  languageRule,
  resolveOutputLanguage,
} from './exam-format';

// 조사 #36 gap 1·2·5 — 선지 개수 관행, 출력 언어, 시험별 형식 지시.
describe('exam-format', () => {
  describe('defaultChoiceCount', () => {
    it('수능·내신·한능검은 5지선다다', () => {
      expect(defaultChoiceCount('수능')).toBe(5);
      expect(defaultChoiceCount('내신')).toBe(5);
      expect(defaultChoiceCount('한능검')).toBe(5);
    });

    it('공무원·공기업(NCS)·토익은 4지선다다', () => {
      expect(defaultChoiceCount('공무원 9급')).toBe(4);
      expect(defaultChoiceCount('공무원 7급')).toBe(4);
      expect(defaultChoiceCount('공기업')).toBe(4);
      expect(defaultChoiceCount('토익')).toBe(4);
    });

    it('모르는 시험·미지정은 undefined(= 관행 지시 없음, 기존 동작)', () => {
      expect(defaultChoiceCount('편입')).toBeUndefined();
      expect(defaultChoiceCount(undefined)).toBeUndefined();
    });
  });

  describe('resolveOutputLanguage', () => {
    it('토익은 전부 영어다', () => {
      expect(resolveOutputLanguage('토익', 'RC')).toBe('en');
    });

    it('한국 시험의 영어 대분류는 지문 영어 + 발문 한국어다', () => {
      expect(resolveOutputLanguage('수능', '영어')).toBe('en-passage-ko-stem');
      expect(resolveOutputLanguage('공무원 9급', '영어')).toBe('en-passage-ko-stem');
    });

    it('그 외에는 한국어다', () => {
      expect(resolveOutputLanguage('수능', '국어')).toBe('ko');
      expect(resolveOutputLanguage(undefined, undefined)).toBe('ko');
    });
  });

  describe('languageRule', () => {
    it('영어 모드에서도 해설·keywords는 한국어로 지시한다(오답노트 통계 집계 키)', () => {
      expect(languageRule('en')).toContain('한국어');
      expect(languageRule('en-passage-ko-stem')).toContain('한국어');
    });

    it('알 수 없는 값은 한국어 규칙으로 떨어진다', () => {
      expect(languageRule('klingon' as never)).toBe(languageRule('ko'));
    });
  });

  describe('examFormatHints', () => {
    it('시험별 형식 지시를 준다 — 없으면 모델 출력이 수능 스타일로 치우친다', () => {
      expect(examFormatHints('공무원 9급').length).toBeGreaterThan(0);
      expect(examFormatHints('토익').join(' ')).toContain('TOEIC');
    });

    it('모르는 시험·미지정은 빈 배열(= 지시 없음, 기존 동작)', () => {
      expect(examFormatHints('편입')).toEqual([]);
      expect(examFormatHints(undefined)).toEqual([]);
    });
  });
});
