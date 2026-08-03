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
# .env 파일이 있는지 확인 (없으면 cp .env.example .env 후 값 채우기)
cat .env | grep DATABASE_URL

# Prisma 스키마를 DB에 반영
npx prisma db push --skip-generate
```

> 필요한 환경변수의 전체 목록과 기본값은 `.env.example`에 주석과 함께 정리돼 있습니다.
> `JWT_SECRET`과 `DATABASE_URL`은 없으면 **서버가 부팅되지 않습니다**(§9.3-1 참고).

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

> Swagger는 **개발 환경에서만 기본으로 켜집니다.** 운영(`NODE_ENV=production`)에서는
> API 표면 전체를 무인증 공개하지 않으려고 꺼져 있고, 필요하면 `ENABLE_SWAGGER=true`로
> 명시적으로 켤 수 있습니다.

---

## 3. 기본 테스트 (curl 또는 Postman)

### 3.1 회원가입 + 로그인 — JWT 토큰 받기

인증은 **이메일 + 비밀번호**(bcrypt)입니다. 최초 1회 가입 후 로그인하세요.

> **레이트리밋이 걸려 있습니다** — 로그인 5분 10회, 회원가입 1시간 5회(출발 IP 기준과
> 대상 이메일 기준을 각각 셈). 반복 테스트 중 429가 나오면 잠시 기다리거나 다른
> 이메일을 쓰세요. 전역 기본값은 1분 120회입니다.

**가입(curl):**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@test.com",
    "password": "test1234!",
    "nickname": "테스트유저"
  }'
```

**로그인(curl):**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "creator@test.com",
    "password": "test1234!"
  }'
```

**응답(가입/로그인 공통):**
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
  "nickname": "테스트유저",
  "xp": 0,
  "level": 1,
  "title": "새내기",
  "xpToNextTier": 100,
  "streak": { "current": 0, "longest": 0, "boostActive": false, "boostUntil": null },
  "roles": ["CONSUMER"]
}
```

가입 직후 부여되는 기본 권한은 `CONSUMER`입니다. `CREATOR`/`ADMIN`은 DB에서 넣거나
시드로 만들어야 합니다.

### 3.3 전체 로그아웃 (토큰 무효화)

토큰을 버리는 것만으로는 그 토큰이 만료(기본 7일) 전까지 계속 유효합니다.
서버에서 실제로 끊으려면:

```bash
curl -X POST http://localhost:3000/api/auth/logout-all \
  -H "Authorization: Bearer $TOKEN"
```

`users.token_version`이 올라가고, 그 전에 발급된 토큰은 전부 401이 됩니다
(호출에 쓴 토큰 자신도 포함). 유출이 의심될 때 쓰세요.

---

## 4. 마스터 데이터 생성 (과목/태그)

AI 생성, 문항 관리 등에 필요합니다.

> **단원(unit) 트리는 없습니다.** 분류는 `subjects` 한 테이블이 3단(시험 → 대분류 →
> 소분류)을 모두 담고, 문항은 소분류를 직접 가리킵니다(`questions.subjectId`).
> `POST /api/units` 같은 엔드포인트는 존재하지 않습니다.

> 아래 두 엔드포인트는 **ADMIN 권한**이 필요합니다(`@Roles(ADMIN)`).
> 일반 계정으로 호출하면 403입니다 — 시드 데이터(`npm run db:seed`)를 쓰거나
> DB에서 해당 계정에 ADMIN 역할을 넣어야 합니다.

### 4.1 과목(소분류) 생성

```bash
curl -X POST http://localhost:3000/api/subjects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examType": "수능",
    "examCategory": "수학",
    "name": "미적분",
    "sortOrder": 0
  }'
```

응답에서 `id` 값 저장:
```bash
export SUBJECT_ID="받은_subject_id"
```

### 4.2 태그 생성

`category`는 필수입니다(`description`이라는 필드는 없습니다).

```bash
curl -X POST http://localhost:3000/api/tags \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "함수",
    "category": "개념"
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
    "subjectId": "'$SUBJECT_ID'",
    "questionType": "객관식",
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
    "difficulty": 1
  }'
```

> `questionType`은 enum이 아니라 VARCHAR이고 허용값은 `"객관식"` / `"주관식"` 두 개뿐입니다
> (`src/common/constants/question.ts`). `SINGLE_CHOICE` 같은 영문 값은 400입니다.
>
> `status`는 요청 바디로 받지 않습니다 — 생성은 항상 `DRAFT`로 시작하고 발행은 별도
> 엔드포인트로 합니다. 전역 ValidationPipe가 `forbidNonWhitelisted`라, DTO에 없는 필드를
> 하나라도 넣으면 요청 전체가 400으로 거부됩니다.

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

이 라우트는 `@Public()`이라 토큰 없이도 됩니다(아래는 붙여둔 예시).

```bash
# 전체 조회
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions"

# 소분류별 필터 (subjectIds는 콤마 구분 복수도 가능)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?subjectId=$SUBJECT_ID"

# 난이도별 필터
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?difficulty=1"

# 키워드 검색 — 파라미터명은 q (search 아님)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?q=함수"

# 정렬 — latest | popular
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/questions?sort=popular"
```

지원하는 쿼리 파라미터는 `subjectId` / `subjectIds` / `status` / `questionType` /
`difficulty` / `q` / `sort` / `tagIds` 입니다(`QueryQuestionDto`).

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
    "subjectId": "'$SUBJECT_ID'",
    "prompt": "이차함수의 최댓값과 최솟값을 구하는 문제를 3개 생성해주세요",
    "difficulty": 2,
    "questionCount": 3,
    "includePassage": false,
    "questionType": "객관식"
  }'
```

선택 필드: `ox`(O/X 2지선다), `choiceCount`(2~8), `language`(`ko`|`en`|`en-passage-ko-stem`),
`templateId`(시험별 출제 형식 템플릿 — 목록은 `GET /api/ai-generations/templates?examType=수능`).

> **레이트리밋:** 이 엔드포인트는 시간당 30건입니다(잡 하나가 Gemini 호출 비용을 유발).
> 초과하면 429가 납니다.
>
> 듣기(오디오) 소분류는 생성 대상이 아니라 400으로 거부됩니다.

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

`GET /ai-generations/:id` 응답의 `questions[].id`가 곧 생성된 문항 ID입니다
(문항 목록에는 `generationId` 필터가 없습니다).

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/ai-generations/$GENERATION_ID
```

> 생성 작업은 **요청한 본인만** 조회할 수 있습니다. 남의 작업 ID를 넣으면 404입니다.

---

## 7. 모의고사(세션) 테스트

### 7.1 세션 생성 (문항 조립)

```bash
curl -X POST http://localhost:3000/api/exam-sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "questionIds": ["'$QUESTION_ID'"]
  }'
```

세션은 두 가지 조립 모드가 있습니다(`title`·`timeLimit` 같은 필드는 없습니다).

- **플레이리스트 모드** — 위처럼 `questionIds`를 직접 준다. 그 문항들이 그대로 담긴다.
- **필터 모드** — `subjectId` + `questionCount`(+ `minDifficulty`/`maxDifficulty`/
  `questionTypes`/`tagIds`)를 주면 조건에 맞는 PUBLISHED 문항에서 무작위로 뽑는다.

```bash
# 필터 모드 예시
curl -X POST http://localhost:3000/api/exam-sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subjectId": "'$SUBJECT_ID'",
    "questionCount": 5,
    "minDifficulty": 1,
    "maxDifficulty": 3
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

**주의:** 진행 중(`IN_PROGRESS`) 상태에서는 정답이 숨겨집니다 — 선지의 `isCorrect`,
주관식 정답(`correctAnswerText`), 해설이 모두 빠집니다.

이 마스킹은 **문제은행 쪽에서도 함께** 걸립니다. 진행 중 세션에 들어 있는 문항은
`GET /api/questions/:id`와 `GET /api/questions/:id/stats`로 우회 조회해도 정답이
나오지 않습니다(응답에 `maskedForActiveSession: true`, stats의 `isCorrect`는 `null`).
세션을 제출하면 원래대로 전부 보입니다.

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
          "raw": "{\"email\":\"creator@test.com\",\"password\":\"test1234!\"}"
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
   - `subject_id`: 생성한 소분류(과목) ID
   - `question_id`: 생성한 문항 ID

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
- "만료된 세션입니다"가 나오면 그 사이 `POST /auth/logout-all`이 호출됐거나
  `token_version`이 올라간 것 — 다시 로그인해 새 토큰을 받으세요.
- `JWT_SECRET`을 바꾸고 서버를 재시작했다면 기존 토큰은 전부 무효입니다.

### 9.3-1 서버가 부팅되지 않고 "환경변수 검증 실패"

`JWT_SECRET`·`DATABASE_URL`이 비었거나, `JWT_SECRET`이 `change-me` 같은 예시 값입니다.
예전에는 값이 없으면 코드가 조용히 기본 시크릿으로 떴지만(토큰 위조 가능),
지금은 부팅을 중단합니다. 메시지에 빠진 변수가 전부 나열됩니다.

```bash
# 쓸 만한 시크릿 생성
openssl rand -base64 48
```

`NODE_ENV=production`이면 `ALLOWED_ORIGINS`도 필수이고 `JWT_SECRET`은 32자 이상이어야 합니다.

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
