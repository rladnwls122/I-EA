import { createApp } from './bootstrap';

/** 로컬/컨테이너 실행 진입점. Vercel 서버리스는 api/index.js가 대신 진입한다. */
async function main(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.PORT ?? 3000));
}

void main();
