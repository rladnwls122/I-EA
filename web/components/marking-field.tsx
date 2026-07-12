"use client";

import { useEffect, useRef } from "react";

/**
 * 마킹 필드 — 인트로 앰비언트 배경.
 *
 * OMR 답안지의 마킹 점 격자를 깔고, "이해의 커서"(에메랄드 광원)가 마우스 포인터를
 * 부드럽게 따라가며 근처 빈 동그라미를 정답처럼 채운다 → 지나가면 서서히 비워진다.
 * 히어로 카피 "틀린 이유가 다음 정답이 되는 곳"의 루프를 배경이 그대로 연기한다.
 *
 * 순수 2D canvas라 SSR 안전(클라이언트 전용 마운트) + WebGL 라이브러리 없이 가볍다.
 * prefers-reduced-motion이면 rAF 없이 정적 프레임 한 장만 그린다.
 */

const EMERALD = { r: 52, g: 211, b: 153 }; // --primary #34d399
const RING = "rgba(255,255,255,0.055)"; // hairline hollow ring (near-black 위에서 --border보다 살짝 밝게)
const GRID = 46; // 격자 간격(px) — 반응형으로 밀도 유지
const CURSOR_R = 190; // 커서 영향 반경(px)

type Bubble = { x: number; y: number; r: number; a: number }; // a = activation 0..1

export function MarkingField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let bubbles: Bubble[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;

    /** 뷰포트 격자를 다시 깐다 — 점마다 약간의 지터로 손마킹 느낌. */
    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      bubbles = [];
      const cols = Math.ceil(w / GRID) + 1;
      const rows = Math.ceil(h / GRID) + 1;
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const jx = (Math.random() - 0.5) * GRID * 0.32;
          const jy = (Math.random() - 0.5) * GRID * 0.32;
          bubbles.push({
            x: ix * GRID + jx,
            y: iy * GRID + jy,
            r: 2.1 + Math.random() * 1.2,
            a: 0,
          });
        }
      }
    };

    /** 이해의 커서 — 마우스 포인터를 향해 lerp로 부드럽게 이동. 첫 이동 전엔 화면 중앙. */
    const mouse = { x: 0, y: 0, tx: 0, ty: 0, seen: false };
    const centerIfUnseen = () => {
      if (!mouse.seen) {
        mouse.x = mouse.tx = w / 2;
        mouse.y = mouse.ty = h / 2;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const px = mouse.x;
      const py = mouse.y;

      for (const b of bubbles) {
        const d = Math.hypot(b.x - px, b.y - py);
        const infl = d < CURSOR_R ? 1 - d / CURSOR_R : 0;
        const target = infl * infl; // ease-in — 가장자리는 은은, 중심은 또렷
        // 채워질 땐 빠르게, 빠질 땐 느리게 → 잔광이 뒤따른다.
        b.a += (target - b.a) * (target > b.a ? 0.12 : 0.03);

        if (b.a < 0.02) {
          // idle hollow ring
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.strokeStyle = RING;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // 채워진 마킹 + 글로우
          const a = b.a;
          const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 5);
          glow.addColorStop(0, `rgba(${EMERALD.r},${EMERALD.g},${EMERALD.b},${0.35 * a})`);
          glow.addColorStop(1, "rgba(52,211,153,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + a * 0.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${EMERALD.r},${EMERALD.g},${EMERALD.b},${0.28 + 0.55 * a})`;
          ctx.fill();
        }
      }
    };

    let raf = 0;
    let running = false;
    const loop = () => {
      // 커서를 마우스 타깃으로 부드럽게 이동(lerp).
      mouse.x += (mouse.tx - mouse.x) * 0.15;
      mouse.y += (mouse.ty - mouse.y) * 0.15;
      draw();
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // 정적 폴백(reduced-motion) — 커서를 중앙에 두고 activation을 수렴시킨다.
    const drawStatic = () => {
      mouse.x = mouse.tx = w / 2;
      mouse.y = mouse.ty = h / 2;
      for (let i = 0; i < 40; i++) draw();
    };

    build();
    centerIfUnseen();
    if (reduce) {
      drawStatic();
    } else {
      start();
    }

    // 마우스 포인터 추적 — 커서가 따라갈 타깃 갱신.
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
      mouse.seen = true;
    };
    if (!reduce) window.addEventListener("pointermove", onMove, { passive: true });

    const ro = new ResizeObserver(() => {
      build();
      centerIfUnseen();
      if (reduce) drawStatic();
    });
    ro.observe(document.documentElement);

    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      <div className="marking-aurora" aria-hidden />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      />
    </>
  );
}
