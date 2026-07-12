"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { login, register } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signup = mode === "signup";

  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const res = signup
        ? await register(email, password, name)
        : await login(email, password);
      localStorage.setItem("token", res.accessToken);
      // 가드가 붙여준 callbackUrl이 있으면 원래 하던 페이지로 복귀.
      // 내부 경로("/...")만 허용 — 외부 주소로 튕기는 open redirect 방지.
      // (useSearchParams는 프리렌더 시 Suspense 경계를 요구하므로 제출 시점에 직접 읽는다)
      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      const safeCallback =
        callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
          ? callbackUrl
          : "/";
      router.push(safeCallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    // focus-width 단일 컬럼 — 인증은 몰입 플로우, 본문 400px에 시선을 모은다.
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-block text-xl font-semibold tracking-tight"
          >
            I<span className="mx-0.5 text-primary">Δ</span>EA
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            더 나은 질문이 <span className="text-primary">더 나은 답을</span>{" "}
            만듭니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {signup ? "학습을 시작해볼까요?" : "다시 만나 반가워요."}
            </CardTitle>
            <CardDescription>
              {signup
                ? "필요한 정보만 입력하면 바로 시작할 수 있어요."
                : "나만의 학습 흐름을 이어가세요."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
            {signup && (
              <div className="flex flex-col gap-2">
                <label htmlFor="name" className="text-sm font-medium">
                  이름
                </label>
                <Input
                  id="name"
                  placeholder="이름을 입력하세요"
                  className="h-11"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "비밀번호 숨기기" : "비밀번호 표시"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors duration-150 ease-swift hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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

            {error && (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isPending}>
              {isPending ? "처리 중..." : signup ? "계정 만들기" : "로그인"}
              <ArrowRight size={17} />
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full"
            disabled
            title="이메일/비밀번호 로그인만 지원합니다"
          >
            Google로 계속하기 (준비 중)
          </Button>
          </CardContent>
        </Card>

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
    </main>
  );
}
