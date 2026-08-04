# Architecture - IΔEA (Q-Idea)

이 문서는 **IΔEA (Q-Idea)** 프로젝트의 아키텍처 설계, 기술적 결정 사항 및 프로젝트 구조를 설명합니다. 본 프로젝트는 AI 기반의 문항 출제 및 모의고사 응시 플랫폼으로, 높은 신뢰성과 확장성을 목표로 설계되었습니다.

---

## 1. 프로젝트 구조 (Directory Structure)

본 프로젝트는 백엔드(NestJS)와 프런트엔드(Next.js)가 공존하는 구조로 설계되었습니다.

```text
.
├── src/                # Backend (NestJS 11)
│   ├── modules/        # 도메인별 비즈니스 로직 모듈
│   │   ├── ai-generation/   # AI 문항 생성 로직 및 LLM 연동
│   │   ├── exam-sessions/   # 시험 응시, 스냅샷, 채점 로직
│   │   ├── questions/       # 문항 관리 및 통계
│   │   └── ...              # 기타 도메인 모듈 (auth, catalog, me 등)
│   ├── common/         # 공통 데코레이터, DTO, 유틸리티
│   ├── prisma/         # Prisma 서비스 및 데이터베이스 연결 설정
│   └── redis/          # Redis 및 BullMQ 설정
├── web/                # Frontend (Next.js 14 App Router)
│   ├── app/            # 페이지 라우팅 및 레이아웃
│   │   ├── studio/     # 문항 출제 스튜디오
│   │   ├── workbook/   # 문제집 및 응시 화면
│   │   └── notes/      # 오답노트 및 학습 분석
│   ├── components/     # 재사용 가능한 UI 컴포넌트 (shadcn/ui)
│   └── lib/            # 상태 관리(Zustand), API 클라이언트, 유틸리티
├── prisma/             # 데이터베이스 스키마 (schema.prisma)
└── docs/               # 설계 문서 및 API 명세
```

---

## 2. 기술 스택 (Tech Stack)

| 구분 | 기술 | 상세 |
| --- | --- | --- |
| **Backend** | NestJS 11 | REST API 서버 프레임워크 |
| **Frontend** | Next.js 14 | App Router 기반 웹 애플리케이션 |
| **Database** | MySQL | Prisma ORM을 통한 데이터 관리 |
| **Cache/Queue** | Redis | BullMQ를 이용한 비동기 작업 처리 |
| **AI Provider** | Google Gemini | 문항 생성 및 AI 튜터 서비스 |
| **Storage** | AWS S3 | Presigned POST으로 클라이언트 직접 업로드 |

---

## 3. 핵심 설계 원칙 (Core Principles)

### 3.1 비동기 AI 문항 생성 (BullMQ)
AI를 통한 문항 생성은 시간이 오래 걸리는 작업이므로 **비동기 큐 방식**을 채택했습니다.
- `POST /ai-generations` 호출 시 `PENDING` 상태의 레코드를 생성하고 BullMQ에 작업을 할당합니다.
- `AiGenerationProcessor`에서 실제 LLM 호출 및 데이터 처리를 수행하며, 완료 시 트랜잭션을 통해 결과를 저장합니다.

### 3.2 리치 텍스트 데이터 모델 (ProseMirror)
모든 문항 데이터(지문, 발문, 선지 등)는 **Tiptap/ProseMirror JSON** 포맷으로 저장됩니다.
- LLM은 평문(Plain Text)만을 출력하며, 서버의 `prosemirror.util.ts`가 이를 구조화된 JSON으로 변환합니다.
- 이를 통해 데이터 저장 포맷의 일관성을 유지하고, 프런트엔드에서 풍부한 에디팅 기능을 제공할 수 있습니다.

### 3.3 문항 스냅샷 기반 응시 시스템
시험 응시 시점의 문항 내용을 `exam_session_questions.snapshot` 필드에 보존합니다.
- 원본 문항이 나중에 수정되더라도 이미 응시한 시험의 채점 근거와 내용은 변하지 않습니다.
- 보안을 위해 진행 중인 세션에서는 정답 및 해설 정보를 마스킹하여 제공합니다.

---

## 4. 데이터베이스 모델 (Database Model)

주요 엔티티와 관계는 다음과 같습니다:

- **User**: 사용자 정보 및 학습 지표(XP, 스트릭) 관리.
- **Subject**: 시험-대분류-소분류로 이어지는 3단 분류 체계.
- **Question**: 문항 정보. 객관식/주관식 타입을 지원하며 정답률 캐시를 포함합니다.
- **Passage**: 여러 문항이 공유할 수 있는 지문 데이터.
- **ExamSession**: 사용자의 응시 기록 및 채점 데이터.
- **Annotation**: 오답노트 시스템을 위한 텍스트 앵커 기반 주석.

---

## 5. 보안 및 인증 (Security)

- **Global Auth Guard**: 모든 API 경로는 기본적으로 `JwtAuthGuard`에 의해 보호됩니다. 공개가 필요한 경로에만 `@Public()` 데코레이터를 사용합니다.
- **Role-based Access Control (RBAC)**: `CREATOR`, `ADMIN` 등 역할에 따른 권한 제어를 수행합니다.
- **Presigned Upload**: 미디어 파일은 서버를 거치지 않고 클라이언트에서 스토리지로 직접 업로드하여 서버 부하를 최소화합니다. presigned **POST**(PUT 아님)를 써서 Content-Type과 크기를 policy로 서버가 강제하고, 등록되는 URL은 우리 버킷 접두인지 검증합니다.
- **부팅 시 환경변수 검증** (`src/config/env.validation.ts`): `JWT_SECRET` 등 없으면 보안이 깨지는 값을 부팅 시점에 확인하고, 미설정이면 프로세스를 띄우지 않습니다. 코드 어디에도 시크릿 fallback 기본값은 없습니다.
- **토큰 무효화**: JWT에 발급 시점 `users.token_version`(`tv` 클레임)을 심고 매 요청 대조합니다. `POST /api/auth/logout-all`이 이 값을 올려 발급된 토큰을 만료 전이라도 전부 끊습니다.
- **레이트리밋**: 전역 IP 기준(1분 120회) 위에, 로그인·회원가입은 IP 버킷과 계정(이메일) 버킷을 따로 두어 분산 무차별 대입까지 막습니다. AI 생성은 비용 방어로 시간당 30건입니다. 스로틀 가드는 인증 가드보다 **먼저** 돕니다(인증이 매 요청 DB를 치므로).
- **정답 노출 경계**: 진행 중 세션은 스냅샷을 `maskSnapshot()`으로 가립니다. 같은 문항을 `GET /questions/:id`나 `/stats`로 우회 조회하는 경로도 함께 막혀 있습니다(`answer-masking.ts`). 정답이 XP·코인 → 상점 실물 상품으로 이어지므로 표시상의 문제가 아니라 재화 경계입니다.
- **리치텍스트 검증**: 저장되는 ProseMirror JSON은 노드/마크/attrs 화이트리스트를 통과해야 합니다(`prosemirror.sanitize.ts`). 링크·이미지 URL은 `http/https/mailto` 스킴만 허용합니다.
- **보안 헤더**: API는 `helmet`, 프런트는 `next.config.mjs`의 `headers()`로 CSP·HSTS·`X-Content-Type-Options`·`frame-ancestors` 등을 내려보냅니다.
- **CORS**: `ALLOWED_ORIGINS`에 명시한 origin만 허용합니다. 운영에서 목록이 비면 부팅이 중단됩니다. Vercel 프리뷰는 `VERCEL_PREVIEW_PREFIX` 접두가 일치하는 것만 통과합니다.
- **Swagger**: `/api/docs`는 운영에서 기본 비활성입니다(`ENABLE_SWAGGER=true`로 명시적 활성화).
- **오류 노출**: 전역 `AllExceptionsFilter`가 의도치 않은 예외를 500 고정 문구로 바꿔 Prisma 내부 메시지(테이블·컬럼명) 유출을 막습니다.

---

## 6. 인프라 및 배포 (Infrastructure)

- **Backend**: Railway를 통해 배포되며, `db push` 방식을 사용하여 스키마를 동기화합니다.
- **Frontend**: Cloudflare Pages 또는 Vercel을 타겟으로 빌드됩니다.
- **Local Dev**: Docker를 사용하여 MySQL과 Redis 환경을 구성합니다. 상세 설정은 `LOCAL_TEST_GUIDE.md`를 참조하십시오.
