"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * 미인증 라우트 가드.
 * 공개 경로 외에는 토큰이 없으면 즉시 /login으로 보낸다 — 페이지가 렌더되기 전에
 * 막으므로 보호 페이지의 API 호출 자체가 일어나지 않아 콘솔 401이 찍히지 않는다.
 * 원래 있던 주소는 callbackUrl 쿼리로 들고 가 로그인 후 복귀한다(AuthForm 참고).
 *
 * 토큰은 localStorage에 있어 Next 미들웨어(서버)로는 못 읽는다 — 클라이언트 가드로 구현.
 */
const PUBLIC_PATHS = ["/", "/intro", "/login", "/signup"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // 하이드레이션 전에는 판별 불가 — 검사 끝날 때까지 보호 페이지를 렌더하지 않는다.
  const [status, setStatus] = useState<"checking" | "allowed">("checking");

  useEffect(() => {
    if (isPublic(pathname)) {
      setStatus("allowed");
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (token) {
      setStatus("allowed");
      return;
    }
    const callbackUrl = encodeURIComponent(pathname + window.location.search);
    router.replace(`/login?callbackUrl=${callbackUrl}`);
    // status는 checking 유지 — 리다이렉트 중 보호 콘텐츠 노출 방지.
  }, [pathname, router]);

  if (status === "checking" && !isPublic(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        확인 중…
      </div>
    );
  }
  return <>{children}</>;
}
