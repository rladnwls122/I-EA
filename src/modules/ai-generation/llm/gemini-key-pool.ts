/**
 * Gemini API 키 로테이션 게이트웨이.
 *
 * 여러 개의 API 키를 라운드-로빈으로 돌려쓰다가, 어떤 키가 한도(429 RESOURCE_EXHAUSTED)나
 * 쿼터/권한(403)에 걸리면 그 키만 일정 시간 쿨다운시키고 나머지 정상 키로 회전한다.
 * 한 키가 죽어도 다른 키가 살아 있으면 사용자 요청은 성공한다.
 *
 * NestJS에 의존하지 않는다 — 단위 테스트에서 시계(now)를 주입해 쿨다운 만료를 결정적으로 검증한다.
 * GeminiLlmService가 이 풀을 하나 들고, 호출마다 acquire()로 키를 빌려 쓰고
 * 실패하면 penalize()로 회전시킨다.
 */

export interface KeyPoolOptions {
  /** 429(rate limit) 시 쿨다운(ms). 분 단위 창이라 짧게 잡아도 회복된다. 기본 60초. */
  cooldownMs?: number;
  /** 403(quota/permission) 시 쿨다운(ms). 일 단위이거나 키 자체 문제일 수 있어 길게. 기본 15분. */
  cooldownQuotaMs?: number;
  /** 테스트용 시계 주입. 기본 Date.now. */
  now?: () => number;
}

export class GeminiKeyPool {
  private readonly keys: string[];
  /** key → 이 시각(ms)까지 쿨다운. 없으면 가용. */
  private readonly cooldownUntil = new Map<string, number>();
  /** 라운드-로빈 커서. */
  private cursor = 0;
  private readonly cooldownMs: number;
  private readonly cooldownQuotaMs: number;
  private readonly now: () => number;

  constructor(rawKeys: string[], opts: KeyPoolOptions = {}) {
    // 공백 제거 + 빈 값 제거 + 중복 제거(입력 순서 보존).
    const seen = new Set<string>();
    this.keys = [];
    for (const raw of rawKeys) {
      const k = (raw ?? '').trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        this.keys.push(k);
      }
    }
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.cooldownQuotaMs = opts.cooldownQuotaMs ?? 900_000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 풀에 등록된 전체 키 수(쿨다운 포함). */
  get size(): number {
    return this.keys.length;
  }

  /** 키가 하나라도 있는지(설정 여부 판정용). */
  get hasKeys(): boolean {
    return this.keys.length > 0;
  }

  /** 지금 당장 쓸 수 있는(쿨다운 아닌) 키 수. */
  availableCount(): number {
    const t = this.now();
    return this.keys.filter((k) => (this.cooldownUntil.get(k) ?? 0) <= t).length;
  }

  /**
   * 라운드-로빈으로 다음 가용 키를 빌려준다. 모든 키가 쿨다운이면 null.
   * 커서를 반환한 키 다음으로 전진시켜 다음 호출이 다른 키를 잡게 한다.
   */
  acquire(): string | null {
    const n = this.keys.length;
    if (n === 0) return null;
    const t = this.now();
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const key = this.keys[idx];
      if ((this.cooldownUntil.get(key) ?? 0) <= t) {
        this.cursor = (idx + 1) % n;
        return key;
      }
    }
    return null;
  }

  /**
   * 실패한 키를 쿨다운시킨다. 429는 짧게, 403은 길게.
   * (그 외 status를 넘겨도 429와 동일하게 취급한다 — 호출부는 429/403만 넘긴다.)
   */
  penalize(key: string, status: number): void {
    const ms = status === 403 ? this.cooldownQuotaMs : this.cooldownMs;
    this.cooldownUntil.set(key, this.now() + ms);
  }
}
