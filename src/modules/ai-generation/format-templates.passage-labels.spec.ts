import { getTemplate, resolveTemplateFormat } from './format-templates';

/**
 * 다중지문 세트의 지문 라벨(#43). 라벨은 Passage.label로 저장돼 풀이 화면이
 * "(가)/(나)"로 구분해 보여주는 근거가 된다 — 비어 있으면 세트가 한 덩어리로 보인다.
 */
describe('resolveTemplateFormat — passageLabels', () => {
  it('수능 (가)(나) 주제통합형은 관행 라벨을 준다', () => {
    const f = resolveTemplateFormat(getTemplate('csat-integrated-passages'), {});
    expect(f.passageCount).toBe(2);
    expect(f.passageLabels).toEqual(['(가)', '(나)']);
  });

  it('토익 Part 7 triple은 지문 3개 라벨을 준다', () => {
    const f = resolveTemplateFormat(getTemplate('toeic-part7-triple'), {});
    expect(f.passageLabels).toEqual(['Passage 1', 'Passage 2', 'Passage 3']);
  });

  it('단일 지문 템플릿은 라벨이 없다 — 화면에 "지문 1"만 뜨는 걸 막는다', () => {
    const f = resolveTemplateFormat(getTemplate('csat-korean-passage-set'), {});
    expect(f.passageCount).toBe(1);
    expect(f.passageLabels).toEqual([]);
  });

  it('무지문 템플릿도 라벨이 없다', () => {
    expect(resolveTemplateFormat(getTemplate('csat-inquiry-data'), {}).passageLabels).toEqual([]);
  });

  it('템플릿이 없으면 라벨도 없다', () => {
    expect(resolveTemplateFormat(undefined, {}).passageLabels).toEqual([]);
  });

  it('지문을 끄면 세트가 아니게 되므로 라벨도 사라진다', () => {
    const f = resolveTemplateFormat(getTemplate('csat-integrated-passages'), {
      includePassage: false,
    });
    expect(f.passageCount).toBe(0);
    expect(f.passageLabels).toEqual([]);
  });

  it('라벨 개수는 항상 passageCount와 같다', () => {
    for (const id of ['csat-integrated-passages', 'toeic-part7-double', 'toeic-part7-triple']) {
      const f = resolveTemplateFormat(getTemplate(id), {});
      expect(f.passageLabels).toHaveLength(f.passageCount);
    }
  });
});
