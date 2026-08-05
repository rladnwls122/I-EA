import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUESTION_BATCH_MAX } from '@/common/constants/question';

/**
 * 프런트가 들고 있는 배치 상한 사본이 백엔드 정본과 같은지 확인한다.
 *
 * 사본이 갈라지면 조용하지 않다 — 프런트 값이 더 크면 캔버스 저장이 통째로 400을 맞고,
 * 더 작으면 왕복이 필요 이상으로 늘어난다. tag-categories와 같은 이유, 같은 방식으로 막는다.
 */
const MIRROR_PATH = join(__dirname, '../../../web/lib/api.ts');

describe('web 문항 배치 상한 사본 대조', () => {
  it('QUESTION_BATCH_MAX가 같은 값이다', () => {
    const source = readFileSync(MIRROR_PATH, 'utf8');
    const match = source.match(/export const QUESTION_BATCH_MAX = (\d+);/);
    expect(match?.[1]).toBe(String(QUESTION_BATCH_MAX));
  });
});
