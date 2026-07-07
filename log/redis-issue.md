# Aiven Redis 연결 이슈 진단 — 2026-07-06

## 증상
백엔드 부트 시 BullMQ(ioredis)가 Aiven에 연결 시도 → 반복 에러:
```
ParserError: Protocol error, got "H" as reply type byte. Please report this.
    at handleError (node_modules/redis-parser/lib/parser.js:190)
```
에러 buffer 디코드 결과:
```
HTTP/1.1 400 Bad request
Content-length: 90
Cache-Control: no-cache
Connection: close
Content-Type: text/html

<html><body><h1>400 Bad request</h1>
Your browser sent an invalid request.
</body></html>
```

## 진단
- `got "H"` = 서버가 RESP(Redis 프로토콜) 대신 **HTTP 응답**을 반환.
- 단독 ioredis 테스트(`tls:{}` 명시)로도 동일 → 앱 설정 문제 아님.
- 즉 준 접속정보 `os-163812ac-...aivencloud.com:26252` 의 해당 포트가 **Redis/Valkey 프로토콜을 말하지 않음**(HTTP 서비스이거나 포트 불일치).

## 설정은 정상 (참고)
- `.env`: `REDIS_HOST`, `REDIS_PORT=26252`, `REDIS_PASSWORD`, `REDIS_TLS=true` 세팅됨.
- `src/app.module.ts`: `...(REDIS_TLS==='true' ? { tls:{} } : {})` — TLS 분기 정상, dist 반영 확인됨.

## 해결 (내일 할 일)
1. Aiven 콘솔 → 해당 서비스가 **Aiven for Caching(Valkey/Redis)** 인지 확인.
2. 서비스 Overview의 **Service URI**(`rediss://default:<pw>@<host>:<port>`) 재확인 — host/port가 위와 일치하는지.
   - Aiven Redis 기본 user는 보통 `default`. 필요 시 `.env`에 `REDIS_USERNAME=default` 추가 후 app.module 반영.
3. 올바른 host:port로 `.env` 교정 → 백엔드 재구동 → BullMQ 연결 OK 확인.
4. 그 후 AI 문항 생성(POST /api/ai-generations → 큐 → Gemini) 라이브 테스트.

## 영향 범위
- **BullMQ 큐 = AI 문항 생성 파이프라인만** 영향.
- 정상 동작(무관): auth, questions, exam-sessions, me, reviews, comments, memos, variants, catalog, 그리고 프론트 AI **시각화**(Next Route Handler가 Gemini 직접 호출 — Redis 불필요).
