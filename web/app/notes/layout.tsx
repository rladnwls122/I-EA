export default function NotesLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  return (
    // 모바일에서는 본문 아래로 사이드바를 세로 스택, md 이상에서만 좌우 배치
    <div className="flex min-h-screen flex-col overflow-x-hidden md:flex-row">
      <div className="min-w-0 flex-1">
        {children}
      </div>
      <aside className="flex w-full flex-col gap-6 overflow-y-auto border-t border-border bg-card/50 p-4 md:w-[320px] md:border-l md:border-t-0 md:p-6 xl:w-[360px]">
        {sidebar}
      </aside>
    </div>
  );
}
