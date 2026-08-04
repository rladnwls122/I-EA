/**
 * 태그 카테고리 정본 — 백엔드 `src/common/constants/tag.ts`의 거울.
 *
 * ⚠️ **권위는 백엔드에 있다.** 여기 없는 값을 보내면 `POST /tags`가 400으로 거절한다.
 * 이 파일은 그 400을 컴파일 시점으로 당기기 위한 사본일 뿐이다.
 *
 * 두 목록이 어긋나는 것 자체가 버그라, 백엔드 스펙
 * (`src/common/constants/tag.web-mirror.spec.ts`)이 이 파일을 읽어 대조한다 —
 * 한쪽만 고치면 CI가 깨진다.
 *
 * 각 카테고리의 뜻과 '유형'이 금지어인 이유는 백엔드 파일 주석 참조(#24 용어 정리).
 */
export const TAG_CATEGORIES = ["출처", "난이도", "출제기법", "출제유형", "키워드"] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];

/** 문항/문제집 #키워드 — 이 카테고리만 일반 유저도 생성할 수 있다. */
export const KEYWORD_TAG_CATEGORY: TagCategory = "키워드";
