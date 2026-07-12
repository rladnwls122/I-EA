"use client";
import { Loader2, Package, Palette, Sparkles, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShopItem, ShopItemKind } from "@/lib/types";

const KIND_LABEL: Record<ShopItemKind, string> = {
  BOOST: "부스트",
  CONSUMABLE: "소모품",
  COSMETIC: "코스메틱",
  PHYSICAL: "실물 상품",
};

const KIND_ICON: Record<ShopItemKind, typeof Sparkles> = {
  BOOST: Sparkles,
  CONSUMABLE: Package,
  COSMETIC: Palette,
  PHYSICAL: Truck,
};

/** 상점 카탈로그 카드 — 잔고 부족 시 구매 버튼 비활성. */
export function ShopItemCard({
  item,
  coins,
  purchasing,
  onBuy,
}: {
  item: ShopItem;
  coins: number;
  purchasing: boolean;
  onBuy: (item: ShopItem) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const affordable = coins >= item.price;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon size={18} />
          </span>
          <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
        </div>
        <CardTitle className="text-base leading-snug">{item.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <p className="font-mono text-lg font-semibold tabular-nums">
          {item.price.toLocaleString()}
          <span className="ml-1 text-xs font-normal text-muted-foreground">코인</span>
        </p>
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          className="w-full"
          disabled={!affordable || purchasing}
          onClick={() => onBuy(item)}
        >
          {purchasing && <Loader2 size={14} className="animate-spin" />}
          {affordable ? "구매" : "코인 부족"}
        </Button>
      </CardFooter>
    </Card>
  );
}
