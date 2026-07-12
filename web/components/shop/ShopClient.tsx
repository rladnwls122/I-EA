"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet, useShopItems, usePurchase, useMyPurchases } from "@/lib/hooks";
import { WalletBadge } from "./WalletBadge";
import { ShopItemCard } from "./ShopItemCard";
import { InventoryStrip } from "./InventoryStrip";
import type { ShopItem } from "@/lib/types";

/** 상점 페이지 본체 — 카탈로그·구매·인벤토리. localStorage 토큰을 쓰므로 클라이언트 전용. */
export function ShopClient() {
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: itemsData, isLoading: itemsLoading } = useShopItems();
  const { data: purchasesData } = useMyPurchases();
  const purchase = usePurchase();
  const [purchasingKey, setPurchasingKey] = useState<string | null>(null);

  const items = itemsData || [];
  const purchases = purchasesData || [];
  const coins = wallet?.coins ?? 0;
  const pendingPhysical = purchases.filter((p) => p.status === "PENDING");

  const runPurchase = (item: ShopItem) => {
    setPurchasingKey(item.key);
    purchase.mutate(item.key, {
      onSuccess: (res) => {
        setPurchasingKey(null);
        toast.success(
          res.status === "PENDING"
            ? `${item.name} 구매 완료 — 배송 대기 상태로 접수됐어요.`
            : `${item.name} 구매 완료.`,
        );
      },
      onError: (err) => {
        setPurchasingKey(null);
        toast.error(err instanceof Error ? err.message : "구매에 실패했습니다.");
      },
    });
  };

  const handleBuy = (item: ShopItem) => {
    if (item.kind === "PHYSICAL") {
      const confirmed = window.confirm(
        `${item.name}을(를) ${item.price.toLocaleString()}코인으로 구매할까요?\n실물 상품은 결제 즉시 배송 대기 상태로 접수됩니다.`,
      );
      if (!confirmed) return;
    }
    runPurchase(item);
  };

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Shop
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">상점</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            코인으로 부스트·소모품·코스메틱을 구매하세요.
          </p>
        </div>
        <WalletBadge />
      </div>

      {pendingPhysical.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          실물 상품 {pendingPhysical.length}건이 배송 대기 중입니다.
        </div>
      )}

      {itemsLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-[168px] animate-pulse rounded-xl border border-border bg-surface-raised"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-20 text-center text-sm text-muted-foreground">
          현재 판매 중인 상품이 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ShopItemCard
              key={item.key}
              item={item}
              coins={coins}
              purchasing={purchasingKey === item.key && purchase.isPending}
              onBuy={handleBuy}
            />
          ))}
        </div>
      )}

      <div className="mt-8">
        {walletLoading || !wallet ? (
          <div className="h-40 animate-pulse rounded-xl border border-border bg-surface-raised" />
        ) : (
          <InventoryStrip wallet={wallet} shopItems={items} />
        )}
      </div>

      {purchases.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">구매 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {purchases.slice(0, 8).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm text-muted-foreground"
                >
                  <span className="text-foreground">
                    {items.find((i) => i.key === p.itemKey)?.name || p.itemKey}
                  </span>
                  <span className="font-mono text-xs">
                    {p.status === "PENDING" ? "배송 대기" : "완료"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
