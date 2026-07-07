# 백엔드 라이브 검증 로그 — 2026-07-06 (TiDB 연결)

백엔드 `node dist/main.js` 로컬 구동, TiDB Cloud + 실제 seed 데이터 대상. 포트 3000.

## 부트
- `.env`: DATABASE_URL=TiDB(`gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/Q_DB`), REDIS=Aiven, GEMINI=gemini-2.5-flash.
- `npx prisma db push` → "The database is already in sync with the Prisma schema." (테이블 18개 존재)
- `npm run db:seed` → `seed done` (creator@demo.io, consumer@demo.io, 수학 과목, 함수/기하 단원, PUBLISHED 문항 5).

## 엔드포인트 테스트

### POST /api/auth/login  → 200
```
req: {"email":"creator@demo.io","roles":["CREATOR","CONSUMER"]}
res: {"accessToken":"eyJ...","user":{"id":"81ff1ff5-...","email":"creator@demo.io","nickname":"데모출제자","roles":["CREATOR","CONSUMER"]}}
```

### GET /api/questions?status=PUBLISHED  → 200
```
{"items":[{"id":"seed-q-4","questionType":"SINGLE_CHOICE","difficulty":5,"status":"PUBLISHED","primaryUnitId":"seed-unit-func",...},{"id":"seed-q-3",...}], ...}
```
seed 문항 정상 반환.

### GET /api/me/wrong-notes  → 200
```
{"byUnit":[],"byType":[],"wrongQuestions":[]}
```
(제출 세션 없어 빈 집계 — Task 1 로직 라이브 정상.)

### GET /api/me/exam-sessions  → 200
```
[]
```

### GET /api/docs-json  → 200
Swagger JSON 정상(orval 입력원으로 사용 가능: `http://localhost:3000/api/docs-json`).

## 결론
DB(TiDB)·인증·문항·`/me`·Swagger 전부 라이브 정상. Redis 의존(AI 생성)만 미해결.
