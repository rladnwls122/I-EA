"use client";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOpenBox } from "@/lib/hooks";
import type { LootBoxTier } from "@/lib/types";

const TIER_LABEL: Record<LootBoxTier, string> = {
  COMMON: "일반",
  RARE: "희귀",
  LEGENDARY: "전설",
};

const TIER_BADGE_VARIANT: Record<LootBoxTier, "secondary" | "default" | "destructive"> = {
  COMMON: "secondary",
  RARE: "default",
  LEGENDARY: "destructive",
};

/**
 * 세션 제출 결과에 딸려온 상자 — 개봉 전(대기)과 개봉 후(코인 카운트업) 두 상태를 오간다.
 * 이미 개봉된 상자(409 — 예: 새로고침 후 재방문한 결과 화면)는 에러 토스트 없이 조용히
 * 카드를 숨긴다. 그 외 실패만 사용자에게 알린다.
 */
export function BoxRewardCard({ box }: { box: { id: string; tier: LootBoxTier } }) {
  const openBox = useOpenBox();
  const [rewardCoins, setRewardCoins] = useState<number | null>(null);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [hidden, setHidden] = useState(false);

  // 코인 획득 애니메이션 — 0에서 목표값까지 짧게 카운트업.
  useEffect(() => {
    if (rewardCoins == null || rewardCoins <= 0) return;
    const steps = Math.min(rewardCoins, 24);
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setDisplayCoins(Math.round((rewardCoins * current) / steps));
      if (current >= steps) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, [rewardCoins]);

  if (hidden) return null;

  const opened = rewardCoins != null;

  const handleOpen = () => {
    openBox.mutate(box.id, {
      onSuccess: (result) => setRewardCoins(result.rewardCoins),
      onError: (error: Error) => {
        // 백엔드 ConflictException 메시지("이미 개봉했거나...", "이미 개봉된 상자입니다.") —
        // 이미 개봉된 상자는 조용히 무시(카드만 숨김), 그 외 실패만 토스트로 알린다.
        if (error.message.includes("이미 개봉")) {
          setHidden(true);
          return;
        }
        toast.error("상자를 여는 데 실패했어요. 다시 시도해주세요.");
      },
    });
  };

  return (
    <div className="reward-pop mb-4 rounded-xl border border-border bg-card p-5 shadow-surface surface-sheen">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-streak/10 text-streak">
          <Gift size={22} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {opened ? "상자를 열었어요!" : "상자 획득!"}
            </p>
            <Badge variant={TIER_BADGE_VARIANT[box.tier]}>{TIER_LABEL[box.tier]}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {opened
              ? "코인을 획득했어요."
              : "제출 보상으로 상자를 받았어요. 열어서 코인을 확인하세요."}
          </p>
        </div>

        {opened ? (
          <span className="flex items-baseline gap-1 font-mono text-lg font-semibold text-streak">
            +{displayCoins}
            <span className="text-xs font-normal text-muted-foreground">코인</span>
          </span>
        ) : (
          <Button size="sm" onClick={handleOpen} disabled={openBox.isPending}>
            {openBox.isPending ? "여는 중..." : "상자 열기"}
          </Button>
        )}
      </div>
    </div>
  );
}
