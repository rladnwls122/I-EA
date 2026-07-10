export default function NotesLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      <div className="flex-1 min-w-0">
        {children}
      </div>
      <aside className="w-full lg:w-[320px] xl:w-[360px] border-l border-border bg-card/50 p-6 flex flex-col gap-6 overflow-y-auto">
        {sidebar}
      </aside>
    </div>
  );
}
