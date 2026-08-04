import {
  FORMAT_TEMPLATE_IDS,
  getTemplate,
  listTemplates,
  resolveTemplateFormat,
} from './format-templates';

// #43 출제 형식 템플릿 — 레지스트리 조회와 해석 계층(기본값 vs 명시 파라미터 우선순위).
describe('format-templates', () => {
  describe('레지스트리', () => {
    it('id는 중복 없이 유일하다(안정 키 — input_params 스냅샷에 저장된다)', () => {
      expect(new Set(FORMAT_TEMPLATE_IDS).size).toBe(FORMAT_TEMPLATE_IDS.length);
    });

    it('passageCount는 0~3 범위다 — 2 이상은 다중지문 세트(gap 3)', () => {
      for (const t of listTemplates()) {
        expect(t.structure.passageCount).toBeGreaterThanOrEqual(0);
        expect(t.structure.passageCount).toBeLessThanOrEqual(3);
      }
    });

    it('다중지문 템플릿 3종이 등록돼 있다 — (가)(나) 주제통합·토익 이중/삼중지문', () => {
      expect(getTemplate('csat-integrated-passages')?.structure.passageCount).toBe(2);
      expect(getTemplate('toeic-part7-double')?.structure.passageCount).toBe(2);
      expect(getTemplate('toeic-part7-triple')?.structure.passageCount).toBe(3);
    });

    it('getTemplate: 아는 id는 템플릿을, 모르는 id는 undefined를 준다', () => {
      expect(getTemplate('csat-korean-passage-set')?.label).toContain('수능');
      expect(getTemplate('없는-템플릿')).toBeUndefined();
    });

    it('language 기본값은 언어가 본질인 템플릿(토익)만 갖는다 — 나머지에 ko를 깔면 영어 과목의 언어 추정이 막힌다', () => {
      for (const t of listTemplates()) {
        if (t.id.startsWith('toeic-')) {
          expect(t.structure.language).toBe('en');
        } else {
          expect(t.structure.language).toBeUndefined();
        }
      }
    });
  });

  describe('listTemplates — examType 필터', () => {
    it('미지정이면 전체를 준다', () => {
      expect(listTemplates().length).toBe(FORMAT_TEMPLATE_IDS.length);
    });

    it('시험을 주면 그 시험에 노출되는 것만 준다', () => {
      const csat = listTemplates('수능');
      expect(csat.length).toBeGreaterThan(0);
      expect(csat.every((t) => t.examTypes.includes('수능'))).toBe(true);
      expect(csat.map((t) => t.id)).not.toContain('toeic-part5');
    });

    it('모르는 시험이면 빈 배열', () => {
      expect(listTemplates('편입')).toEqual([]);
    });
  });

  describe('resolveTemplateFormat — 해석 계층', () => {
    it('템플릿이 없으면 종전 동작 그대로(기본값 없음, 지문 없음, 단일정답)', () => {
      const r = resolveTemplateFormat(undefined, {});
      expect(r).toEqual({
        choiceCount: undefined,
        language: undefined,
        includePassage: false,
        passageCount: 0,
        // 세트가 아니면 라벨도 없다(#43) — 호출부가 길이만 보고 분기할 수 있게 항상 배열.
        passageLabels: [],
        questionType: undefined,
        answerMode: 'single',
        promptHints: [],
      });
    });

    it('템플릿 없이 includePassage=true면 지문 1개(종전 동작)', () => {
      expect(resolveTemplateFormat(undefined, { includePassage: true }).passageCount).toBe(1);
    });

    it('템플릿이 기본값을 깐다 — 선지 수·언어·지문·유형·복수정답', () => {
      const r = resolveTemplateFormat(getTemplate('toeic-part7-single'), {});
      expect(r.choiceCount).toBe(4);
      expect(r.language).toBe('en');
      expect(r.includePassage).toBe(true);
      expect(r.questionType).toBe('객관식');
      expect(r.answerMode).toBe('single');
      expect(r.promptHints.length).toBeGreaterThan(0);
    });

    it('사용자가 명시한 개별 파라미터가 항상 우선한다', () => {
      const r = resolveTemplateFormat(getTemplate('csat-korean-passage-set'), {
        choiceCount: 4,
        language: 'en',
        includePassage: false,
        questionType: '주관식',
      });
      expect(r.choiceCount).toBe(4);
      expect(r.language).toBe('en');
      expect(r.includePassage).toBe(false);
      expect(r.questionType).toBe('주관식');
    });

    it('복수정답 템플릿은 answerMode=multiple로 해석된다(#43 gap 4)', () => {
      expect(resolveTemplateFormat(getTemplate('school-multi-answer'), {}).answerMode).toBe(
        'multiple',
      );
    });

    it('지문 세트형은 권장 문항 수 범위를 힌트로 싣는다 — questionCount를 강제하지 않는다', () => {
      const r = resolveTemplateFormat(getTemplate('csat-korean-passage-set'), {});
      expect(r.promptHints.join(' ')).toContain('3~6개');
    });

    it('사용자가 지문을 끄면(includePassage=false) 지문 의존 힌트를 전부 떨군다', () => {
      const r = resolveTemplateFormat(getTemplate('csat-korean-passage-set'), {
        includePassage: false,
      });
      const joined = r.promptHints.join(' ');
      expect(joined).not.toContain('세트 구성');
      expect(joined).not.toContain('윗글');
      expect(joined).not.toContain('지문은');
    });

    it('questionType 오버라이드가 템플릿 전제를 뒤집으면 유형 의존 힌트를 떨군다', () => {
      // 서술형 템플릿을 객관식으로 오버라이드 — "answerText는 쓰지 않는다" 지시가 실리면 모순이다.
      const r = resolveTemplateFormat(getTemplate('school-essay-condition'), {
        questionType: '객관식',
      });
      expect(r.promptHints.join(' ')).not.toContain('answerText');
    });

    it('오버라이드가 없으면 유형 의존 힌트는 그대로 실린다', () => {
      const r = resolveTemplateFormat(getTemplate('school-essay-condition'), {});
      expect(r.promptHints.join(' ')).toContain('answerText');
    });

    it('한국 시험 템플릿은 language를 깔지 않는다 — 영어 대분류 과목의 en-passage-ko-stem 추정을 막지 않기 위함', () => {
      expect(resolveTemplateFormat(getTemplate('civil-9-reading'), {}).language).toBeUndefined();
      expect(resolveTemplateFormat(getTemplate('school-multi-answer'), {}).language).toBeUndefined();
    });

    it('토익 템플릿의 en 기본값 위에도 사용자 명시 언어가 우선한다', () => {
      expect(
        resolveTemplateFormat(getTemplate('toeic-part5'), { language: 'ko' }).language,
      ).toBe('ko');
    });

    it('다중지문 템플릿은 passageCount를 그대로 해석한다(2·3)', () => {
      expect(resolveTemplateFormat(getTemplate('csat-integrated-passages'), {}).passageCount).toBe(2);
      expect(resolveTemplateFormat(getTemplate('toeic-part7-triple'), {}).passageCount).toBe(3);
    });

    it('다중지문 템플릿도 includePassage=false 오버라이드면 지문 0 + 지문 의존 힌트 제거', () => {
      const r = resolveTemplateFormat(getTemplate('csat-integrated-passages'), {
        includePassage: false,
      });
      expect(r.passageCount).toBe(0);
      expect(r.includePassage).toBe(false);
      expect(r.promptHints).toEqual([]);
    });

    it('다중지문 세트의 권장 문항 수 힌트는 세트 전체 기준으로 문구가 바뀐다', () => {
      const r = resolveTemplateFormat(getTemplate('toeic-part7-double'), {});
      expect(r.promptHints.join(' ')).toContain('지문 2개 세트 전체에 문항 5개');
    });
  });
});
