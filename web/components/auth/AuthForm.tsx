"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const signup = mode === "signup";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* 좌측 브랜드 패널 — 데스크톱 전용 */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface-raised p-12 lg:flex">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <Link href="/" className="relative text-xl font-semibold tracking-tight">
          I<span className="mx-0.5 text-primary">Δ</span>EA
        </Link>
        <div className="relative">
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight">
            더 나은 질문이
            <br />
            <span className="text-primary">더 나은 답을</span>
            <br />
            만듭니다.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            문제를 푸는 시간부터 복습하는 순간까지, IΔEA가 학습의 다음 흐름을
            함께 설계합니다.
          </p>
        </div>
        <div className="relative flex items-start gap-2.5 text-sm text-muted-foreground">
          <Sparkles size={17} className="mt-0.5 shrink-0 text-primary" strokeWidth={2} />
          <span className="leading-relaxed">
            오늘의 작은 기록이 내일의 확신이 됩니다.
          </span>
        </div>
      </aside>

      {/* 우측 폼 */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 block text-xl font-semibold tracking-tight lg:hidden"
          >
            I<span className="mx-0.5 text-primary">Δ</span>EA
          </Link>

          <h2 className="text-2xl font-semibold tracking-tight">
            {signup ? "학습을 시작해볼까요?" : "다시 만나 반가워요."}
          </h2>
          <p className="mb-8 mt-2 text-sm text-muted-foreground">
            {signup
              ? "필요한 정보만 입력하면 바로 시작할 수 있어요."
              : "나만의 학습 흐름을 이어가세요."}
          </p>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {signup && (
              <div className="flex flex-col gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  이름
                </label>
                <Input id="name" placeholder="이름을 입력하세요" className="h-11" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                이메일
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                className="h-11"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-medium">
                비밀번호
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  placeholder="8자 이상 입력하세요"
                  className="h-11 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "비밀번호 숨기기" : "비밀번호 표시"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {!signup && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" className="accent-primary" /> 로그인 상태
                  유지
                </label>
                <Link
                  href="#"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  비밀번호 찾기
                </Link>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              onClick={() => setDone(true)}
            >
              {done ? "완료되었습니다" : signup ? "계정 만들기" : "로그인"}
              <ArrowRight size={17} />
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" className="w-full">
            Google로 계속하기
          </Button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {signup ? "이미 계정이 있나요? " : "처음이신가요? "}
            <Link
              href={signup ? "/login" : "/signup"}
              className="font-medium text-primary hover:underline"
            >
              {signup ? "로그인" : "회원가입"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
