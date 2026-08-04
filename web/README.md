# Q-Idea Web (`web/`)

IΔEA / Q-Idea 프론트엔드 — Next.js 14 App Router. 루트의 NestJS API와는 **코드를 공유하지 않고** HTTP로만 통신합니다.

상세한 작업 규칙(레이아웃 구조, Vega 클라이언트 전용 렌더링, ProseMirror 필드 취급,
목데이터와 실 API 혼재 상황)은 **[`WEB_GUIDE.md`](./WEB_GUIDE.md)** 를 보세요.
이 파일은 실행 방법만 다룹니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # next lint
npx tsc --noEmit # 타입 검사 (CI가 도는 것과 동일)
```

**포트 충돌 주의:** Next 개발 서버와 백엔드 API가 둘 다 기본 3000입니다.
한쪽을 옮겨서 띄우세요 — 예: `npm run dev -- -p 3001`.

## 환경 변수

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_API_URL` | 백엔드 API 베이스 URL. 미설정 시 `http://localhost:3000/api` |
| `NEXT_PUBLIC_S3_UPLOAD_ORIGIN` | 이미지 업로드용 S3 오리진. 미설정 시 업로드만 CSP에 막힘 |

두 값 모두 런타임 호출뿐 아니라 **`next.config.mjs`의 CSP `connect-src`를 빌드 시점에
구성**하는 데 쓰입니다. 빌드 환경에 넣지 않으면 브라우저가 해당 요청을 CSP로 차단합니다.

`NEXT_PUBLIC_S3_UPLOAD_ORIGIN`은 이미지 업로드가 우리 API가 아니라 **S3로 직접**
multipart POST 하기 때문에 따로 필요합니다. presign 응답의 `url` 오리진과 같은 값이어야
하고(예: `https://<버킷>.s3.<리전>.amazonaws.com`), 이미지 표시용 공개 URL
(`AWS_S3_PUBLIC_BASE_URL`, CloudFront일 수 있음)과는 보통 다릅니다.
`img-src`는 `https:` 전체를 허용하므로 **표시는 되는데 업로드만 막히는** 모양으로
증상이 나타납니다.

프론트가 쓰는 포트는 백엔드의 `ALLOWED_ORIGINS`에도 들어가 있어야 CORS가 통과합니다.

## 배포

Vercel (`https://i-ea.vercel.app`). 프리뷰 배포를 API가 받아주려면 백엔드에
`VERCEL_PREVIEW_PREFIX`로 프로젝트 접두를 지정해야 합니다 — 와일드카드
`*.vercel.app` 허용은 제거됐습니다(제3자가 배포한 vercel 사이트까지 열렸던 문제).
