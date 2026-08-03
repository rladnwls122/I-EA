/**
 * 부팅 시점 환경변수 검증.
 *
 * **왜 필요한가:** 예전에는 JWT_SECRET이 없으면 코드가 조용히
 * `'change-me-in-production'` fallback으로 부팅했다. 운영에서 env 하나가 빠지면
 * 앱은 정상 기동한 것처럼 보이지만, 공개된 문자열로 서명된 토큰을 누구나 위조할 수
 * 있는 상태가 된다(ADMIN 포함). 부팅이 성공하는 것보다 실패하는 게 안전하다.
 *
 * ConfigModule.forRoot({ validate })에 물려서 값이 잘못되면 프로세스가 뜨지 않는다.
 * 검증 대상은 "틀렸을 때 보안/무결성이 깨지는 것"으로 한정한다. 없어도 기능만
 * degrade 되는 값(GEMINI_API_KEY, AWS_*)은 기존대로 런타임 503 정책을 유지한다.
 */

/** 운영 환경에서 절대 허용하지 않는 JWT_SECRET 값들(과거 fallback·양식 기본값). */
const FORBIDDEN_JWT_SECRETS = new Set([
  'change-me',
  'change-me-in-production',
  'secret',
  'jwt-secret',
]);

/** JWT_SECRET 최소 길이. HS256 권장 엔트로피(256bit ≈ 32바이트)에 맞춘다. */
const MIN_JWT_SECRET_LENGTH = 32;

export interface ValidatedEnv extends Record<string, unknown> {
  NODE_ENV: string;
  JWT_SECRET: string;
}

/** 운영 배포인지 판정한다. 검증 강도를 여기서 가른다. */
export function isProduction(env: Record<string, unknown>): boolean {
  return String(env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/**
 * ConfigModule의 `validate` 훅. 반환값이 ConfigService의 소스가 되므로
 * 원본 env를 그대로 돌려준다(값을 소비하는 쪽 계약을 바꾸지 않는다).
 */
export function validateEnv(env: Record<string, unknown>): ValidatedEnv {
  const errors: string[] = [];
  const prod = isProduction(env);

  // --- JWT_SECRET: 토큰 위조 방지의 유일한 근거. 어떤 환경에서도 fallback 없음. ---
  const jwtSecret = String(env.JWT_SECRET ?? '').trim();
  if (!jwtSecret) {
    errors.push(
      'JWT_SECRET이 설정되지 않았습니다. 이 값이 없으면 토큰 서명을 신뢰할 수 없습니다. ' +
        '`openssl rand -base64 48` 등으로 생성해 .env에 넣으세요.',
    );
  } else if (FORBIDDEN_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
    errors.push(
      `JWT_SECRET이 공개된 예시 값("${jwtSecret}")입니다. 누구나 토큰을 위조할 수 있으니 반드시 교체하세요.`,
    );
  } else if (prod && jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    // 로컬은 짧은 시크릿을 허용해 개발 편의를 유지하고, 운영에서만 길이를 강제한다.
    errors.push(
      `JWT_SECRET이 너무 짧습니다(${jwtSecret.length}자). 운영에서는 ${MIN_JWT_SECRET_LENGTH}자 이상을 요구합니다.`,
    );
  }

  // --- DATABASE_URL: 없으면 어차피 Prisma가 죽지만, 메시지를 여기서 명확히 준다. ---
  if (!String(env.DATABASE_URL ?? '').trim()) {
    errors.push('DATABASE_URL이 설정되지 않았습니다.');
  }

  // --- ALLOWED_ORIGINS: 운영에서 비어 있으면 CORS가 모든 origin을 반사한다. ---
  if (prod && !String(env.ALLOWED_ORIGINS ?? '').trim()) {
    errors.push(
      'ALLOWED_ORIGINS가 설정되지 않았습니다. 운영에서는 허용 origin 목록을 ' +
        '반드시 명시해야 합니다(콤마 구분, 예: https://qidea.app,https://www.qidea.app).',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `환경변수 검증 실패 — 부팅을 중단합니다:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  return env as ValidatedEnv;
}
