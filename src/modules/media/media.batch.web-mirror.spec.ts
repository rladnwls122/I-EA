import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEDIA_BATCH_MAX } from './media.constants';

/**
 * 프런트가 들고 있는 미디어 배치 상한 사본이 백엔드 정본과 같은지 확인한다.
 * 문항 배치 상한과 같은 이유, 같은 방식(question.batch.web-mirror.spec.ts).
 */
const MIRROR_PATH = join(__dirname, '../../../web/lib/api.ts');

describe('web 미디어 배치 상한 사본 대조', () => {
  it('MEDIA_BATCH_MAX가 같은 값이다', () => {
    const source = readFileSync(MIRROR_PATH, 'utf8');
    const match = source.match(/export const MEDIA_BATCH_MAX = (\d+);/);
    expect(match?.[1]).toBe(String(MEDIA_BATCH_MAX));
  });
});
