# IΔEA / Q-Idea

AI 문항 출제 및 모의고사 플랫폼 **IΔEA / Q-Idea** 프로젝트입니다. 본 프로젝트는 한국 교육 환경에 최적화된 AI 기반 학습 도구를 제공하며, 사용자가 직접 문항을 생성하고 모의고사를 구성하여 학습 효율을 극대화할 수 있도록 돕습니다.

## 🚀 주요 기능

- **AI 기반 문항 생성**: Gemini LLM을 활용하여 다양한 유형의 문항 자동 생성
- **모의고사 구성 및 응시**: 사용자 맞춤형 모의고사 생성, 응시 및 채점 기능
- **오답노트 2.0**: 텍스트 기반 주석 및 오답 원인 분석을 통한 심층 학습 지원
- **문제집 (Workbook)**: 문항을 큐레이션하고 공유할 수 있는 문제집 기능
- **게이미피케이션**: XP, 레벨, 스트릭, 마일스톤, 루팅 박스 등 학습 동기 부여 요소
- **미디어 관리**: AWS S3를 활용한 이미지 업로드 및 관리
- **사용자 인증 및 권한 관리**: JWT 기반 인증 및 역할(CREATOR, CONSUMER, ADMIN) 기반 권한 시스템

## 🏗️ 아키텍처 개요

본 프로젝트는 백엔드와 프론트엔드가 독립적으로 구성된 모놀리식 저장소(monorepo) 형태로 개발되었습니다. 두 애플리케이션은 HTTP를 통해 통신하며, 대부분의 핵심 로직은 백엔드에서 처리됩니다.

### 백엔드 (Backend)

- **프레임워크**: [NestJS 10](https://nestjs.com/) (Node.js)
- **데이터베이스**: [MySQL](https://www.mysql.com/) (Prisma ORM)
- **비동기 작업 큐**: [BullMQ](https://bullmq.io/) (Redis 기반)
- **캐싱/세션**: [Redis](https://redis.io/)
- **파일 스토리지**: [AWS S3](https://aws.amazon.com/s3/) (이미지 업로드)
- **LLM 연동**: Google Gemini API
- **배포**: [Railway](https://railway.app/)

NestJS는 모듈 기반 아키텍처를 채택하여 각 기능(예: `auth`, `questions`, `exam-sessions`, `ai-generation`)이 독립적인 모듈로 구성되어 있습니다. `JwtAuthGuard`를 통한 전역 인증 가드가 기본으로 적용되며, `@Public()` 데코레이터를 통해 특정 라우트만 인증을 우회할 수 있습니다.

### 프론트엔드 (Frontend)

- **프레임워크**: [Next.js 14](https://nextjs.org/) (App Router)
- **UI 라이브러리**: [shadcn/ui](https://ui.shadcn.com/) (TailwindCSS 기반)
- **상태 관리**: [Zustand](https://zustand-bear.github.io/)
- **데이터 페칭**: [TanStack Query](https://tanstack.com/query/latest)
- **리치 텍스트 에디터**: [Tiptap](https://tiptap.dev/) (ProseMirror 기반)
- **배포**: [Vercel](https://vercel.com/)

프론트엔드는 백엔드 API와 통신하여 데이터를 처리하며, `localStorage`에 저장된 인증 토큰을 활용합니다. Vega 차트와 같은 시각화 요소는 클라이언트 측에서만 렌더링되도록 `next/dynamic`과 `ssr: false`를 사용합니다.

## 📊 데이터베이스 스키마

본 프로젝트의 데이터베이스 스키마는 `prisma/schema.prisma` 파일을 통해 정의됩니다. 주요 엔티티 및 관계는 다음과 같습니다.

### 핵심 엔티티

| 엔티티 명 | 설명 | 주요 필드 | 관계 |
|---|---|---|---|
| `User` | 사용자 정보 | `email`, `passwordHash`, `nickname`, `xp`, `level`, `currentStreak`, `coins` | `UserRole`, `AiGeneration`, `Passage`, `Question`, `MediaAsset`, `ExamSession`, `QuestionReview`, `QuestionComment`, `UserQuestionAnnotation`, `Workbook`, `XpHistory`, `MilestoneAchievement`, `LootBox`, `UserInventory`, `Purchase`, `CoinHistory` |
| `Subject` | 과목 분류 (수능, 국어, 문학 등 3단계) | `examType`, `examCategory`, `name` | `AiGeneration`, `ExamSession`, `Question` |
| `Question` | 문항 정보 | `creatorId`, `subjectId`, `questionType` (`객관식` / `주관식`), `stem` (ProseMirror JSON), `choices` (ProseMirror JSON), `explanation` (ProseMirror JSON), `correctAnswerText`, `difficulty`, `totalSolvedCount`, `correctSolvedCount` | `MediaAsset`, `QuestionTag`, `ExamSessionQuestion`, `QuestionReview`, `QuestionComment`, `UserQuestionAnnotation`, `WorkbookQuestion`, `QuestionChoiceStat` |
| `Passage` | 지문 정보 | `creatorId`, `generationId`, `content` (ProseMirror JSON) | `Question`, `MediaAsset` |
| `AiGeneration` | AI 생성 작업 기록 | `creatorId`, `subjectId`, `inputParams`, `model`, `status` | `Passage`, `Question`, `MediaAsset` |
| `ExamSession` | 모의고사/학습 세션 | `userId`, `subjectId`, `workbookId`, `isReview`, `filterCriteria`, `status`, `durationSec` | `ExamSessionQuestion` |
| `UserQuestionAnnotation` | 오답노트 주석 | `userId`, `questionId`, `target`, `markStyle`, `color`, `selectedText`, `reasonCode`, `memoText` | `User`, `Question` |
| `Workbook` | 문제집 | `ownerId`, `title`, `description`, `visibility`, `forkedFromId`, `viewCount`, `forkCount`, `questionCount`, `attemptCount`, `scoreSumPercent` | `WorkbookQuestion`, `ExamSession`, `WorkbookTag` | 

### 스키마 다이어그램 (개념적)

```mermaid
graph TD
    User -- has --> UserRole
    User -- creates --> AiGeneration
    User -- creates --> Passage
    User -- creates --> Question
    User -- uploads --> MediaAsset
    User -- takes --> ExamSession
    User -- reviews --> QuestionReview
    User -- comments on --> QuestionComment
    User -- annotates --> UserQuestionAnnotation
    User -- creates --> Workbook
    User -- tracks --> XpHistory
    User -- achieves --> MilestoneAchievement
    User -- opens --> LootBox
    User -- owns --> UserInventory
    User -- makes --> Purchase
    User -- logs --> CoinHistory

    AiGeneration -- generates --> Passage
    AiGeneration -- generates --> Question
    AiGeneration -- generates --> MediaAsset

    Subject -- relates to --> AiGeneration
    Subject -- relates to --> ExamSession
    Subject -- relates to --> Question

    Passage -- contains --> Question
    Passage -- contains --> MediaAsset

    Question -- has --> MediaAsset
    Question -- has --> QuestionTag
    Question -- part of --> ExamSessionQuestion
    Question -- has --> QuestionReview
    Question -- has --> QuestionComment
    Question -- has --> UserQuestionAnnotation
    Question -- part of --> WorkbookQuestion
    Question -- has --> QuestionChoiceStat

    Tag -- applies to --> QuestionTag
    Tag -- applies to --> WorkbookTag

    ExamSession -- contains --> ExamSessionQuestion
    ExamSessionQuestion -- has --> ExamSessionAnswer

    Workbook -- contains --> WorkbookQuestion
    Workbook -- has --> WorkbookTag
    Workbook -- forks from --> Workbook

    QuestionTag -- links --> Question
    QuestionTag -- links --> Tag

    WorkbookTag -- links --> Workbook
    WorkbookTag -- links --> Tag

    WorkbookQuestion -- links --> Workbook
    WorkbookQuestion -- links --> Question
    WorkbookQuestion -- sourced from --> Workbook

    ExamSessionQuestion -- links --> ExamSession
    ExamSessionQuestion -- links --> Question
    ExamSessionQuestion -- has --> ExamSessionAnswer

    ExamSessionAnswer -- links --> ExamSessionQuestion

    QuestionReview -- links --> Question
    QuestionReview -- links --> User

    QuestionComment -- links --> Question
    QuestionComment -- links --> User
    QuestionComment -- replies to --> QuestionComment

    UserQuestionAnnotation -- links --> User
    UserQuestionAnnotation -- links --> Question

    QuestionChoiceStat -- links --> Question

    XpHistory -- links --> User

    MilestoneAchievement -- links --> User

    LootBox -- links --> User

    UserInventory -- links --> User

    Purchase -- links --> User

    CoinHistory -- links --> User


    subgraph Core Entities
        User
        Subject
        Question
        Passage
        AiGeneration
    end

    subgraph Exam & Learning
        ExamSession
        ExamSessionQuestion
        ExamSessionAnswer
        UserQuestionAnnotation
        Workbook
        WorkbookQuestion
    end

    subgraph Gamification & Commerce
        XpHistory
        MilestoneAchievement
        LootBox
        UserInventory
        Purchase
        CoinHistory
    end

    subgraph Content Management
        MediaAsset
        Tag
        QuestionTag
        WorkbookTag
    end

    subgraph Community
        QuestionReview
        QuestionComment
    end
```

## 🛠️ 로컬 개발 환경 설정

프로젝트를 로컬에서 실행하기 위한 단계는 다음과 같습니다.

### 필수 요구사항

- Node.js (20.x 버전 권장)
- Docker (MySQL 및 Redis 실행용)
- Git

### 설치 및 실행

1.  **저장소 클론**: 
    ```bash
    git clone https://github.com/rladnwls122/I-EA.git
    cd I-EA
    ```

2.  **종속성 설치**: 백엔드 및 프론트엔드 종속성을 설치합니다.
    ```bash
    npm install # 백엔드 종속성 설치 및 Prisma Client 생성
    cd web
    npm install # 프론트엔드 종속성 설치
    cd ..
    ```

3.  **.env 파일 설정**: 프로젝트 루트에 `.env` 파일을 생성하고 다음 환경 변수를 설정합니다. `AGENTS.md`에 언급된 주요 변수들을 포함합니다.
    ```env
    DATABASE_URL="mysql://user:password@localhost:3306/qidea"
    REDIS_HOST="localhost"
    REDIS_PORT=6379
    REDIS_PASSWORD=
    REDIS_TLS=false
    JWT_SECRET="your_jwt_secret_key"
    GEMINI_API_KEY="your_gemini_api_key"
    GEMINI_MODEL="gemini-pro"
    GEMINI_MAX_TOKENS=2000
    ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3001"
    PORT=3000
    ```

4.  **데이터베이스 및 Redis 실행 (Docker)**:
    `LOCAL_TEST_GUIDE.md`에 상세한 Docker Compose 설정이 있지만, 간략하게는 MySQL과 Redis 컨테이너를 실행해야 합니다.

5.  **데이터베이스 마이그레이션 및 시드**: 
    ```bash
    npm run prisma:migrate # 개발 마이그레이션 적용
    npm run db:seed        # 초기 데이터 시드
    ```

6.  **백엔드 개발 서버 실행**: 
    ```bash
    npm run start:dev
    ```
    API는 `http://localhost:3000/api`에서 제공됩니다. Swagger UI는 `http://localhost:3000/api/docs`에서 확인할 수 있습니다.

7.  **프론트엔드 개발 서버 실행**: 
    ```bash
    cd web
    npm run dev
    ```
    프론트엔드는 `http://localhost:3001` (또는 `.env`의 `ALLOWED_ORIGINS`에 설정된 포트)에서 실행됩니다.

## 🚀 배포

- **백엔드**: [Railway](https://railway.app/)를 통해 배포됩니다. `railway.json` 파일에 정의된 빌드 및 배포 스크립트(`npm run start:railway`)를 사용합니다. 프로덕션 환경에서는 `prisma db push`를 사용하여 스키마를 동기화합니다.
- **프론트엔드**: [Vercel](https://vercel.com/)을 통해 배포됩니다. `https://i-ea.vercel.app`에서 서비스됩니다.

## 🤝 기여 가이드라인

- **코드 컨벤션**: TypeScript strict 모드 및 ESLint를 준수합니다.
- **커밋 메시지**: 명확하고 간결한 커밋 메시지를 작성합니다.
- **테스트**: Jest를 사용하여 유닛 및 통합 테스트를 작성합니다.
- **언어**: 주석 및 사용자 대면 메시지(유효성 검사 오류, 예외)는 **한국어**로 작성합니다.

## 📄 라이선스

UNLICENSED

---

**Manus AI**에 의해 작성되었습니다. (2026년 7월 13일)
