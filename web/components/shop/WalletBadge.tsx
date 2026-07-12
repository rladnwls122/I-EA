"use client";
import { Coins } from "lucide-react";
import { useWallet } from "@/lib/hooks";

/** 코인 잔고 배지 — 상점 헤더에 고정 노출. */
export function WalletBadge() {
  const { data: wallet, isLoading } = useWallet();

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 shadow-surface">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <Coins size={16} />
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {isLoading ? "—" : (wallet?.coins ?? 0).toLocaleString()}
      </span>
      <span className="text-xs text-muted-foreground">코인</span>
    </div>
  );
}
