import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * 인증 라우트에 **계정 단위** 스로틀을 하나 더 얹는 가드.
 *
 * 전역 ThrottlerGuard는 출발 IP로 센다. 그것만으로는 봇넷/프록시 풀로 IP를 갈아가며
 * 계정 하나를 계속 두드리는 분산 무차별 대입을 막지 못한다(IP마다 새 버킷이라서).
 *
 * 그래서 이 가드는 추적 키를 **대상 이메일**로 잡는다. 전역 가드와 함께 돌면서
 * 서로 다른 두 버킷을 만든다:
 *   - IP 버킷(전역): 한 IP가 여러 계정을 훑는 공격을 막는다.
 *   - 계정 버킷(여기): 여러 IP가 한 계정을 훑는 공격을 막는다.
 * 두 버킷 모두 라우트의 @Throttle 설정을 그대로 쓴다.
 *
 * 키 접두 `acct:`는 이메일이 없는 요청에서 IP로 폴백할 때 전역 가드의 IP 키와
 * 같은 값이 되어 한 버킷을 공유(=실효 한도 절반)하는 걸 막는다.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = (req.body ?? {}) as { email?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email) return `acct:${email}`;
    // 이메일이 없는 요청(잘못된 바디)은 셀 계정이 없으므로 IP로 폴백한다.
    return `acct:${(req.ip as string) ?? 'unknown-ip'}`;
  }
}
