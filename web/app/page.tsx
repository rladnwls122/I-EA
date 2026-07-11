"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  ChartNoAxesCombined,
  Check,
  Clock,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRecentQuestions } from "@/lib/hooks";

const FEATURES = [
  {
    icon: BookOpenCheck,
    title: "골라 담는 문제",
    body: "과목·개념·난이도로 필요한 문항을 빠르게 찾아 문제집으로 묶습니다.",
  },
  {
    icon: BrainCircuit,
    title: "대화로 만드는 문항",
    body: "출제 의도를 말하면 AI가 초안을 제안하고, 에디터에서 완성합니다.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "쌓이는 오답의 이유",
    body: "틀린 이유와 메모를 남기면 다음 학습의 방향이 선명해집니다.",
  },
];

export default function Home() {
  const { recent } = useRecentQuestions();
  const router = useRouter();

  // 비로그인 첫 방문은 인트로로 보낸다. '둘러보기'로 들어온 세션(introSeen)은 그대로 통과 —
  // 인트로 ↔ 홈 리다이렉트 루프 방지.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("token") && !sessionStorage.getItem("introSeen")) {
      router.replace("/intro");
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* 내비게이션 */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-background/80 px-8 py-4 backdrop-blur">
        <Link className="text-xl font-semibold tracking-tight" href="/">
          I<span className="mx-0.5 text-primary">Δ</span>EA
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/questions"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            문제 탐색
          </Link>
          <Link
            href="/notes"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            오답노트
          </Link>
          <Button asChild size="sm" variant="secondary">
            <Link href="/login">로그인</Link>
          </Button>
        </div>
      </nav>

      {/* 히어로 */}
      <section className="mx-auto flex max-w-7xl flex-col items-center gap-14 px-8 pb-16 pt-20 lg:flex-row">
        <div className="flex-1">
          <span className="mb-5 block font-mono text-xs uppercase tracking-widest text-muted-foreground">
            AI Question Bank
          </span>
          <h1 className="mb-5 text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">
            공부의 흐름을
            <br />
            <span className="text-primary">내 것으로.</span>
          </h1>
          <p className="mb-8 max-w-md text-base leading-relaxed text-muted-foreground">
            문제를 고르고, 생각을 기록하고, 나만의 문제집으로 다시 만나는 학습.
          </p>
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/questions">
                문제 탐색 시작 <ArrowRight size={18} />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/workbook/create">문제집 만들기</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check size={16} className="text-primary" /> 개인화 문제 큐레이션
            </span>
            <span className="flex items-center gap-2">
              <Check size={16} className="text-primary" /> AI 출제 도우미
            </span>
          </div>
        </div>

        {/* 제품 미리보기 — 실제 카드와 같은 디자인 언어 */}
        <div className="relative w-full max-w-[420px] flex-1">
          <div
            className="pointer-events-none absolute inset-0 rounded-full bg-primary/10 blur-[100px]"
            aria-hidden
          />
          <div className="relative rounded-xl border border-border bg-card p-5">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="font-mono text-[11px] font-medium text-muted-foreground"
                >
                  문학
                </Badge>
                <span className="text-xs text-muted-foreground">객관식</span>
              </div>
              <div className="flex items-center gap-1" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`h-1.5 w-1.5 rounded-full ${
                      n <= 3 ? "bg-primary" : "bg-border"
                    }`}
                  />
                ))}
              </div>
            </div>
            <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
              다음 글의 화자의 태도로 가장 적절한 것은?
            </h3>
            <div className="mt-4 flex items-end justify-between border-t border-border pt-3.5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  정답률
                </span>
                <span className="font-mono text-sm font-medium tabular-nums">
                  72%
                </span>
                <span className="block h-[3px] w-14 overflow-hidden rounded-full bg-border">
                  <span className="block h-full w-[72%] rounded-full bg-primary" />
                </span>
              </div>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                조회 1.2k
              </span>
            </div>
          </div>

          <div className="absolute -right-3 top-8 flex items-center gap-2.5 rounded-xl border border-border bg-surface-raised px-3.5 py-3 shadow-sm">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles size={16} strokeWidth={2} />
            </span>
            <div>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                AI 출제 중
              </span>
              <span className="block text-[13px] font-medium">
                다음 문항 준비 중
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 최근 본 문제 — 실데이터, 있을 때만 */}
      {recent.length > 0 && (
        <section className="mx-auto max-w-7xl px-8 py-16">
          <div className="mb-6 flex items-center gap-2.5">
            <Clock size={20} strokeWidth={2} className="text-muted-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight">최근 본 문제</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recent.map((item) => (
              <Link
                key={item.id}
                href={`/questions/${item.id}`}
                className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <Badge
                  variant="secondary"
                  className="mb-3 self-start font-mono text-[11px] font-medium text-muted-foreground"
                >
                  {item.subject}
                </Badge>
                <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
                  {item.title}
                </h3>
                <span className="mt-4 block font-mono text-xs tabular-nums text-muted-foreground">
                  {item.viewedAt
                    ? new Date(item.viewedAt).toLocaleDateString()
                    : "최근"}{" "}
                  확인
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 기능 소개 */}
      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-8 pb-8 pt-4 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-xl border border-border bg-card p-7"
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon size={22} strokeWidth={2} />
            </span>
            <h2 className="mb-2 text-lg font-semibold tracking-tight">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
