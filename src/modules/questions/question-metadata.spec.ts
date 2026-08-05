import { mergeMetadata, readReviewVerdict } from './question-metadata';

describe('mergeMetadata — PATCH의 metadata는 덮어쓰지 않고 합친다', () => {
  it('보낸 키만 바뀌고 남의 키는 남는다 (교체안 판정이 빈칸 번호를 지우던 자리)', () => {
    const merged = mergeMetadata(
      { blankIndex: 3, style: 'OX' },
      { review: { verdict: 'REVISE' } },
    );
    expect(merged).toEqual({ blankIndex: 3, style: 'OX', review: { verdict: 'REVISE' } });
  });

  it('같은 키가 오면 갈아치운다 — 깊은 병합은 하지 않는다', () => {
    const merged = mergeMetadata(
      { review: { verdict: 'PASS', axes: ['발문형식'] } },
      { review: { verdict: 'REVISE' } },
    );
    expect(merged).toEqual({ review: { verdict: 'REVISE' } });
  });

  it('값 null은 그 키를 지운다 — 병합만 두면 키를 지울 방법이 사라진다', () => {
    expect(mergeMetadata({ blankIndex: 3, style: 'OX' }, { blankIndex: null })).toEqual({
      style: 'OX',
    });
  });

  it('전부 지워 비면 null이다 — 빈 객체는 화면이 "메타데이터 있음"으로 읽는다', () => {
    expect(mergeMetadata({ style: 'OX' }, { style: null })).toBeNull();
  });

  it('기존 값이 없거나 객체가 아니면 보낸 것만 남는다', () => {
    expect(mergeMetadata(null, { style: 'OX' })).toEqual({ style: 'OX' });
    expect(mergeMetadata(['배열은 metadata가 아니다'], { style: 'OX' })).toEqual({ style: 'OX' });
  });
});

describe('readReviewVerdict — 집계 컬럼에 넣을 값', () => {
  it('판정을 그대로 꺼낸다', () => {
    expect(readReviewVerdict({ review: { verdict: 'REVISE' } })).toBe('REVISE');
    expect(readReviewVerdict({ review: { verdict: 'ERROR' } })).toBe('ERROR');
  });

  it('판정이 없으면 null이다 — null(판정 안 함)과 ERROR(판정 실패)는 다른 상태다', () => {
    expect(readReviewVerdict({ blankIndex: 1 })).toBeNull();
    expect(readReviewVerdict(null)).toBeNull();
    expect(readReviewVerdict(undefined)).toBeNull();
  });

  it('모르는 판정 문자열은 넣지 않는다', () => {
    expect(readReviewVerdict({ review: { verdict: 'MAYBE' } })).toBeNull();
  });
});
