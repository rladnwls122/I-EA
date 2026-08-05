/**
 * 복습 튜터 답변의 수식 구간 분해 (#35 후속).
 *
 * 지키는 선은 셋이다.
 *   1. **회귀 금지선** — 수식이 없는 답변은 예전과 똑같이 "평문 한 덩어리"다.
 *   2. **내용 실종 금지** — 깨진 latex도, 스트리밍 중 끊긴 수식도 원문이 남는다.
 *   3. **규칙 락스텝** — 승격/강등 판정이 조립(buildRichBlocks)과 같다.
 *      이 파일이 조립과 규칙이 갈리는 순간을 잡는 유일한 장치다.
 */
import { describe, it, expect } from 'vitest';
import { splitTutorMath, type TutorSegment } from '@/lib/review-tutor';
import { buildRichBlocks } from '@/lib/prosemirror-assemble';

/** 세그먼트에서 승격된 수식만 뽑는다. */
const maths = (segs: TutorSegment[]) =>
  segs.filter((s) => s.kind === 'math').map((s) => (s as { latex: string }).latex);

type LooseNode = { type?: string; attrs?: Record<string, unknown>; content?: LooseNode[] };

/** 조립 결과 노드 트리에서 승격된 수식만 뽑는다(비교 기준). */
function assembledMaths(text: string): string[] {
  const out: string[] = [];
  const walk = (nodes: LooseNode[]) => {
    for (const n of nodes ?? []) {
      if (n?.type === 'inlineMath' || n?.type === 'blockMath') out.push(String(n.attrs?.latex));
      if (Array.isArray(n?.content)) walk(n.content);
    }
  };
  walk(buildRichBlocks(text) as LooseNode[]);
  return out;
}

/** 세그먼트를 다시 이어 붙였을 때 보이는 글자(수식은 latex 원문으로 센다). */
const visible = (segs: TutorSegment[]) =>
  segs
    .map((s) => (s.kind === 'text' ? s.text : s.kind === 'math' ? s.latex : s.source))
    .join('');

describe('회귀 금지선 — 수식 없는 답변은 예전과 같다', () => {
  it('평범한 답변은 평문 한 덩어리로 남는다', () => {
    const text = '이 문항은 개념을 묻습니다.\n\n다음엔 정의를 먼저 확인해 보세요.';
    expect(splitTutorMath(text)).toEqual([{ kind: 'text', text }]);
  });

  it('빈 줄(문단 구분)이 그대로 살아 있다 — 조립을 태웠다면 사라졌을 것', () => {
    const [seg] = splitTutorMath('첫 문단\n\n둘째 문단');
    expect(seg).toEqual({ kind: 'text', text: '첫 문단\n\n둘째 문단' });
  });

  it('빈 문자열은 세그먼트가 없다', () => {
    expect(splitTutorMath('')).toEqual([]);
  });

  it('통화 표기($100)는 수식으로 오인하지 않는다', () => {
    expect(splitTutorMath('교재는 $100 에서 $150 으로 올랐어요')).toEqual([
      { kind: 'text', text: '교재는 $100 에서 $150 으로 올랐어요' },
    ]);
  });
});

describe('수식 승격', () => {
  it('$...$를 인라인 수식으로 올리고 앞뒤 평문은 그대로 둔다', () => {
    expect(splitTutorMath('방정식 $x^2 - 2x = 0$ 을 보세요')).toEqual([
      { kind: 'text', text: '방정식 ' },
      { kind: 'math', latex: 'x^2 - 2x = 0', block: false },
      { kind: 'text', text: ' 을 보세요' },
    ]);
  });

  it('$$...$$는 별행 수식이 된다 (붙어 있던 줄바꿈 하나씩은 블록이 흡수한다)', () => {
    expect(splitTutorMath('정리하면\n$$\\int_0^1 x\\,dx$$\n입니다')).toEqual([
      { kind: 'text', text: '정리하면' },
      { kind: 'math', latex: '\\int_0^1 x\\,dx', block: true },
      { kind: 'text', text: '입니다' },
    ]);
  });

  it('별행 수식 앞뒤의 문단 간격(빈 줄)은 살아남는다', () => {
    expect(splitTutorMath('앞 문단\n\n$$E=mc^2$$\n\n뒤 문단')).toEqual([
      { kind: 'text', text: '앞 문단\n' },
      { kind: 'math', latex: 'E=mc^2', block: true },
      { kind: 'text', text: '\n뒤 문단' },
    ]);
  });

  it('별행 수식만 있는 답변은 빈 텍스트 조각을 남기지 않는다', () => {
    expect(splitTutorMath('$$E=mc^2$$\n')).toEqual([
      { kind: 'math', latex: 'E=mc^2', block: true },
    ]);
  });

  it('화학식(\\ce)도 올라간다 — mhchem import가 빠지면 여기서 깨진다', () => {
    expect(splitTutorMath('$\\ce{2H2 + O2 -> 2H2O}$ 반응이에요')).toEqual([
      { kind: 'math', latex: '\\ce{2H2 + O2 -> 2H2O}', block: false },
      { kind: 'text', text: ' 반응이에요' },
    ]);
  });

  it('한 문장에 수식이 여러 개여도 순서가 유지된다', () => {
    expect(maths(splitTutorMath('$a$ 와 $b$ 를 더하면 $a+b$'))).toEqual(['a', 'b', 'a+b']);
  });
});

describe('깨진 latex — 강등해도 내용은 남는다', () => {
  it('파스 실패한 수식은 델리미터째 평문으로 남는다', () => {
    expect(splitTutorMath('식은 $\\frac{1}{$ 이다')).toEqual([
      { kind: 'text', text: '식은 $\\frac{1}{$ 이다' },
    ]);
  });

  it('깨진 별행 수식도 원문이 사라지지 않는다', () => {
    const segs = splitTutorMath('보세요\n$$\\begin{matrix} a$$\n끝');
    expect(maths(segs)).toEqual([]);
    expect(visible(segs)).toBe('보세요\n$$\\begin{matrix} a$$\n끝');
  });

  it('빈 수식($$ 사이가 공백)은 올리지 않는다', () => {
    expect(maths(splitTutorMath('$ $ 만 있어요'))).toEqual([]);
  });

  it('멀쩡한 수식 옆의 깨진 수식만 강등된다', () => {
    const segs = splitTutorMath('$x^2$ 와 $\\frac{1}{$');
    expect(maths(segs)).toEqual(['x^2']);
    expect(visible(segs)).toBe('x^2 와 $\\frac{1}{$');
  });
});

describe('스트리밍 중간 상태 — 닫히지 않은 $', () => {
  it('닫히지 않은 꼬리는 델리미터를 뗀 원문으로 남는다(숨기지 않는다)', () => {
    expect(splitTutorMath('방정식 $x^', { streaming: true })).toEqual([
      { kind: 'text', text: '방정식 ' },
      { kind: 'pending', source: 'x^', block: false },
    ]);
  });

  it('닫히지 않은 $$도 같은 규칙을 따른다', () => {
    expect(splitTutorMath('정리하면\n$$\\int_0', { streaming: true })).toEqual([
      { kind: 'text', text: '정리하면\n' },
      { kind: 'pending', source: '\\int_0', block: true },
    ]);
  });

  it('막 도착한 $ 하나는 델리미터만 감춘다 — 글자는 아직 없다', () => {
    expect(splitTutorMath('방정식 $', { streaming: true })).toEqual([
      { kind: 'text', text: '방정식 ' },
      { kind: 'pending', source: '', block: false },
    ]);
  });

  it('앞의 수식은 이미 그려지고 꼬리만 대기 상태다', () => {
    const segs = splitTutorMath('$a+b$ 이고 $c-', { streaming: true });
    expect(segs).toEqual([
      { kind: 'math', latex: 'a+b', block: false },
      { kind: 'text', text: ' 이고 ' },
      { kind: 'pending', source: 'c-', block: false },
    ]);
  });

  it('닫히자마자 같은 자리가 수식이 된다 — 글자가 사라지지 않는다', () => {
    const deltas = ['방정식 ', '방정식 $x^', '방정식 $x^2=1', '방정식 $x^2=1$'];
    const seen = deltas.map((d) => visible(splitTutorMath(d, { streaming: true })));
    expect(seen).toEqual(['방정식 ', '방정식 x^', '방정식 x^2=1', '방정식 x^2=1']);
    expect(maths(splitTutorMath(deltas[3], { streaming: true }))).toEqual(['x^2=1']);
  });

  it('강등된 수식 뒤의 문장을 "오는 중"으로 오인하지 않는다', () => {
    // `$\frac{1}{$`는 이미 닫힌(그러나 파스 실패한) 쌍이다. 뒤의 ' 이다'는 완성된 문장.
    expect(splitTutorMath('식은 $\\frac{1}{$ 이다', { streaming: true })).toEqual([
      { kind: 'text', text: '식은 $\\frac{1}{$ 이다' },
    ]);
  });

  it('통화 표기 꼬리($100)는 대기 상태로 만들지 않는다', () => {
    expect(splitTutorMath('교재는 $100', { streaming: true })).toEqual([
      { kind: 'text', text: '교재는 $100' },
    ]);
  });

  it('완결된 답변에는 꼬리 처리를 하지 않는다 — 진짜 달러 기호일 수 있다', () => {
    expect(splitTutorMath('값은 $ 기호로 씁니다')).toEqual([
      { kind: 'text', text: '값은 $ 기호로 씁니다' },
    ]);
  });
});

describe('조립(buildRichBlocks)과 규칙이 같다', () => {
  const CORPUS = [
    '수식이 없는 답변',
    '방정식 $x^2 - 2x = 0$ 을 보세요',
    '$$\\int_0^1 x\\,dx$$',
    '$\\ce{2H2 + O2 -> 2H2O}$ 반응',
    '식은 $\\frac{1}{$ 이다',
    '교재는 $100 에서 $150 으로',
    '$a$ 와 $b$ 를 더하면 $a+b$',
    '앞 문장\n$$E=mc^2$$\n뒤 문장 $f\'(2)$',
    '$ $ 만 있어요',
  ];

  it.each(CORPUS)('같은 문자열에서 같은 수식을 승격한다: %s', (text) => {
    expect(maths(splitTutorMath(text))).toEqual(assembledMaths(text));
  });
});
