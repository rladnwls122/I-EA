import { Prisma } from '@prisma/client';

/**
 * 인증/질의 실패가 아니라 **인프라(커넥션) 장애**로 봐야 할 Prisma 오류인지 판정.
 *
 * TiDB Serverless는 유휴 커넥션을 끊는다. 그 뒤 첫 요청은 "Server has closed the
 * connection"으로 실패하는데, 이건 우리 코드의 버그도 사용자의 잘못도 아니고 그냥
 * 다시 시도하면 되는 상황이다. 그런데 어디서 잡히느냐에 따라 전혀 다른 얼굴로
 * 나갔다 — 인증 경로에서는 401(로그인 실패), 그 밖에서는 500(서버 버그).
 *
 * 판정을 한곳에 두고 두 자리가 같이 읽게 한다. 두 벌로 갈라지면 한쪽만 새 오류
 * 코드를 배우게 되고, 그때부터 같은 장애가 경로에 따라 다른 상태 코드로 나간다.
 */
export function isPrismaConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientRustPanicError) return true;
  if (err instanceof Prisma.PrismaClientUnknownRequestError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P1001 서버 도달 불가, P1017 서버가 커넥션을 닫음.
    return err.code === 'P1001' || err.code === 'P1017';
  }
  return false;
}
