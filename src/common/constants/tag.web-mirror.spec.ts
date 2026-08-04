import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KEYWORD_TAG_CATEGORY, TAG_CATEGORIES } from '@/common/constants/tag';

/**
 * 프런트가 들고 있는 태그 카테고리 사본이 백엔드 정본과 같은지 확인한다.
 *
 * 프런트는 백엔드 상수를 import할 수 없어(별도 패키지·별도 tsconfig) 목록을 복사해
 * 둔다. 사본은 반드시 갈라진다 — 백엔드에만 카테고리를 추가하면 프런트 드롭다운에
 * 안 뜨고, 프런트에만 추가하면 사용자가 고른 값이 400으로 튕긴다. 둘 다 조용하다.
 *
 * 그래서 파일을 직접 읽어 대조한다. 한쪽만 고치면 여기서 깨진다.
 */
const MIRROR_PATH = join(__dirname, '../../../web/lib/tag-categories.ts');

function parseMirrorList(source: string): string[] {
  const match = source.match(/export const TAG_CATEGORIES = \[([\s\S]*?)\] as const;/);
  if (!match) throw new Error('web/lib/tag-categories.ts 에서 TAG_CATEGORIES 배열을 찾지 못했습니다.');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('web 태그 카테고리 사본 대조', () => {
  const source = readFileSync(MIRROR_PATH, 'utf8');

  it('목록이 순서까지 정확히 같다', () => {
    expect(parseMirrorList(source)).toEqual([...TAG_CATEGORIES]);
  });

  it('키워드 상수도 같은 값이다', () => {
    const match = source.match(/KEYWORD_TAG_CATEGORY: TagCategory = "([^"]+)"/);
    expect(match?.[1]).toBe(KEYWORD_TAG_CATEGORY);
  });
});
