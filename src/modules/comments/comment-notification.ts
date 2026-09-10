/**
 * 댓글 알림 수신자 판정 — 순수 함수라 DB 없이 검증한다.
 *
 * 규칙(1-depth 트리):
 *   - 답글  → 부모 댓글 작성자에게
 *   - 최상위 → 문제 출제자에게
 *   - 자기 글에 자기가 단 건 알리지 않는다
 *   - 수신자가 옵트인(notifyCommentEmail)하지 않았으면 보내지 않는다
 */
export interface CommentRecipientInput {
  authorId: string;
  /** 답글이면 부모 댓글 작성자, 아니면 null */
  parentAuthor: { id: string; email: string; notifyCommentEmail: boolean } | null;
  questionCreator: { id: string; email: string; notifyCommentEmail: boolean } | null;
}

export function resolveCommentRecipient(input: CommentRecipientInput): { email: string; kind: 'reply' | 'comment' } | null {
  const target = input.parentAuthor ? { user: input.parentAuthor, kind: 'reply' as const } : input.questionCreator ? { user: input.questionCreator, kind: 'comment' as const } : null;
  if (!target) return null;
  if (target.user.id === input.authorId) return null;
  if (!target.user.notifyCommentEmail) return null;
  return { email: target.user.email, kind: target.kind };
}

export interface CommentMailInput {
  kind: 'reply' | 'comment';
  authorNickname: string;
  questionTitle: string;
  content: string;
  questionUrl: string;
  settingsUrl: string;
}

/** 본문은 text/html 둘 다 — 텍스트 전용 클라이언트와 스팸 필터 모두를 위해. */
export function buildCommentMail(input: CommentMailInput): { subject: string; text: string; html: string } {
  const what = input.kind === 'reply' ? '내 댓글에 답글이 달렸습니다' : '내 문제에 댓글이 달렸습니다';
  const title = truncate(input.questionTitle, 60);
  const body = truncate(input.content, 500);
  const subject = `[IΔEA] ${what}: ${title}`;
  const text = [
    `${input.authorNickname}님이 ${input.kind === 'reply' ? '답글' : '댓글'}을 남겼습니다.`,
    '',
    `문제: ${title}`,
    '',
    body,
    '',
    `보러 가기: ${input.questionUrl}`,
    '',
    `이 알림은 내 정보 > 알림 설정에서 끌 수 있습니다: ${input.settingsUrl}`,
  ].join('\n');
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Pretendard,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="font-size:12px;color:#64748b;margin:0 0 16px">IΔEA</p>
  <h2 style="font-size:18px;margin:0 0 12px">${what}</h2>
  <p style="margin:0 0 8px"><strong>${escapeHtml(input.authorNickname)}</strong>님 · 문제 「${escapeHtml(title)}」</p>
  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #6366f1;background:#f8fafc;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
  <p><a href="${input.questionUrl}" style="display:inline-block;padding:10px 16px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px">보러 가기</a></p>
  <p style="font-size:12px;color:#94a3b8;margin-top:24px">이 알림은 <a href="${input.settingsUrl}" style="color:#94a3b8">내 정보 &gt; 알림 설정</a>에서 끌 수 있습니다.</p>
</div>`.trim();
  return { subject, text, html };
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
