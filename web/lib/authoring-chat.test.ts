import { parseQuestionBlocks, stripQuestionBlocks } from './authoring-chat';

const withBlock = [
  '좋아요, 한 문제 만들어볼게요.',
  '```qidea-questions',
  '[{"target":"new","questionType":"객관식","stem":"지구는?","choices":["a","b"],"correctIndex":1}]',
  '```',
].join('\n');

describe('parseQuestionBlocks', () => {
  it('펜스 블록의 문항 배열을 파싱한다', () => {
    const out = parseQuestionBlocks(withBlock);
    expect(out).toHaveLength(1);
    expect(out[0].stem).toBe('지구는?');
    expect(out[0].correctIndex).toBe(1);
  });

  it('블록이 없으면 빈 배열', () => {
    expect(parseQuestionBlocks('그냥 대화만 합니다.')).toEqual([]);
  });

  it('JSON이 깨지면 빈 배열(크래시 금지)', () => {
    const broken = '```qidea-questions\n[{ broken json\n```';
    expect(parseQuestionBlocks(broken)).toEqual([]);
  });

  it('여러 블록을 모두 모은다', () => {
    const two =
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q1"}]\n```\n' +
      '```qidea-questions\n[{"target":"new","questionType":"주관식","stem":"q2"}]\n```';
    expect(parseQuestionBlocks(two)).toHaveLength(2);
  });
});

describe('stripQuestionBlocks', () => {
  it('산문만 남기고 블록을 제거한다', () => {
    expect(stripQuestionBlocks(withBlock).trim()).toBe('좋아요, 한 문제 만들어볼게요.');
  });
});
