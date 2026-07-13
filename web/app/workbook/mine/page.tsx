"use client";
import { useState } from "react";
import Link from "next/link";
import { LibraryBig, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, useWorkbooks, useDeleteWorkbook } from "@/lib/hooks";
import { WorkbookPreviewSidebar } from "@/components/workbook/WorkbookPreviewSidebar";
import { WorkbookCard } from "@/components/workbook/WorkbookCard";
import { DissolveCard } from "@/components/workbook/DissolveCard";
import { CartButton } from "@/components/cart/CartButton";

/** 소멸 애니메이션 길이(ms) — globals.css의 wb-disintegrate와 맞춰야 한다. */
const DISSOLVE_MS = 700;

/** 내 문제집 — 공개/비공개 무관하게 내가 만든 것만. 공개 문제집 탐색은 /workbook. */
export default function MyWorkbooksPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 삭제 모드: 카드를 누르면 미리보기 대신 그 문제집을 삭제 확인으로 연다(하나씩 삭제).
  const [deleteMode, setDeleteMode] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // 삭제 애니메이션 진행 중인 카드들. 소멸 모션이 끝나면 hiddenIds로 옮겨 화면에서 뺀다.
  const [dissolvingIds, setDissolvingIds] = useState<Set<string>>(new Set());
  // 화면에서 즉시 제거한 카드들(낙관적). 서버 삭제 성공 후 refetch와도 일관.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const { data, isLoading } = useWorkbooks({ search: keyword || undefined, mine: true });
  const { data: me } = useMe();
  const deleteWorkbook = useDeleteWorkbook();
  // hiddenIds에 든 것은 화면에서 뺀다(가루가 되어 이미 사라진 카드).
  const workbooks = (data?.items || []).filter((wb) => !hiddenIds.has(wb.id));

  const exitDeleteMode = () => {
    setDeleteMode(false);
    setConfirmId(null);
  };

  const handleDelete = (id: string) => {
    // 1) 확인창 닫고 즉시 소멸 애니메이션 시작(내 화면에서 가루로 흩어짐)
    setConfirmId(null);
    setDissolvingIds((prev) => new Set(prev).add(id));
    // 2) 애니메이션이 끝나면 화면에서 빼고 삭제 쿼리를 보낸다.
    window.setTimeout(() => {
      setHiddenIds((prev) => new Set(prev).add(id));
      setDissolvingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      deleteWorkbook.mutate(id);
    }, DISSOLVE_MS);
  };

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            My workbooks
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">내 문제집</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            내가 만든 문제집을 모아봅니다(공개·비공개 모두).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workbooks.length > 0 &&
            (deleteMode ? (
              <Button variant="outline" onClick={exitDeleteMode}>
                완료
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => setDeleteMode(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 size={15} className="mr-1.5" /> 삭제 모드
              </Button>
            ))}
          <Button asChild variant="outline">
            <Link href="/workbook">공개 탐색</Link>
          </Button>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>
      </div>

      <div className="relative mb-8">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="내 문제집 제목으로 검색"
          className="h-11 pl-10"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-[168px] animate-pulse rounded-xl border border-border bg-surface-raised"
            />
          ))}
        </div>
      ) : workbooks.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-20 text-center">
          <LibraryBig size={28} strokeWidth={1.75} className="mb-4 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">
            아직 만든 문제집이 없습니다. 첫 문제집을 만들어보세요.
          </p>
          <Button asChild>
            <Link href="/workbook/create">문제집 만들기</Link>
          </Button>
        </div>
      ) : (
        <>
          {deleteMode && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
              <Trash2 size={15} className="flex-none" />
              삭제할 문제집을 눌러 하나씩 삭제하세요. 삭제한 문제집은 되돌릴 수 없습니다.
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {workbooks.map((wb) => (
              <DissolveCard key={wb.id} active={dissolvingIds.has(wb.id)}>
                <WorkbookCard
                  wb={wb}
                  deleteMode={deleteMode}
                  onClick={() =>
                    deleteMode ? setConfirmId(wb.id) : setSelectedId(wb.id)
                  }
                  canEdit={!!me && me.id === wb.ownerId}
                />
                {confirmId === wb.id && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive bg-card/95 p-4 text-center backdrop-blur">
                    <p className="text-sm text-foreground">
                      <span className="font-semibold">{wb.title}</span>
                      <br />
                      삭제할까요? 되돌릴 수 없습니다.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmId(null)}
                        disabled={deleteWorkbook.isPending}
                      >
                        취소
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDelete(wb.id)}
                        disabled={deleteWorkbook.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteWorkbook.isPending ? "삭제 중…" : "삭제"}
                      </Button>
                    </div>
                  </div>
                )}
              </DissolveCard>
            ))}
          </div>
        </>
      )}
      {!deleteMode && (
        <WorkbookPreviewSidebar workbookId={selectedId} onClose={() => setSelectedId(null)} />
      )}
      <CartButton />
    </main>
  );
}
