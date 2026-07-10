# Q-Idea API — 로컬 테스트 가이드

혼자서 로컬에서 독립적으로 API를 테스트하기 위한 완벽한 가이드입니다.

---

## 1. 환경 준비 (최초 1회만)

### 1.1 사전 요구사항
- Node v20+ (`node -v` 확인)
- Docker & Docker Desktop (`docker -v` 확인)
- npm v11+ (`npm -v` 확인)

### 1.2 프로젝트 초기화

```bash
cd C:\Users\kryuk\dev

# npm 패키지 설치 (이미 했으면 스킵)
npm install

# Prisma 클라이언트 생성
npx prisma generate
```

### 1.3 Docker 컨테이너 시작

```bash
# 기존 컨테이너 정리 (재실행 시)
docker rm -f qidea-mysql qidea-redis

# MySQL 8 시작
docker run -d --name qidea-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpw \
  -e MYSQL_DATABASE=qidea \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  -p 3306:3306 \
  mysql:8.0

# Redis 7 시작
docker run -d --name qidea-redis \
  -p 6379:6379 \
  redis:7

# 상태 확인
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

**MySQL이 준비되길 기다리기:**
```bash
# 3-5초 대기 후 실행
for i in {1..10}; do 
  if docker exec qidea-mysql mysqladmin ping -uuser -ppassword >/dev/null 2>&1; then
    echo "✓ MySQL 준비 완료"
    break
  fi
  echo "waiting mysql... $i"
  sleep 3
done
```

### 1.4 DB 스키마 동기화

```bash
# .env 파일이 있는지 확인
cat .env | grep DATABASE_URL

# Prisma 스키마를 DB에 반영
npx prisma db push --skip-generate
```

---

## 2. 서버 실행

### 2.1 개발 서버 시작

```bash
npm run start:dev
```

**예상 로그:**
```
[Nest] XXXX - 2026. 07. 05. 오전 XX:XX:XX LOG [RoutesResolver] AuthController {/api}:
[Nest] XXXX - 2026. 07. 05. 오전 XX:XX:XX LOG [RoutesResolver] CatalogController {/api}:
...
[Nest] XXXX - 2026. 07. 05. 오전 XX:XX:XX LOG [NestApplication] Nest application successfully started
```

**접속 확인:**
```bash
# 200이 나오면 정상
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs
```

### 2.2 API 문서 보기

브라우저에서 열기:
```
http://localhost:3000/api/docs
```

모든 엔드포인트와 DTO를 Swagger로 확인할 수 있습니다.

---

## 3. 기본 테스트 (curl 또는 Postman)

### 3.1 로그인 — JWT 토큰 받기

**curl:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@test.com",
    "nickname": "테스트유저",
    "roles": ["CREATOR"]
  }'
```

**응답:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "67ace7ab-a6af-4b73-93f2-30a332c4854c",
    "email": "creator@test.com",
    "nickname": "테스트유저",
    "roles": ["CREATOR"]
  }
}
```

**토큰 저장 (이후 사용할 환경변수):**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
# Windows PowerShell에서는:
# $env:TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 3.2 내 정보 확인

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/auth/me
```

**응답:**
```json
{
  "id": "67ace7ab-a6af-4b73-93f2-30a332c4854c",
  "email": "creator@test.com",
  "roles": ["CREATOR"]
}
```

---

## 4. 마스터 데이터 생성 (과목/단원/태그)

AI 생성, 문항 관리 등에 필요합니다.

### 4.1 과목 생성

```bash
curl -X POST http://localhost:3000/api/subjects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "수학",
    "description": "고등 수학"
  }'
```

응답에서 `id` 값 저장:
```bash
export SUBJECT_ID="받은_subject_id"
```

### 4.2 단원 생성

```bash
curl -X POST http://localhost:3000/api/units \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "'$SUBJECT_ID'",
    "name": "1단원: 함수",
    "description": "함수와 그래프"
  }'
```

응답에서 `id` 값 저장:
```bash
export UNIT_ID="받은_unit_id"
```

### 4.3 태그 생성

```bash
curl -X POST http://localhost:3000/api/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "기본",
    "description": "기본 개념"
  }'
```

---

## 5. 문항 관리 테스트

### 5.1 문항 생성 (평문)

```bash
curl -X POST http://localhost:3000/api/questions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryUnitId": "'$UNIT_ID'",
    "questionType": "SINGLE_CHOICE",
    "stem": {
      "type": "doc",
      "content": [
        {
          "type": "paragraph",
          "content": [{"type": "text", "text": "다음 중 함수의 정의역이 모든 실수인 것은?"}]
        }
      ]
    },
    "choices": [
      {
        "id": "c1",
        "isCorrect": true,
        "content": {
          "type": "doc",
          "content": [{"type": "paragraph", "content": [{"type": "text", "text": "f(x) = x + 1"}]}]
        }
      },
      {
        "id": "c2",
        "isCorrect": false,
        "content": {
          "type": "doc",
          "content": [{"type": "paragraph", "content": [{"type": "text", "text": "f(x) = 1/x"}]}]
        }
      }
    ],
    "difficulty": 1,
    "status": "DRAFT"
  }'
```

응답에서 `id` 값 저장:
```bash
export QUESTION_ID="받은_question_id"
```

### 5.2 문항 조회

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/questions/$QUESTION_ID
```

### 5.3 문항 목록 (필터/검색)

```bash
# 전체 조회
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions"

# 단원별 필터
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?unitIds=$UNIT_ID"

# 난이도별 필터
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?difficulty=1"

# 검색
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?search=함수"
```

---

## 6. AI 문항 생성 테스트

### 6.1 Gemini API 키 설정

`.env` 파일에서:
```
GEMINI_API_KEY=여기에_실제_API_키_붙여넣기
GEMINI_MODEL=gemini-2.5-flash
GEMINI_MAX_TOKENS=4096
```

[Google AI Studio](https://aistudio.google.com/apikey)에서 키 발급받기

저장 후, watch 모드가 자동 재시작될 때까지 대기 (2-3초).

### 6.2 AI 생성 요청

```bash
curl -X POST http://localhost:3000/api/ai-generations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unitId": "'$UNIT_ID'",
    "subjectId": "'$SUBJECT_ID'",
    "prompt": "이차함수의 최댓값과 최솟값을 구하는 문제를 3개 생성해주세요",
    "difficulty": 2,
    "questionCount": 3,
    "includePassage": false,
    "questionType": "SINGLE_CHOICE"
  }'
```

응답에서 `id` 값 저장:
```bash
export GENERATION_ID="받은_generation_id"
```

### 6.3 생성 상태 조회

```bash
# 상태: PENDING(처리 중) → COMPLETED(완료) → FAILED(실패)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/ai-generations/$GENERATION_ID
```

**폴링 (완료될 때까지 기다리기):**
```bash
for i in {1..20}; do
  STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" \
    http://localhost:3000/api/ai-generations/$GENERATION_ID \
    | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  echo "[$i/20] Status: $STATUS"
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ]; then
    break
  fi
  sleep 3
done
```

### 6.4 생성된 문항 확인

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?generationId=$GENERATION_ID"
```

---

## 7. 모의고사(세션) 테스트

### 7.1 세션 생성 (문항 조립)

```bash
curl -X POST http://localhost:3000/api/exam-sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "테스트 모의고사",
    "questionIds": ["'$QUESTION_ID'"],
    "timeLimit": 30
  }'
```

응답에서 `id` 값 저장:
```bash
export SESSION_ID="받은_session_id"
```

### 7.2 세션 조회 (진행 중 — 정답 마스킹)

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/exam-sessions/$SESSION_ID
```

**주의:** 진행 중(`IN_PROGRESS`) 상태에서는 정답이 숨겨집니다.

### 7.3 답안 제출

```bash
curl -X PUT http://localhost:3000/api/exam-sessions/questions/SESSIONQUESTION_ID/answer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "selectedChoiceIds": ["c1"]
  }'
```

(SESSIONQUESTION_ID는 세션 조회 응답에서 `exam_session_questions` 배열의 `id`)

### 7.4 세션 최종 제출

```bash
curl -X POST http://localhost:3000/api/exam-sessions/$SESSION_ID/submit \
  -H "Authorization: Bearer $TOKEN"
```

상태가 `SUBMITTED`로 변경되고 정답이 공개됩니다.

---

## 8. Postman 컬렉션으로 테스트 (권장)

curl보다 UI가 편하면 Postman을 쓰세요.

### 8.1 Postman 설정

1. **Postman 열기** → **Import** → **Raw text** 선택
2. 아래 JSON 붙여넣기 (또는 `POSTMAN_COLLECTION.json` 파일 만들어 import):

```json
{
  "info": {
    "name": "Q-Idea API",
    "description": "로컬 테스트 컬렉션"
  },
  "item": [
    {
      "name": "1. 로그인",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"creator@test.com\",\"roles\":[\"CREATOR\"]}"
        },
        "url": {"raw": "http://localhost:3000/api/auth/login", "protocol": "http", "host": ["localhost"], "port": ["3000"], "path": ["api", "auth", "login"]}
      }
    },
    {
      "name": "2. 내 정보",
      "request": {
        "method": "GET",
        "header": [{"key": "Authorization", "value": "Bearer {{token}}"}],
        "url": {"raw": "http://localhost:3000/api/auth/me", "protocol": "http", "host": ["localhost"], "port": ["3000"], "path": ["api", "auth", "me"]}
      }
    },
    {
      "name": "3. 문항 조회",
      "request": {
        "method": "GET",
        "header": [{"key": "Authorization", "value": "Bearer {{token}}"}],
        "url": {"raw": "http://localhost:3000/api/questions", "protocol": "http", "host": ["localhost"], "port": ["3000"], "path": ["api", "questions"]}
      }
    }
  ]
}
```

3. **Collections** → `Q-Idea API` → 요청 선택 → **Send**

### 8.2 Postman 환경변수 설정

1. **Environments** → **Create** → `Local Dev`
2. 변수 추가:
   - `token`: 로그인 응답의 `accessToken` 값 (자동 반영 가능)
   - `base_url`: `http://localhost:3000/api`
   - `subject_id`: 생성한 과목 ID
   - `unit_id`: 생성한 단원 ID

---

## 9. 트러블슈팅

### 9.1 "connection refused"

```bash
# Docker 컨테이너 상태 확인
docker ps

# MySQL이 없으면 다시 시작
docker run -d --name qidea-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpw \
  -e MYSQL_DATABASE=qidea \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  -p 3306:3306 mysql:8.0
```

### 9.2 "Prisma Client not generated"

```bash
npx prisma generate
```

### 9.3 "401 Unauthorized"

- `Authorization` 헤더 확인
- 형식: `Authorization: Bearer <token>` (Bearer 뒤에 공백 필수)
- 토큰이 만료되지 않았는지 확인 (기본 7일 유효)

### 9.4 "Cannot insert null into NOT NULL column"

DB 스키마와 요청 DTO가 안 맞음:
```bash
# 스키마 재동기화
npx prisma db push --skip-generate

# 또는 전체 초기화 (테스트 환경에서만!)
npx prisma migrate reset
```

### 9.5 AI 생성이 FAILED 상태

- `.env`에 `GEMINI_API_KEY`가 유효한지 확인
- Gemini API 할당량 확인 ([Google AI Studio](https://aistudio.google.com/))
- 서버 로그에서 상세 에러 확인:
  ```bash
  tail -50 <nest.log 파일>
  ```

---

## 10. 서버 종료 & 정리

### 10.1 개발 서버 중지

```bash
# 터미널에서 Ctrl+C 누르기
```

### 10.2 Docker 컨테이너 중지 (선택)

```bash
# 중지만 (데이터 유지)
docker stop qidea-mysql qidea-redis

# 삭제 (초기화)
docker rm -f qidea-mysql qidea-redis
```

---

## 11. 빠른 참고 명령어

| 목적 | 명령어 |
|---|---|
| 서버 시작 | `npm run start:dev` |
| Swagger 문서 | `http://localhost:3000/api/docs` |
| DB 상태 확인 | `docker exec qidea-mysql mysql -uuser -ppassword -e "SHOW TABLES;" qidea` |
| Redis 상태 확인 | `docker exec qidea-redis redis-cli PING` |
| 스키마 재동기화 | `npx prisma db push --skip-generate` |
| 데이터 초기화 | `npx prisma migrate reset` |
| Prisma Studio (GUI) | `npx prisma studio` |

---

## 12. 다음 단계

개발 테스트가 끝나고 배포할 때:
1. MySQL → AWS RDS / TiDB 등 클라우드 DB
2. Redis → ✅ 이미 Aiven으로 계획 중
3. API 서버 → Vercel / Railway / AWS EC2 등 배포 플랫폼
4. `.env` → CI/CD 파이프라인에서 관리

문제가 생기면 이 가이드의 해당 섹션을 참고하세요!
