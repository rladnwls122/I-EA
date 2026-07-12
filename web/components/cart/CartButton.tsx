"use client";
import { useEffect, useState } from "react";
import { ShoppingBasket } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { CartPanel } from "./CartPanel";

/**
 * 플로팅 장바구니 버튼 — 담은 수 뱃지, 클릭 시 패널 토글.
 * persist 하이드레이션 전 SSR 불일치를 피하려고 마운트 후에만 개수를 신뢰한다.
 */
export function CartButton() {
  const count = useCartStore((s) => s.items.length);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || count === 0) {
    // 0개면 버튼 숨김(패널이 열려있으면 유지 — 비운 직후 바로 닫히는 어색함 방지)
    if (!open) return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="장바구니"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition-colors hover:border-primary/40"
      >
        <ShoppingBasket size={18} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </button>
      {open && <CartPanel onClose={() => setOpen(false)} />}
    </>
  );
}
