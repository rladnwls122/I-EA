// Vercel 서버리스 진입점.
//
// nest build 결과(dist/)의 createApp을 재사용한다 — 부팅 설정(CORS/helmet/전역 파이프)은
// src/bootstrap.ts 한 곳이 정본이고, 여기서는 listen 대신 express 인스턴스를 핸들러로 넘긴다.
//
// 앱 인스턴스는 모듈 스코프에 캐싱한다. 람다 컨테이너가 재사용되는 동안 Nest 부팅과
// Prisma/Redis 커넥션을 다시 만들지 않는다(콜드 스타트 1회만 비용을 낸다).
const { createApp } = require('../dist/bootstrap');

let appPromise;

async function build() {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

module.exports = async (req, res) => {
  if (!appPromise) appPromise = build();
  const express = await appPromise;
  return express(req, res);
};
