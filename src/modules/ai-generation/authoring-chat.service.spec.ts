import { trimAuthoringTurns } from './authoring-chat.service';
import type { TutorTurn } from './llm/llm.types';

describe('trimAuthoringTurns', () => {
  it('20턴을 넘으면 최근 20턴만 남긴다', () => {
    const turns: TutorTurn[] = Array.from({ length: 26 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      text: `t${i}`,
    }));
    const out = trimAuthoringTurns(turns);
    expect(out.length).toBe(20);
    expect(out[out.length - 1].text).toBe('t25');
  });

  it('20턴 이하는 그대로 둔다', () => {
    const turns: TutorTurn[] = [
      { role: 'user', text: 'a' },
      { role: 'model', text: 'b' },
    ];
    expect(trimAuthoringTurns(turns)).toHaveLength(2);
  });
});
