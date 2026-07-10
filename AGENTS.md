# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

**IΔEA / Q-Idea** — an AI question-authoring and mock-exam platform for Korean exam prep. This repo contains two independent apps:

- **Backend (`src/`, root `package.json`)** — NestJS 10 REST API. Prisma → MySQL, BullMQ → Redis. This is the primary codebase.
- **Frontend (`web/`)** — Next.js 14 (App Router) app with its own `package.json`, tsconfig, and dependency tree. Largely a scaffold (shadcn/ui components, TanStack Query, Tiptap, Zustand).

The two share **no code**; they communicate over HTTP. Most work happens in the backend.

## Commands

All backend commands run from the repo root.

```bash
npm install               # also triggers `prisma generate` via postinstall
npm run prisma:generate   # regenerate Prisma Client after editing schema.prisma
npm run prisma:migrate    # create/apply a dev migration (needs a running MySQL)
npm run db:seed           # seed via prisma/seed.ts
npm run start:dev         # watch-mode dev server (http://localhost:3000, API under /api)
npm run build             # nest build → dist/
npm run lint              # eslint --fix over src/
npm test                  # jest (all *.spec.ts under src/)
npm test -- me.service    # run a single spec by filename fragment
```

Frontend (`cd web`): `npm run dev` / `npm run build` / `npm run lint`.

Local infra (MySQL + Redis via Docker), env setup, and full curl walkthroughs are in `LOCAL_TEST_GUIDE.md`. Swagger UI is served at `http://localhost:3000/api/docs`.

Note: the ports collide — both the API and the Next.js dev server default to **3000**. Run one at a time or override.

## Environment

`.env` (gitignored) is required. Key vars: `DATABASE_URL` (MySQL), `REDIS_HOST/PORT/PASSWORD`, `REDIS_TLS` (`true` only for managed Redis like Aiven — leave unset for local/Railway), `JWT_SECRET`, and the LLM keys (`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MAX_TOKENS`). Missing LLM keys don't block boot — generation jobs just fail at run time.

## Architecture

### Module layout

One NestJS module per bounded context under `src/modules/*`, each following controller → service → (DTO) with constructor DI. `PrismaService` (`src/prisma/`) is the single DB gateway; there is no repository layer — services call Prisma directly. For the current per-endpoint map (what each module owns, MVP status), see `docs/superpowers/plans/2026-07-08-qidea-api-inventory.md` — not `README.md`, which is stale.

Media/visuals are minimal in the MVP: images only. The client crops and uploads directly to **Supabase Storage**; `POST /media-assets` only registers the resulting public URL (`media.service.ts` never handles file bytes).

### Auth & authorization (global)

- `JwtAuthGuard` is registered as a global `APP_GUARD` in `app.module.ts`. **Every route is authenticated by default.** Opt out per-route with `@Public()` (`src/common/decorators/public.decorator.ts`).
- `@Roles(...)` + `RolesGuard` restrict CREATOR/ADMIN-only actions (master data, publishing). `RolesGuard` assumes `JwtAuthGuard` already populated `request.user`.
- **Auth is email + password with bcrypt** (`auth.service.ts`: `register`/`login`, `passwordHash` column). Note: `README.md` and `LOCAL_TEST_GUIDE.md` still describe an older *email-provisioning* login (no password) — those docs are stale; trust the code.

### Classification & question types (MVP model)

- **No unit tree.** Questions are classified directly by *세부과목* (sub-subject) — the `subjects` table, where `subjects.examCategory` is the 대분류 (e.g. 국어) and `subjects.name` is the sub-subject (e.g. 문학/언매). `Question.subjectId` (NOT NULL) points at it. There is no `units` table.
- **`questionType` is a VARCHAR**, not an enum — only `"객관식"` (objective) or `"주관식"` (subjective). The single source of truth for allowed values and the annotation constants is `src/common/constants/question.ts` (`QUESTION_KINDS`, etc.); DTOs validate with `@IsIn(QUESTION_KINDS)`.

### Content format — ProseMirror is owned by our code, not the LLM

`question.stem`, `choices[].content/explanation`, `passage.content`, and `explanation` are all stored as **Tiptap/ProseMirror JSON** (MySQL `Json` columns). The critical rule:

- The LLM is only ever asked for **plain text** (see `llm.types.ts`, the system prompt in the LLM service): `choices` for 객관식, `answerText` for 주관식 단답, `explanationText` otherwise. It never emits node trees.
- `src/common/prosemirror/prosemirror.util.ts` owns *all* assembly: `buildRichDoc` / `buildRichBlocks` turn plain text into node trees (splitting on `\n`), and `extractPlainText` flattens trees back to text for the `search_text` cache. This keeps the storage format stable even when LLM output drifts. When adding fields that store rich text, go through these helpers.

### AI generation is asynchronous (BullMQ)

`POST /ai-generations` does **not** call the LLM inline. It writes an `ai_generations` row as `PENDING` (snapshotting the full request into `input_params` for reproducibility/regeneration) and enqueues a BullMQ job, returning immediately. `AiGenerationProcessor` consumes the queue:

- It is **idempotent** — skips any job whose row is no longer `PENDING` (guards against retries/duplicates).
- On success it creates passage + questions and flips status to `COMPLETED` **inside a single `$transaction`**.
- On failure it re-throws so BullMQ retries with backoff; only after retries are exhausted does it set `FAILED`.
- Clients poll `GET /ai-generations/:id` for `PENDING → COMPLETED/FAILED` and the resulting IDs.

**LLM provider:** Gemini only. `GeminiLlmService` calls the Gemini REST API via `fetch`, and is the single class injected into `AiGenerationService` and `AiGenerationProcessor`. The vestigial `AnthropicLlmService` and the `@anthropic-ai/sdk` dependency were removed — do not reintroduce a second provider without a concrete need.

### Exam sessions — snapshot, mask, grade

This is the subtlest subsystem (`src/modules/exam-sessions/`, `grading.util.ts`):

- **Two assembly modes:** `POST /exam-sessions` takes either `questionIds` (manual playlist — those exact published questions of that subject) or filter conditions (`subjectId` + difficulty/type/tag → random `questionCount`).
- **Snapshot at assembly:** each question is copied whole into `exam_session_questions.snapshot` (including `correctAnswerText`). Grading always uses the snapshot, so later edits to the source question never change a taken exam.
- **Answer masking:** while a session is `IN_PROGRESS`, `maskSnapshot` strips choice `isCorrect` flags, `correctAnswerText`, and explanations before returning it. Answers are only revealed after submit.
- **Grading (`grading.util.ts`):** 객관식 → exact-set match (no partial credit); 주관식 with `correctAnswerText` → normalized string compare (단답 auto-grade); 주관식 without it → `null` (서술형, self-graded). Auto-graded answers update `questions.total/correct_solved_count` on submit; self-graded ones update via `PUT /exam-sessions/questions/:id/self-grade` after submit (which reconciles the same caches).

### 오답노트 2.0 — text annotations

The wrong-answer notebook is two decoupled axes, joined only on the client (and in one merged read endpoint):

- **Annotations (`annotations` module, `user_question_annotations`):** multiple text-anchored highlights/underlines per question (dropped the old single-memo model). Each row carries `target`/`selectionRange`/`selectedText` (anchor), `markStyle`+`color`, `reasonCode` (오답원인 tag, drives stats), and `memoText`. CRUD: `GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id`.
- **Stats (`me` module):** `GET /me/notes` merges aggregation + annotations — `summary` (`bySubject`/`byType`/`byReason`) plus `wrongQuestions` (from graded `isCorrect === false` answers) with each question's annotations nested. `GET /me/exam-sessions` is the separate solve-history list.

### Prisma / schema notes

- `prisma/schema.prisma` is the MVP-refactored schema: `subjects` (as 세부과목) → `questions.subjectId`, `questionType` VARCHAR, `questions.correctAnswerText`, and `user_question_annotations`. Removed vs. the original DDL: `units`, `question_variants`, comment `isPinned`, media `GRAPH_CODE/SVG`+`sourceCode`, the old `user_question_memos`. DB column names are `snake_case` via `@map`; Prisma fields are `camelCase`. `prisma/0001_qidea_extensions.sql` is a hand-maintained reference only (prod uses `db push`).
- The generated client doesn't surface `Prisma.InputJsonValue`, so code writing structured objects into `Json` columns casts through a local `type JsonWritable = any` alias (see the processor). Follow that existing pattern rather than fighting the types.
- Path alias `@/*` → `src/*` (configured in both `tsconfig.json` and the jest `moduleNameMapper`).
- **`README.md` is stale** — it still documents units, the enum `QuestionType`, and the `variants`/`memos` modules. Trust `schema.prisma` and the docs under `docs/superpowers/plans/` (the `2026-07-08-*` files describe the MVP refactor).

### Deployment

Railway via `railway.json` → `npm run start:railway`, which runs `prisma db push --skip-generate --accept-data-loss` then `node dist/main.js`. **Production uses `db push`, not migrations** — the `prisma/migrations` dev flow and the deployed schema-sync path differ; keep `schema.prisma` authoritative. The frontend targets Cloudflare Pages / Vercel (`@cloudflare/next-on-pages`, `wrangler` in `web/`).

## Conventions

- Comments and user-facing messages (validation errors, exceptions) are written in **Korean**; match that when editing existing files.
- TypeScript is strict (`strict`, `noImplicitAny`). Validation is enforced globally by a `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` — every request body needs a DTO with `class-validator` decorators, or unknown fields are rejected.
