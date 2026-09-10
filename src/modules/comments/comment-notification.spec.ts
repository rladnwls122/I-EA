import { buildCommentMail, resolveCommentRecipient } from './comment-notification';

const on = (id: string) => ({ id, email: `${id}@x.io`, notifyCommentEmail: true });
const off = (id: string) => ({ id, email: `${id}@x.io`, notifyCommentEmail: false });

describe('resolveCommentRecipient', () => {
  it('답글은 부모 댓글 작성자에게', () => {
    expect(resolveCommentRecipient({ authorId: 'a', parentAuthor: on('p'), questionCreator: on('q') })).toEqual({
      email: 'p@x.io',
      kind: 'reply',
    });
  });

  it('최상위 댓글은 출제자에게', () => {
    expect(resolveCommentRecipient({ authorId: 'a', parentAuthor: null, questionCreator: on('q') })).toEqual({
      email: 'q@x.io',
      kind: 'comment',
    });
  });

  it('자기 글에 자기가 달면 안 보낸다', () => {
    expect(resolveCommentRecipient({ authorId: 'q', parentAuthor: null, questionCreator: on('q') })).toBeNull();
    expect(resolveCommentRecipient({ authorId: 'p', parentAuthor: on('p'), questionCreator: on('q') })).toBeNull();
  });

  it('옵트인 안 했으면 안 보낸다 — 부모가 꺼져 있어도 출제자로 넘어가지 않는다', () => {
    expect(resolveCommentRecipient({ authorId: 'a', parentAuthor: off('p'), questionCreator: on('q') })).toBeNull();
    expect(resolveCommentRecipient({ authorId: 'a', parentAuthor: null, questionCreator: off('q') })).toBeNull();
  });
});

describe('buildCommentMail', () => {
  it('제목·본문을 자르고 HTML을 이스케이프한다', () => {
    const m = buildCommentMail({
      kind: 'comment',
      authorNickname: '<b>철수</b>',
      questionTitle: 'x'.repeat(100),
      content: '<script>alert(1)</script>',
      questionUrl: 'https://app/questions/1',
      settingsUrl: 'https://app/me',
    });
    expect(m.subject).toMatch(/^\[IΔEA\] 내 문제에 댓글이 달렸습니다: x{59}…$/);
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&lt;b&gt;철수&lt;/b&gt;');
    expect(m.text).toContain('https://app/questions/1');
  });
});
