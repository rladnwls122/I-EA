"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Trash2, X } from "lucide-react";

const COLORS = ["#f87171", "#34d399", "#60a5fa", "#facc15", "#f7f8f8"];

export function DrawingOverlay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    ctx.strokeStyle = erasing ? "#000000" : color;
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.lineWidth = erasing ? 24 : 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(e.clientX, e.clientY);
    ctx.stroke();
    last.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = () => {
    drawing.current = false;
    last.current = null;
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="fixed inset-0 z-[60]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      {/* 모바일: 전역 하단 네비(56px)를 비키도록 bottom-20. 데스크톱: 네비가 없으므로 화면 하단에 더 붙인다. */}
      <div className="fixed bottom-20 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-popover px-3 py-2 shadow-lg surface-sheen md:bottom-6">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setColor(c);
              setErasing(false);
            }}
            aria-label={`색상 ${c}`}
            aria-pressed={!erasing && color === c}
            className={`h-10 w-10 flex-none rounded-full border-2 transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover md:h-8 md:w-8 ${
              !erasing && color === c ? "border-foreground" : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          onClick={() => setErasing(true)}
          aria-pressed={erasing}
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-md border transition-colors duration-150 ease-swift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover md:h-8 md:w-8 ${
            erasing ? "border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title="지우개"
        >
          <Eraser size={14} />
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-wrong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover md:h-8 md:w-8"
          title="전체 지우기"
        >
          <Trash2 size={14} />
        </button>
        <span className="mx-1 h-4 w-px flex-none bg-border" />
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 ease-swift hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover md:h-8 md:w-8"
          title="화면필기 끄기"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
