"use client";
import { useMemo, type CSSProperties, type ReactNode } from "react";

const PARTICLE_COUNT = 28;

type Particle = {
  left: number;
  top: number;
  dx: number;
  dy: number;
  size: number;
  delay: number;
};

/**
 * 삭제 시 카드를 "가루로 흩어지듯" 소멸시키는 래퍼.
 * active가 true가 되면 본체는 blur+상승하며 사라지고, 위에 겹친 파티클이
 * 위/바깥으로 날아간다. 애니메이션이 끝나는 시점(약 700ms)에 부모가 목록에서
 * 제거하면 자연스럽게 이어진다. 파티클 배치는 마운트 시 한 번만 정해 리렌더에도
 * 흔들리지 않는다.
 */
export function DissolveCard({ active, children }: { active: boolean; children: ReactNode }) {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        left: Math.random() * 100,
        top: Math.random() * 100,
        dx: (Math.random() - 0.5) * 90,
        dy: -20 - Math.random() * 80,
        size: 2 + Math.random() * 4,
        delay: Math.random() * 0.18,
      })),
    [],
  );

  return (
    <div className="relative" style={{ isolation: "isolate" }}>
      <div className={active ? "wb-disintegrate" : undefined}>{children}</div>
      {active && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden>
          {particles.map((p, i) => (
            <span
              key={i}
              className="wb-dust-particle absolute rounded-[1px] bg-muted-foreground/70"
              style={
                {
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                  width: p.size,
                  height: p.size,
                  "--dx": `${p.dx}px`,
                  "--dy": `${p.dy}px`,
                  "--delay": `${p.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
