import { ThrottlerOptions } from '@nestjs/throttler';

/**
 * 레이트리밋 프로파일.
 *
 * 예전에는 튜터·출제 채팅 두 곳만 Redis로 직접 제한했고, `/auth/login`을 포함한
 * 나머지는 전부 무제한이었다. 즉 비밀번호 무차별 대입에 아무 비용이 없었다.
 * 여기서 전역 기본선을 깔고, 비싸거나 위험한 라우트만 @Throttle로 조인다.
 *
 * 저장소는 기본 in-memory다. 인스턴스가 여러 개면 카운터가 인스턴스별로 갈리므로
 * 실효 한도가 (인스턴스 수)배가 된다. 단일 인스턴스 배포(Railway) 기준으로는 충분하고,
 * 스케일아웃 시 @nest-lab/throttler-storage-redis로 교체하면 된다
 * (Redis는 이미 RedisModule로 붙어 있다).
 */

/** 전역 기본: IP당 1분 120요청. 정상 사용(문제 목록·상세 폴링)에는 걸리지 않는 선. */
export const DEFAULT_THROTTLE: ThrottlerOptions = {
  name: 'default',
  ttl: 60_000,
  limit: 120,
};

/**
 * 로그인: 5분에 10회. IP+이메일 조합으로 센다(AuthThrottlerGuard.getTracker).
 * 온라인 무차별 대입을 사실상 불가능하게 만들면서, 오타 몇 번은 통과시킨다.
 */
export const LOGIN_THROTTLE = { ttl: 300_000, limit: 10 } as const;

/** 회원가입: 1시간에 5회. 대량 계정 생성(스팸·경제 어뷰징 다중계정) 억제. */
export const REGISTER_THROTTLE = { ttl: 3_600_000, limit: 5 } as const;

/**
 * AI 문항 생성: 1시간에 30건. 잡 하나가 Gemini 호출을 유발하므로 직접적인 비용이다.
 * 채팅(tutor/authoring)은 이미 Redis 고정창 제한이 별도로 걸려 있다.
 */
export const AI_GENERATION_THROTTLE = { ttl: 3_600_000, limit: 30 } as const;
