// =====================================================================
// 태그 카테고리 정본(canonical) — #24 "용어 정리" 결정의 코드 표현.
//
// 배경: '유형'이라는 말이 서로 다른 네 가지를 가리키고 있었다. #24에서 축마다
// 고유명을 부여하고 맨 '유형' 단독 사용을 금지하기로 결정했다.
//
//   문항형식  = questionType (객관식/주관식)        — Tag가 아니라 컬럼
//   하위요소  = SubjectDetail                        — Tag가 아니라 테이블
//   출제기법  = 구 Tag 카테고리 '유형' (킬러/자료해석/빈칸 …)
//   출제유형  = 모듈형/PSAT형/피듈형 (NCS 출제방식)
//
// 출제기법과 출제유형은 **다른 축**이다 — 이름이 비슷해 중복으로 보이지만,
// 전자는 문항을 만드는 기법이고 후자는 시험의 출제 방식이다. 합치면 안 된다.
//
// 왜 상수로 두는가: 예전에는 `Tag.category`가 검증 없는 자유 문자열이라
// ADMIN/CREATOR가 언제든 새 축을 만들 수 있었다. 축이 늘어나면 필터·통계가
// 조용히 갈라진다("킬러"가 '유형'과 '출제기법'에 하나씩 생기면 어느 쪽으로
// 필터해도 절반만 나온다). 이름을 한 번 고치는 것보다 문을 닫는 게 중요하다.
// =====================================================================

/** 문항/문제집 #키워드 — 이 카테고리만 일반 유저도 생성할 수 있다(catalog.service). */
export const KEYWORD_TAG_CATEGORY = '키워드';

/**
 * 허용되는 태그 카테고리 전부. 새 축이 필요하면 여기에 추가하고 그 이유를 남긴다 —
 * 목록에 없는 카테고리로는 태그를 만들 수 없다.
 *
 * ⚠️ '단원'과 '과목'은 일부러 없다. 각각 SubjectDetail(하위요소)·Subject.examCategory와
 * 뜻이 겹쳐, 같은 개념이 태그축과 분류축에 둘 다 존재하면 어느 쪽으로 걸러도
 * 결과가 반쪽이 된다. 그 축들은 태그가 아니라 1급 컬럼으로 다룬다.
 */
export const TAG_CATEGORIES = [
  '출처', // 기출/평가원/EBS …
  '난이도', // 최고난도/고난도/기본 …
  '출제기법', // 킬러/계산/그래프/빈칸 … (구 '유형')
  '출제유형', // 모듈형/PSAT형/피듈형 (NCS 출제방식)
  KEYWORD_TAG_CATEGORY,
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** 정본 카테고리인가. 좁히기(narrowing)까지 해 주므로 DTO·서비스 양쪽에서 쓴다. */
export function isTagCategory(value: string): value is TagCategory {
  return (TAG_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 폐기된 카테고리 → 정본 이름. `seed-master.ts`가 운영 데이터를 옮길 때 쓰고,
 * 여기 남겨 두는 것 자체가 "왜 이 이름이 사라졌는지"의 기록이다.
 */
export const RENAMED_TAG_CATEGORIES: Readonly<Record<string, TagCategory>> = {
  유형: '출제기법',
};
