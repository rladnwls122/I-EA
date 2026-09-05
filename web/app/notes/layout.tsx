export default function NotesLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  return (
    // 모바일에서는 본문 아래로 사이드바를 세로 스택, md 이상에서만 좌우 배치.
    // 사이드바의 껍데기(폭·보더·패딩)는 @sidebar 슬롯이 직접 그린다 — 슬롯이 비는
    // 라우트(/notes/[questionId])에서 빈 칼럼과 세로 보더만 남지 않도록.
    <div className="flex min-h-screen flex-col overflow-x-hidden md:flex-row">
      <div className="min-w-0 flex-1">{children}</div>
      {sidebar}
    </div>
  );
}
