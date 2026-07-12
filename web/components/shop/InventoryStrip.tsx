"use client";
import { Loader2, Lightbulb, Palette, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEquipCosmetic } from "@/lib/hooks";
import type { ShopItem, Wallet } from "@/lib/types";

/** 보호권/힌트토큰 보유 수 + 코스메틱 소유·장착 스트립. */
export function InventoryStrip({ wallet, shopItems }: { wallet: Wallet; shopItems: ShopItem[] }) {
  const equip = useEquipCosmetic();
  const ownedCosmetics = wallet.cosmetics.owned || [];

  const cosmeticName = (key: string) =>
    shopItems.find((i) => i.key === key)?.name || key;

  const handleEquip = (key: string) => {
    equip.mutate(key, {
      onSuccess: () => toast.success("장착했습니다."),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "장착에 실패했습니다."),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">내 보관함</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2.5">
            <ShieldCheck size={16} className="text-primary" />
            <span className="text-sm text-muted-foreground">연속학습 보호권</span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {wallet.inventory.STREAK_SHIELD}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border px-3.5 py-2.5">
            <Lightbulb size={16} className="text-primary" />
            <span className="text-sm text-muted-foreground">힌트 토큰</span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {wallet.inventory.HINT_TOKEN}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">코스메틱</p>
          {ownedCosmetics.length === 0 ? (
            <p className="text-xs text-muted-foreground">아직 보유한 코스메틱이 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ownedCosmetics.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-border py-1.5 pl-3 pr-1.5"
                >
                  <Palette size={14} className="text-muted-foreground" />
                  <span className="text-sm">{cosmeticName(key)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={equip.isPending && equip.variables === key}
                    onClick={() => handleEquip(key)}
                  >
                    {equip.isPending && equip.variables === key && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    장착
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {(wallet.cosmetics.equippedTitle || wallet.cosmetics.nameColor) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>현재 장착</span>
            {wallet.cosmetics.equippedTitle && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
                {wallet.cosmetics.equippedTitle}
              </span>
            )}
            {wallet.cosmetics.nameColor && (
              <span
                className="rounded-full px-2.5 py-0.5 font-medium"
                style={{
                  color: wallet.cosmetics.nameColor,
                  backgroundColor: `${wallet.cosmetics.nameColor}22`,
                }}
              >
                닉네임 색
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
