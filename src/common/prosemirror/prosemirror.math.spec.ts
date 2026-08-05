import { buildRichDoc, buildRichBlocks, extractPlainText, PMNode } from './prosemirror.util';
import { sanitizeProseMirrorNode, ProseMirrorValidationError } from './prosemirror.sanitize';

/**
 * #35 — 수식(LaTeX) 승격·역직렬화 계약.
 *
 * LLM은 계속 평문만 준다. `$...$`/`$$...$$` 델리미터를 여기서 math 노드로 승격하고,
 * `extractPlainText`가 다시 델리미터째로 되돌린다. 이 왕복이 깨지면 검색(search_text)·
 * 튜터 프롬프트·응시 평문화에서 수식이 통째로 증발한다(math 노드는 atom이라
 * `text`도 `content`도 없다 — 분기가 없으면 조용히 건너뛴다).
 */
describe('#35 수식 노드 조립/역직렬화', () => {
  describe('회귀 금지선 — 수식 없는 텍스트는 예전과 완전히 같다', () => {
    // "예전 출력"을 값으로 박아 둔다. 국어·영어 등 기존 저장물이 이 모양이다.
    const legacyDoc = (paras: string[]): PMNode => ({
      type: 'doc',
      content: paras.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
    });

    it('평범한 한국어 문항은 바이트 단위로 동일하다', () => {
      const text = '다음 글의 화자의 정서로 가장 적절한 것은?\n\n(가) 산에는 꽃 피네';
      expect(buildRichDoc(text)).toEqual(
        legacyDoc(['다음 글의 화자의 정서로 가장 적절한 것은?', '(가) 산에는 꽃 피네']),
      );
    });

    it('영어 지문도 동일하다', () => {
      const text = 'Which of the following is NOT true?\nThe author argues that ...';
      expect(buildRichDoc(text)).toEqual(
        legacyDoc(['Which of the following is NOT true?', 'The author argues that ...']),
      );
    });

    it('빈 문자열은 빈 문단 하나(예전과 동일)', () => {
      expect(buildRichDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    });

    it('통화 표기($100)는 수식으로 오인하지 않는다', () => {
      const text = '가격이 $100 에서 $150 으로 올랐다.';
      expect(buildRichDoc(text)).toEqual(legacyDoc(['가격이 $100 에서 $150 으로 올랐다.']));
    });

    it('짝이 맞지 않는 달러 기호 하나는 그대로 둔다', () => {
      expect(buildRichDoc('비용은 $ 단위로 표기한다')).toEqual(
        legacyDoc(['비용은 $ 단위로 표기한다']),
      );
    });
  });

  describe('인라인 수식 승격', () => {
    it('$...$를 inlineMath atom으로 올리고 앞뒤 텍스트를 유지한다', () => {
      const doc = buildRichDoc('이차방정식 $x^2-5x+6=0$ 의 두 근의 합은?');
      expect(doc.content).toEqual([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '이차방정식 ' },
            { type: 'inlineMath', attrs: { latex: 'x^2-5x+6=0' } },
            { type: 'text', text: ' 의 두 근의 합은?' },
          ],
        },
      ]);
    });

    it('한 문단에 수식이 여러 개여도 각각 승격한다', () => {
      const para = buildRichDoc('$a$ 와 $b$ 의 합')?.content?.[0] as PMNode;
      expect(para.content?.map((n) => n.type)).toEqual([
        'inlineMath',
        'text',
        'inlineMath',
        'text',
      ]);
    });

    it('문단 전체가 수식이면 문단 안에 math 노드만 남는다', () => {
      expect(buildRichDoc('$\\frac{1}{2}$').content?.[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'inlineMath', attrs: { latex: '\\frac{1}{2}' } }],
      });
    });

    it('공백은 latex에서 잘라낸다($ x $ → x)', () => {
      expect(buildRichDoc('$ x^2 $').content?.[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }],
      });
    });
  });

  describe('별행 수식 승격', () => {
    it('$$...$$는 blockMath 블록이 된다', () => {
      expect(buildRichDoc('$$\\int_0^1 x\\,dx$$').content).toEqual([
        { type: 'blockMath', attrs: { latex: '\\int_0^1 x\\,dx' } },
      ]);
    });

    it('여러 줄에 걸친 $$도 문단 분리에 찢기지 않는다', () => {
      expect(buildRichDoc('$$\n  x^2 + y^2 = z^2\n$$').content).toEqual([
        { type: 'blockMath', attrs: { latex: 'x^2 + y^2 = z^2' } },
      ]);
    });

    it('앞뒤 문단과 섞여 있어도 블록 순서를 지킨다', () => {
      const doc = buildRichDoc('다음을 계산하시오.\n$$e^{i\\pi}+1=0$$\n답을 쓰시오.');
      expect(doc.content?.map((n) => n.type)).toEqual(['paragraph', 'blockMath', 'paragraph']);
    });
  });

  describe('안전한 강등 — 깨진 latex는 승격하지 않는다', () => {
    it('닫히지 않은 명령은 평문 그대로 남는다', () => {
      expect(buildRichDoc('식은 $\\frac{1}{$ 이다').content?.[0]).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: '식은 $\\frac{1}{$ 이다' }],
      });
    });

    it('없는 명령($\\notacommand$)도 평문으로 강등된다', () => {
      const para = buildRichDoc('$\\notacommand$').content?.[0] as PMNode;
      expect(para.content).toEqual([{ type: 'text', text: '$\\notacommand$' }]);
    });

    it('깨진 별행 수식은 델리미터째 평문 문단으로 남는다', () => {
      expect(buildRichDoc('$$\\begin{unknownenv} x $$').content).toEqual([
        { type: 'paragraph', content: [{ type: 'text', text: '$$\\begin{unknownenv} x $$' }] },
      ]);
    });

    it('깨진 수식과 멀쩡한 수식이 섞여도 멀쩡한 쪽만 승격된다', () => {
      const para = buildRichDoc('$\\frac{1}{$ 와 $x^2$').content?.[0] as PMNode;
      expect(para.content).toEqual([
        { type: 'text', text: '$\\frac{1}{$ 와 ' },
        { type: 'inlineMath', attrs: { latex: 'x^2' } },
      ]);
    });
  });

  describe('mhchem — 화학식', () => {
    it('\\ce{...}가 파스되어 승격된다(mhchem import가 빠지면 여기서 깨진다)', () => {
      expect(buildRichDoc('반응식은 $\\ce{2H2 + O2 -> 2H2O}$ 이다').content?.[0]).toEqual({
        type: 'paragraph',
        content: [
          { type: 'text', text: '반응식은 ' },
          { type: 'inlineMath', attrs: { latex: '\\ce{2H2 + O2 -> 2H2O}' } },
          { type: 'text', text: ' 이다' },
        ],
      });
    });
  });

  describe('extractPlainText 역직렬화', () => {
    it('inlineMath를 $latex$로 되돌린다', () => {
      const doc = buildRichDoc('이차방정식 $x^2-5x+6=0$ 의 두 근의 합은?');
      expect(extractPlainText(doc)).toBe('이차방정식 $x^2-5x+6=0$ 의 두 근의 합은?');
    });

    it('blockMath를 $$latex$$로 되돌린다', () => {
      const doc = buildRichDoc('$$e^{i\\pi}+1=0$$');
      expect(extractPlainText(doc)).toBe('$$e^{i\\pi}+1=0$$');
    });

    it('math 분기가 없으면 사라졌을 문서에서 수식이 살아남는다', () => {
      const doc: PMNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'x^2' } }] }],
      };
      expect(extractPlainText(doc)).toBe('$x^2$');
    });

    it('블록 배열(선지·해설 저장 모양)에서도 동작한다', () => {
      const blocks = buildRichBlocks('정답은 $\\frac{1}{2}$ 이다');
      expect(extractPlainText(blocks)).toBe('정답은 $\\frac{1}{2}$ 이다');
    });

    it('평문 → 노드 → 평문 왕복에서 수식이 보존된다', () => {
      const text = '함수 $f(x)=x^3-3x$ 의 극값과 $\\ce{H2O}$ 를 구하시오.';
      expect(extractPlainText(buildRichDoc(text))).toBe(text);
    });

    it('왕복한 평문을 다시 조립해도 같은 노드 트리다(멱등)', () => {
      const text = '함수 $f(x)=x^3-3x$ 의 극값은?';
      const once = buildRichDoc(text);
      expect(buildRichDoc(extractPlainText(once))).toEqual(once);
    });
  });

  describe('sanitize 화이트리스트', () => {
    const wrap = (node: PMNode) => ({ type: 'doc', content: [node] });

    it('조립한 수식 문서가 저장 검증을 통과하고 구조가 보존된다', () => {
      const doc = buildRichDoc('넓이는 $\\pi r^2$ 이다.\n$$\\int_0^1 x\\,dx$$');
      expect(sanitizeProseMirrorNode(doc, 'stem')).toEqual(doc);
    });

    it('latex 외의 attr은 거부한다', () => {
      expect(() =>
        sanitizeProseMirrorNode(
          wrap({ type: 'inlineMath', attrs: { latex: 'x', onclick: 'alert(1)' } }),
        ),
      ).toThrow(ProseMirrorValidationError);
    });

    it('표 노드가 통과한다(에디터 수동 입력용)', () => {
      const table = {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목' }] }],
              },
              {
                type: 'tableCell',
                attrs: { colspan: 2, rowspan: 1 },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '값' }] }],
              },
            ],
          },
        ],
      };
      expect(sanitizeProseMirrorNode(wrap(table as PMNode), 'stem')).toEqual(wrap(table as PMNode));
    });

    it('colwidth에 숫자가 아닌 값이 섞이면 거부한다', () => {
      expect(() =>
        sanitizeProseMirrorNode(
          wrap({ type: 'tableCell', attrs: { colwidth: ['<script>'] } } as PMNode),
        ),
      ).toThrow(/원시 값/);
    });

    it('배열 예외는 colwidth에만 적용된다', () => {
      expect(() =>
        sanitizeProseMirrorNode(wrap({ type: 'image', attrs: { alt: ['x'] } } as PMNode)),
      ).toThrow(/원시 값/);
    });
  });
});
