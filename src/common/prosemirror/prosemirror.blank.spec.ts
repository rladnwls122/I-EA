import { blankMarker, buildRichDoc, extractPlainText, findBlankMarkers, normalizeBlankMarkers } from './prosemirror.util';

/**
 * 지문 내장 빈칸 마커(#43 gap 9 — 토익 Part 6).
 *
 * 규약은 두 겹이다: LLM은 `[[n]]`을 방출하고, 조립이 정본 `___(n)___`으로 정규화한다.
 * 여기서 지키려는 것은 (1) 정규화의 왕복 가능성, (2) 방금 들어온 수식 델리미터와의 비충돌,
 * (3) 마커가 없는 기존 입력의 무변화다.
 */
describe('빈칸 마커 정규화', () => {
  it('`[[n]]`을 정본 마커 `___(n)___`으로 바꾼다', () => {
    expect(normalizeBlankMarkers('We [[1]] your order and [[2]] it today.')).toBe(
      'We ___(1)___ your order and ___(2)___ it today.',
    );
  });

  it('마커가 없는 텍스트는 문자 하나도 바뀌지 않는다 — 기존 전 경로의 무변화 보장', () => {
    const text = '다음 중 옳은 것은?\n\n첫째 줄\n둘째 줄';
    expect(normalizeBlankMarkers(text)).toBe(text);
  });

  it('정규화는 멱등이다 — 이미 정본인 텍스트를 다시 돌려도 그대로', () => {
    const once = normalizeBlankMarkers('빈칸 [[1]]에 들어갈 말은?');
    expect(normalizeBlankMarkers(once)).toBe(once);
  });

  it('마커 번호는 등장 순서대로 뽑힌다(입력 문법·정본 형태 모두)', () => {
    expect(findBlankMarkers('a [[2]] b [[1]] c')).toEqual([2, 1]);
    expect(findBlankMarkers('a ___(1)___ b ___(3)___')).toEqual([1, 3]);
  });

  it('마커가 없으면 빈 배열', () => {
    expect(findBlankMarkers('평범한 지문입니다.')).toEqual([]);
  });

  it('정본 마커 문자열은 blankMarker()가 단일 출처다', () => {
    expect(blankMarker(4)).toBe('___(4)___');
    expect(findBlankMarkers(blankMarker(4))).toEqual([4]);
  });
});

describe('빈칸 마커 × 수식 델리미터 비충돌 (#35 토크나이저 보호)', () => {
  it('수식과 마커가 한 문단에 섞여도 서로를 삼키지 않는다', () => {
    const doc = buildRichDoc(normalizeBlankMarkers('값이 $x^2$일 때 [[1]]에 들어갈 것은?'));
    const inline = doc.content?.[0]?.content ?? [];
    expect(inline.some((n) => n.type === 'inlineMath' && n.attrs?.latex === 'x^2')).toBe(true);
    expect(inline.some((n) => n.type === 'text' && n.text?.includes('___(1)___'))).toBe(true);
  });

  it('별행 수식($$...$$)이 마커 정규화로 깨지지 않는다', () => {
    const doc = buildRichDoc(normalizeBlankMarkers('앞 [[1]]\n$$\\frac{1}{2}$$\n뒤 [[2]]'));
    const types = (doc.content ?? []).map((n) => n.type);
    expect(types).toContain('blockMath');
    expect(extractPlainText(doc)).toContain('___(1)___');
    expect(extractPlainText(doc)).toContain('___(2)___');
  });

  it('렌더 가능한 수식 **안쪽**의 `[[...]]`는 건드리지 않는다 — LaTeX를 망가뜨리지 않는다', () => {
    const latex = '$\\left[[1]\\right]$';
    expect(normalizeBlankMarkers(`${latex} 그리고 [[1]]`)).toBe(`${latex} 그리고 ___(1)___`);
  });

  it('통화 표기($100)는 수식이 아니라 평문이므로 그 안의 마커도 정규화된다', () => {
    expect(normalizeBlankMarkers('$100 [[1]]')).toBe('$100 ___(1)___');
  });

  it('마커가 있어도 수식 없는 문서의 조립 결과는 평범한 문단이다(노드 승격 없음)', () => {
    const doc = buildRichDoc(normalizeBlankMarkers('Please [[1]] the form.'));
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Please ___(1)___ the form.' }] },
    ]);
  });
});
