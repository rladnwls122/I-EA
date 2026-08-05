/**
 * #35 — 프런트 수식 규약. 백엔드(src/common/prosemirror/prosemirror.math.spec.ts)와 짝이다.
 *
 * 가장 중요한 건 **오프셋 정합**이다. `visitTextNodes`는 `extractPlainText`와
 * `walkTextSegments`의 단일 출처이고, 그 평문 오프셋이 주석(annotation) 앵커 모델의
 * 전제다. math 노드는 atom이라 `text`도 `content`도 없어서, 분기를 잘못 넣으면
 * 두 함수가 서로 다른 길이를 세고 기존 주석이 통째로 어긋난다.
 */
import { describe, it, expect } from 'vitest';
import { extractPlainText, walkTextSegments, isRichEmpty } from '@/lib/prosemirror';
import { buildRichDoc, buildRichBlocks } from '@/lib/prosemirror-assemble';

const doc = (content: any[]) => ({ type: 'doc', content });
const para = (...content: any[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });
const inlineMath = (latex: string) => ({ type: 'inlineMath', attrs: { latex } });
const blockMath = (latex: string) => ({ type: 'blockMath', attrs: { latex } });

describe('회귀 금지선 — 수식 없는 텍스트는 예전과 완전히 같다', () => {
  it('평범한 문항은 바이트 단위로 동일하다', () => {
    expect(buildRichDoc('다음 중 옳은 것은?\n(가) 산에는 꽃 피네')).toEqual(
      doc([para(text('다음 중 옳은 것은?')), para(text('(가) 산에는 꽃 피네'))]),
    );
  });

  it('빈 문자열은 빈 content(예전과 동일)', () => {
    expect(buildRichDoc('')).toEqual({ type: 'doc', content: [] });
  });

  it('통화 표기($100)는 수식으로 오인하지 않는다', () => {
    expect(buildRichDoc('$100 에서 $150 으로')).toEqual(doc([para(text('$100 에서 $150 으로'))]));
  });

  it('블록 배열 조립도 동일하다', () => {
    expect(buildRichBlocks('첫 줄\n둘째 줄')).toEqual([para(text('첫 줄')), para(text('둘째 줄'))]);
  });
});

describe('수식 승격 — 백엔드와 같은 규칙', () => {
  it('$...$를 inlineMath로 올린다', () => {
    expect(buildRichDoc('함수 $f(x)=x^2$ 의 값').content).toEqual([
      para(text('함수 '), inlineMath('f(x)=x^2'), text(' 의 값')),
    ]);
  });

  it('$$...$$는 blockMath 블록이 된다', () => {
    expect(buildRichDoc('$$\\int_0^1 x\\,dx$$').content).toEqual([blockMath('\\int_0^1 x\\,dx')]);
  });

  it('\\ce{...}(화학식)도 승격된다 — mhchem import가 빠지면 여기서 깨진다', () => {
    expect(buildRichDoc('$\\ce{2H2 + O2 -> 2H2O}$').content).toEqual([
      para(inlineMath('\\ce{2H2 + O2 -> 2H2O}')),
    ]);
  });

  it('깨진 latex는 승격하지 않고 평문으로 남긴다', () => {
    expect(buildRichDoc('식은 $\\frac{1}{$ 이다').content).toEqual([
      para(text('식은 $\\frac{1}{$ 이다')),
    ]);
  });
});

describe('extractPlainText 역직렬화', () => {
  it('inlineMath를 $latex$로 되돌린다', () => {
    expect(extractPlainText(doc([para(text('넓이는 '), inlineMath('\\pi r^2'), text(' 이다'))]))).toBe(
      '넓이는 $\\pi r^2$ 이다',
    );
  });

  it('blockMath를 $$latex$$로 되돌린다', () => {
    expect(extractPlainText(doc([blockMath('e^{i\\pi}+1=0')]))).toBe('$$e^{i\\pi}+1=0$$');
  });

  it('블록 배열(선지·해설 저장 모양)에서도 동작한다', () => {
    expect(extractPlainText([para(inlineMath('x^2'))])).toBe('$x^2$');
  });

  it('평문 → 노드 → 평문 왕복에서 수식이 보존된다', () => {
    const t = '함수 $f(x)=x^3-3x$ 의 극값은?';
    expect(extractPlainText(buildRichDoc(t))).toBe(t);
  });

  it('inlineMath 앞에는 블록 경계(\\n)를 넣지 않는다(문단 중간이므로)', () => {
    expect(extractPlainText(doc([para(text('a'), inlineMath('x'), text('b'))]))).toBe('a$x$b');
  });

  it('blockMath는 다른 블록처럼 \\n으로 갈린다', () => {
    expect(extractPlainText(doc([para(text('앞')), blockMath('x'), para(text('뒤'))]))).toBe(
      '앞\n$$x$$\n뒤',
    );
  });
});

describe('오프셋 정합 — extractPlainText ↔ walkTextSegments', () => {
  /** 주석 앵커가 성립하려면 모든 세그먼트가 평문의 같은 자리를 가리켜야 한다. */
  const assertOffsetsAgree = (value: any) => {
    const plain = extractPlainText(value);
    for (const s of walkTextSegments(value)) {
      expect(plain.slice(s.start, s.end)).toBe(s.text);
    }
  };

  it('인라인 수식이 섞인 문단', () => {
    assertOffsetsAgree(
      doc([para(text('이차방정식 '), inlineMath('x^2-5x+6=0'), text(' 의 두 근의 합은?'))]),
    );
  });

  it('별행 수식이 문단 사이에 낀 문서', () => {
    assertOffsetsAgree(
      doc([para(text('다음을 계산하시오.')), blockMath('\\int_0^1 x\\,dx'), para(text('답을 쓰시오.'))]),
    );
  });

  it('수식만 있는 문단', () => {
    assertOffsetsAgree(doc([para(inlineMath('\\pi r^2'))]));
  });

  it('수식이 `$latex$` 길이만큼 정확히 오프셋을 차지한다', () => {
    const segs = walkTextSegments(doc([para(text('앞'), inlineMath('x^2'), text('뒤'))]));
    expect(segs).toEqual([
      { text: '앞', start: 0, end: 1, blockIndex: 0 },
      { text: '$x^2$', start: 1, end: 6, blockIndex: 0 },
      { text: '뒤', start: 6, end: 7, blockIndex: 0 },
    ]);
  });

  it('조립한 문서에서도 정합한다(왕복 경로)', () => {
    assertOffsetsAgree(buildRichDoc('원의 넓이는 $\\pi r^2$ 이고 부피는 $\\frac{4}{3}\\pi r^3$ 이다.'));
  });

  it('수식이 없는 문서의 오프셋은 예전 그대로다', () => {
    const value = doc([para(text('가나'), text('다라')), para(text('마바'))]);
    expect(extractPlainText(value)).toBe('가나다라\n마바');
    assertOffsetsAgree(value);
  });
});

describe('isRichEmpty — 수식만 있는 문서는 비어 있지 않다', () => {
  it('수식만 있는 발문을 빈 값으로 보지 않는다(저장에서 날아가면 안 된다)', () => {
    expect(isRichEmpty(doc([para(inlineMath('x^2'))]))).toBe(false);
    expect(isRichEmpty(doc([blockMath('x^2')]))).toBe(false);
  });

  it('진짜 빈 문서는 여전히 비어 있다', () => {
    expect(isRichEmpty(doc([para()]))).toBe(true);
  });
});
