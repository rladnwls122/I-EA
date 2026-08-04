/**
 * 보안 헤더. 프런트가 서빙하는 모든 응답에 붙는다.
 *
 * CSP를 굳이 넣는 이유: 인증 토큰을 localStorage에 두고 있어서, XSS가 한 번이라도
 * 성립하면 토큰이 그대로 털린다. CSP는 그 폭발 반경을 줄이는 두 번째 방어선이다.
 * (Next는 인라인 부트스트랩 스크립트와 dev HMR의 eval을 쓰므로 'unsafe-inline'/
 *  'unsafe-eval'을 전부 없앨 수는 없다. 그래도 외부 스크립트 출처를 막는 것만으로
 *  값어치가 있다 — 탈취 스크립트를 남의 도메인에서 불러오는 흔한 경로가 닫힌다.)
 *
 * connect-src는 API 오리진을 알아야 하므로 NEXT_PUBLIC_API_URL을 읽어 넣는다
 * (lib/api.ts가 쓰는 것과 같은 env).
 */
const apiOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

/**
 * 이미지 업로드는 우리 API가 아니라 **S3로 직접** multipart POST 한다(presigned POST).
 * 그래서 그 오리진이 connect-src에 없으면 CSP가 업로드를 막는다 — 콘솔에만 찍히고
 * 화면에는 원인 없는 실패로 보인다. img-src는 `https:` 전체를 허용하므로 표시는 되고
 * 업로드만 막히는, 특히 헷갈리는 실패 모양이 된다.
 *
 * 값은 presign 응답의 `url` 오리진과 같아야 한다
 * (예: https://<버킷>.s3.<리전>.amazonaws.com — CloudFront 공개 URL과는 보통 다르다).
 * 비워두면 업로드 기능만 못 쓰고 나머지는 정상 동작한다.
 */
const s3UploadOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_S3_UPLOAD_ORIGIN;
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
})();

const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Tailwind/컴포넌트가 인라인 style 속성을 쓴다.
  "style-src 'self' 'unsafe-inline'",
  // S3/CloudFront 업로드 이미지가 임의 호스트일 수 있어 https 전체를 허용한다.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}${s3UploadOrigin ? ` ${s3UploadOrigin}` : ''}${isDev ? ' ws: http://localhost:*' : ''}`,
  "frame-ancestors 'none'", // 클릭재킹 차단
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 응답 헤더에 Next 버전을 광고하지 않는다.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  webpack: (config) => {
    // vega-canvas optionally requires the native `canvas` package for
    // node-side rendering; we only render Vega client-side (ssr: false),
    // so stub it out to avoid a webpack module-not-found build failure.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
