# Q-Idea 3-에이전트 협업 설계

날짜: 2026-07-09
상태: 승인됨

## 목적

`schema` / `backend` / `reviewer` 세 서브에이전트를 만들어, 기능 작업 시 메인 스레드가 중계하는 방식으로 협업시킨다.

## 전제 — 에이전트 간 통신의 실제 메커니즘

Claude Code 서브에이전트는 P2P 대화가 불가능하다. 에이전트끼리 직접 메시지를 주고받는 채널은 없다. 각 서브에이전트는 독립 컨텍스트를 가지고, 최종 텍스트만 메인 스레드에 반환한다.

따라서 "소통"은 다음으로 구현된다:

- 에이전트 A의 구조화된 반환값을 메인 스레드가 에이전트 B의 프롬프트에 삽입한다.
- 되먹임이 필요하면 `SendMessage`로 **기존 에이전트를 컨텍스트 유지한 채** 다시 깨운다. 새 에이전트를 띄우지 않는다.

## 트리거

수동 호출. 기능 작업 시 메인 스레드가 필요한 에이전트를 부른다. 자율 루프나 커밋 훅 게이트는 범위 밖.

## 에이전트 경계

| 에이전트 | 소유 | 도구 | 반환 형태 |
|---|---|---|---|
| `qidea-schema` | `prisma/schema.prisma`, 마이그레이션 안전성 | Read, Grep, Glob, Bash | 제안 diff + 데이터 손실 위험 판정 |
| `qidea-backend` | `src/modules/*`, `src/common/*` | Read, Edit, Write, Bash, Grep, Glob | 변경 파일 + 테스트 결과 + 남은 작업 |
| `qidea-reviewer` | diff 검수 | Read, Grep, Bash | `path:line: severity: 문제. 수정.` |

### 권한 모델

**`qidea-backend`만 쓰기 권한을 가진다.** 나머지 둘은 읽기 전용이다.

이유:

- `railway.json` → `npm run start:railway` → `prisma db push --skip-generate --accept-data-loss`. 프로덕션은 마이그레이션이 아니라 `db push`로 스키마를 동기화한다. 스키마 변경이 곧 프로덕션 데이터 손실 경로다. 따라서 `schema.prisma` 수정은 항상 사람 승인을 거친다.
- `qidea-reviewer`가 쓰기 권한을 가지면 자기가 지적한 내용을 자기가 고치는 이해충돌이 생긴다. 검수자는 검수만 한다.

`qidea-schema`와 `qidea-reviewer`에게 `Bash`를 주되, 각 프롬프트에서 읽기 전용 명령만 허용한다고 명시한다. (`tools` 필드로는 Bash 하위 명령을 제한할 수 없다.)

## 통신 흐름 — 기능 추가 시

1. 메인이 `qidea-schema`를 호출한다. 모델 변경 제안과 위험도를 반환받는다.
2. 메인이 사용자에게 스키마 diff를 보여주고 승인을 받는다. **승인 후 메인이 직접 `schema.prisma`를 수정한다.** 에이전트가 수정하지 않는다.
3. 메인이 `qidea-backend`를 호출한다. 프롬프트에 승인된 스키마 diff를 삽입한다. 모듈을 구현시킨다.
4. 메인이 `qidea-reviewer`를 호출한다. 프롬프트에 검수 범위(`git diff` 대상)를 지정한다. 지적 목록을 반환받는다.
5. 지적이 있으면 메인이 `SendMessage`로 3단계의 `qidea-backend` 에이전트를 다시 깨운다. 컨텍스트가 유지되므로 자기가 쓴 코드를 기억한 채 수정한다.
6. 4~5를 지적이 없을 때까지 반복한다. 반복 상한은 2회로 둔다 — 그 이상이면 메인이 개입한다.

이 중 5단계가 "에이전트 간 소통"의 실체다. reviewer의 출력이 backend의 입력이 된다. 단, 항상 메인 스레드를 경유한다.

### 부분 호출

세 에이전트를 항상 다 부를 필요는 없다.

- 스키마 변경 없는 버그 수정: `qidea-backend` → `qidea-reviewer`.
- 스키마 영향도 조사만: `qidea-schema` 단독.
- 남이 쓴 코드 검수: `qidea-reviewer` 단독.

## 각 에이전트에 주입할 프로젝트 규칙

`claude.md`에서 발췌한다. 서브에이전트는 루트 `claude.md`를 자동으로 읽지 않으므로 시스템 프롬프트에 직접 박는다.

**공통**

- 주석과 사용자 대면 메시지(검증 에러, 예외)는 한국어로 쓴다.
- TypeScript는 `strict`, `noImplicitAny`.
- 전역 `ValidationPipe`가 `whitelist: true` + `forbidNonWhitelisted: true`로 걸려 있다. 모든 요청 body는 `class-validator` 데코레이터가 붙은 DTO가 필요하다.
- `README.md`는 낡았다(units, enum `QuestionType`, variants/memos 모듈을 아직 설명한다). 근거로 쓰지 않는다. `schema.prisma`와 코드가 진실이다.

**`qidea-schema`**

- 프로덕션은 `db push`를 쓴다. `prisma/migrations/`가 아니다. `schema.prisma`가 권위 있는 소스다.
- `prisma/0001_qidea_extensions.sql`은 손으로 관리하는 참고 파일일 뿐이다.
- DB 컬럼명은 `@map`으로 snake_case, Prisma 필드는 camelCase.
- `units` 테이블은 없다. 문항은 `subjects`(세부과목)로 직접 분류된다. `subjects.examCategory`가 대분류, `subjects.name`이 세부과목이다.
- `questionType`은 enum이 아니라 VARCHAR다. 허용값은 `"객관식"` / `"주관식"` 둘뿐이고, 단일 진실 소스는 `src/common/constants/question.ts`다.

**`qidea-backend`**

- ProseMirror/Tiptap JSON 조립은 오직 `src/common/prosemirror/prosemirror.util.ts`를 통한다. `buildRichDoc` / `buildRichBlocks` / `extractPlainText`.
- LLM에는 절대 노드 트리를 요청하지 않는다. 평문만 받는다.
- `PrismaService`가 유일한 DB 게이트웨이다. 리포지토리 계층은 없다. 서비스가 Prisma를 직접 호출한다.
- LLM 프로바이더는 Gemini 단일이다. 두 번째 프로바이더를 도입하지 않는다.
- `Json` 컬럼에 구조체를 쓸 때는 기존 `type JsonWritable = any` 별칭 패턴을 따른다.
- 경로 별칭 `@/*` → `src/*`.

**`qidea-reviewer`**

- 위 규칙 전부를 검수 기준으로 쓴다.
- 심각도 태그: `blocker` / `major` / `minor`. 포매팅 지적은 의미를 바꾸지 않는 한 생략한다.
- 칭찬하지 않는다. 범위를 벗어난 리팩터를 제안하지 않는다.

## 반환 형태 계약

에이전트의 최종 텍스트가 곧 반환값이다. 사람에게 보내는 메시지가 아니다. 아래 형태를 지킨다.

**`qidea-schema`**

```
## 제안
<schema.prisma에 적용할 diff, 유니파이드 형식>

## 위험도
<none | low | high> — <이유. `db push --accept-data-loss` 하에서 어떤 컬럼/테이블의 데이터가 날아가는지.>

## 파급
<이 변경으로 깨지는 src/ 파일 경로 목록>
```

**`qidea-backend`**

```
## 변경 파일
<path> — <한 줄 요약>

## 검증
<`npm test` / `npm run lint` 실행 결과. 실행 안 했으면 안 했다고 쓴다.>

## 남은 작업
<없으면 "없음">
```

**`qidea-reviewer`**

```
<path>:<line>: <blocker|major|minor>: <문제>. <수정>.
```

지적이 없으면 `지적 없음` 한 줄만 반환한다.

## 산출물

- `.claude/agents/qidea-schema.md`
- `.claude/agents/qidea-backend.md`
- `.claude/agents/qidea-reviewer.md`

## 범위 밖 (YAGNI)

- **공유 핸드오프 파일** (`docs/superpowers/handoff/*.md`): 읽기 전용 에이전트가 쓰기 권한을 갖게 되어 권한 모델이 깨진다. 반환값이 메인 컨텍스트를 실제로 압박할 때 다시 검토한다.
- **Workflow 스크립트** (`.claude/workflows/`): 결정론적 `schema → backend → review` 파이프라인. 대규모 리팩터가 실제로 생길 때 추가한다.
- **자율 개선 루프**, **커밋 훅 게이트**.
