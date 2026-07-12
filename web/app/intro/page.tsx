"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, BrainCircuit, Check, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** 뷰포트 진입 시 .is-in을 붙여 떠오르게 하는 래퍼. delay로 스태거. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in");
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/**
 * 학습 루프 — 이 서비스의 실제 사용 순서라 번호가 정보다.
 * 풀고(1) → 이유를 남기고(2) → 다시 만난다(3). 오답노트가 루프의 축.
 */
const LOOP = [
  {
    n: "1",
    icon: BookOpenCheck,
    title: "골라 담아 풀기",
    body: "과목·개념·난이도로 문항을 골라 문제집으로 묶고, 그대로 응시합니다.",
  },
  {
    n: "2",
    icon: Lightbulb,
    title: "틀린 이유 남기기",
    body: "개념부족·실수·시간부족 — 원인 태그와 메모가 오답마다 쌓입니다.",
  },
  {
    n: "3",
    icon: BrainCircuit,
    title: "AI와 다시 만나기",
    body: "약한 유형을 AI가 새 문항으로 되돌려줍니다. 루프가 반복될수록 빈틈이 줄어듭니다.",
  },
];

export default function IntroPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // 이미 로그인돼 있으면 인트로를 볼 이유가 없다 → 메인으로.
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("token")) {
      router.replace("/");
    }
  }, [router]);

  /** 로그인 없이 둘러보기 — 홈의 인트로 리다이렉트를 이번 세션 동안 끈다. */
  const browseAsGuest = () => {
    sessionStorage.setItem("introSeen", "1");
    router.push("/");
  };

  return (
    // 사이드바가 숨는 대신 body의 패딩(모바일 pb-14 / md 이상 pl-[64px])이 남으므로 상쇄한다(AppSidebar 참고).
    <div className="-mb-14 min-h-screen bg-background md:-ml-[64px] md:mb-0">
      {/* 최소 내비 — 몰입 유지: 로고와 로그인만 */}
      <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-border bg-background/70 px-8 py-4 backdrop-blur">
        <span className="text-xl font-semibold tracking-tight">
          I<span className="mx-0.5 text-primary">Δ</span>EA
        </span>
        <Button asChild size="sm" variant="secondary">
          <Link href="/login">로그인</Link>
        </Button>
      </nav>

      {/* ═══ 히어로 ═══ */}
      <section className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-12 px-8 pt-24 lg:grid-cols-[1.1fr_1fr]">
        <div
          className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
            loaded ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
          }`}
        >
          <h1 className="mb-6 text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">
            틀린 이유가
            <br />
            <span className="text-primary">다음 정답이 되는 곳.</span>
          </h1>
          <p className="mb-9 max-w-md text-base leading-relaxed text-muted-foreground">
            AI가 문항을 만들고, 오답의 이유가 쌓이고, 약점이 새 문제로 돌아옵니다.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                로그인하고 시작 <ArrowRight size={18} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" onClick={browseAsGuest}>
              로그인 없이 둘러보기
            </Button>
          </div>
        </div>

        {/* 두 번째 비트로 떠오르는 문항 카드 — 제품이 만드는 것을 그대로 보여준다 */}
        <div
          className={`transition-all delay-200 duration-700 ease-out motion-reduce:transition-none ${
            loaded ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
          }`}
        >
          <div className="glass-chip rounded-2xl border p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] font-medium">객관식 · 문학</Badge>
              <span className="font-mono text-[10px] text-muted-foreground">AI 생성</span>
            </div>
            <p className="mb-4 text-[15px] font-medium leading-snug text-foreground">
              (가)의 화자에 대한 설명으로 가장 적절한 것은?
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2.5 text-xs text-foreground">
                <Check size={13} strokeWidth={2.5} className="shrink-0 text-primary" />
                상실의 슬픔을 절제된 어조로 드러내고 있다.
              </div>
              <div className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
                미래에 대한 낙관적 기대를 표출하고 있다.
              </div>
              <div className="rounded-lg border border-border px-3 py-2.5 text-xs text-muted-foreground">
                대상을 향한 원망을 직설적으로 토로하고 있다.
              </div>
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              반복되는 시어와 차분한 종결 어미에서 감정을 억누르는 화자의 태도가 드러납니다.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 학습 루프 — 스크롤 리빌 ═══ */}
      <section className="mx-auto max-w-6xl px-8 py-28">
        <Reveal>
          <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
            세 걸음이 하나의 루프
          </h2>
          <p className="mb-14 max-w-md text-sm leading-relaxed text-muted-foreground">
            풀고, 이유를 남기고, 다시 만나는 순서 그대로 화면이 이어집니다.
          </p>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {LOOP.map((step, i) => (
            <Reveal key={step.n} delay={i * 120}>
              <div className="h-full rounded-xl border border-border bg-card p-6">
                <div className="mb-5 flex items-center justify-between">
                  <step.icon size={20} strokeWidth={2} className="text-primary" />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {step.n} / 3
                  </span>
                </div>
                <h3 className="mb-2 text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ 오답 원인 — 제품의 축 하나를 깊게 ═══ */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-8 py-24 lg:grid-cols-2">
          <Reveal>
            <h2 className="mb-3 text-2xl font-semibold tracking-tight md:text-3xl">
              오답에는 전부 이유가 있다
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              개념부족인지, 실수인지, 시간이 모자랐는지 — 원인을 남기면
              분포가 그려지고, 다음에 풀 것이 정해집니다.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="space-y-3 rounded-xl border border-border bg-card p-6">
              {[
                { label: "개념부족", color: "#a78bfa", w: "62%", n: "31건" },
                { label: "실수", color: "#fbbf24", w: "28%", n: "14건" },
                { label: "시간부족", color: "#60a5fa", w: "10%", n: "5건" },
              ].map((r) => (
                <div key={r.label} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="w-16 shrink-0 text-sm">{r.label}</span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-raised">
                    <div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {r.n}
                  </span>
                </div>
              ))}
              <p className="pt-1 font-mono text-[10px] text-muted-foreground">예시 화면</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ 마지막 CTA ═══ */}
      <section className="mx-auto max-w-6xl px-8 py-28 text-center">
        <Reveal>
          <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
            오늘 틀린 문제부터.
          </h2>
          <p className="mx-auto mb-9 max-w-sm text-sm leading-relaxed text-muted-foreground">
            계정을 만들면 오답과 원인이 쌓이기 시작합니다.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">
                로그인하고 시작 <ArrowRight size={18} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" onClick={browseAsGuest}>
              로그인 없이 둘러보기
            </Button>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border px-8 py-8 text-center font-mono text-xs text-muted-foreground">
        IΔEA — AI 문제은행과 오답노트
      </footer>
    </div>
  );
}
