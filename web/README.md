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

`NEXT_PUBLIC_API_URL`은 런타임 호출뿐 아니라 **`next.config.mjs`의 CSP `connect-src`를
빌드 시점에 구성**하는 데도 쓰입니다. API 오리진을 바꿀 때 이 값을 빌드 환경에
넣지 않으면 브라우저가 API 요청을 CSP로 차단합니다.

프론트가 쓰는 포트는 백엔드의 `ALLOWED_ORIGINS`에도 들어가 있어야 CORS가 통과합니다.

## 배포

Vercel (`https://i-ea.vercel.app`). 프리뷰 배포를 API가 받아주려면 백엔드에
`VERCEL_PREVIEW_PREFIX`로 프로젝트 접두를 지정해야 합니다 — 와일드카드
`*.vercel.app` 허용은 제거됐습니다(제3자가 배포한 vercel 사이트까지 열렸던 문제).
