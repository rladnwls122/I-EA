import {
  KEYWORD_TAG_CATEGORY,
  RENAMED_TAG_CATEGORIES,
  TAG_CATEGORIES,
  isTagCategory,
} from '@/common/constants/tag';

describe('태그 카테고리 정본', () => {
  it('키워드는 정본에 포함된다 — 자유 태깅도 같은 규칙 안에 있다', () => {
    expect(TAG_CATEGORIES).toContain(KEYWORD_TAG_CATEGORY);
  });

  it("'유형'은 금지어다(#24) — 네 가지를 동시에 가리켰다", () => {
    expect(isTagCategory('유형')).toBe(false);
  });

  it("'단원'·'과목'도 막는다 — SubjectDetail·examCategory와 뜻이 겹친다", () => {
    expect(isTagCategory('단원')).toBe(false);
    expect(isTagCategory('과목')).toBe(false);
  });

  it('출제기법과 출제유형은 둘 다 살아 있는 별개 축이다', () => {
    expect(isTagCategory('출제기법')).toBe(true);
    expect(isTagCategory('출제유형')).toBe(true);
  });

  it('중복 없는 목록이다 — 중복이 있으면 필터 축이 조용히 갈린다', () => {
    expect(new Set(TAG_CATEGORIES).size).toBe(TAG_CATEGORIES.length);
  });

  it('모르는 문자열은 거부한다', () => {
    expect(isTagCategory('아무거나')).toBe(false);
    expect(isTagCategory('')).toBe(false);
  });
});

describe('RENAMED_TAG_CATEGORIES — 폐기 카테고리 이관표', () => {
  it("'유형'은 '출제기법'으로 간다", () => {
    expect(RENAMED_TAG_CATEGORIES['유형']).toBe('출제기법');
  });

  it('이관 대상은 전부 정본으로 간다 — 목적지가 또 폐기명이면 무한루프다', () => {
    for (const target of Object.values(RENAMED_TAG_CATEGORIES)) {
      expect(isTagCategory(target)).toBe(true);
    }
  });

  it('이관 출발지는 정본이 아니어야 한다 — 정본을 옮기면 멀쩡한 태그가 사라진다', () => {
    for (const source of Object.keys(RENAMED_TAG_CATEGORIES)) {
      expect(isTagCategory(source)).toBe(false);
    }
  });
});
