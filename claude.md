# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**IΔEA / Q-Idea** — an AI question-authoring and mock-exam platform for Korean exam prep. This repo contains two independent apps:

- **Backend (`src/`, root `package.json`)** — NestJS 11 REST API. Prisma → MySQL, BullMQ → Redis. This is the primary codebase.
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

Local infra (MySQL + Redis via Docker), env setup, and full curl walkthroughs are in `LOCAL_TEST_GUIDE.md`. Swagger UI is served at `http://localhost:3000/api/docs` **in development only** — it is off when `NODE_ENV=production` unless `ENABLE_SWAGGER=true`.

Note: the ports collide — both the API and the Next.js dev server default to **3000**. Run one at a time or override.

CI (`.github/workflows/ci.yml`) runs on every PR: backend lint/typecheck/test, frontend typecheck/build, `npm audit` (fails on critical, reports high), and gitleaks. Dependabot opens weekly dependency PRs.

## Environment

`.env` (gitignored) is required; `.env.example` is the annotated source of truth for every variable and its default.

**Boot-time validation** (`src/config/env.validation.ts`, wired via `ConfigModule.forRoot({ validate })`) refuses to start the process when a security-critical value is missing. There is no fallback default for `JWT_SECRET` anywhere in the code — the old `?? 'change-me-in-production'` pair let the app boot silently with a publicly known signing key. Don't reintroduce one.

- **Hard-required always:** `DATABASE_URL`, `JWT_SECRET` (rejected if blank or a known example string like `change-me`).
- **Hard-required when `NODE_ENV=production`:** `ALLOWED_ORIGINS` (comma-separated); `JWT_SECRET` must also be ≥32 chars.
- **Optional, degrade at run time:** `GEMINI_API_KEY`/`GEMINI_MODEL`/`GEMINI_MAX_TOKENS` (generation jobs fail), `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_S3_PUBLIC_BASE_URL` (presign returns 503).
- **Other:** `REDIS_HOST/PORT/PASSWORD`, `REDIS_TLS` (`true` only for managed Redis like Aiven — leave unset for local/Railway), `VERCEL_PREVIEW_PREFIX` (narrows which `*.vercel.app` origins CORS accepts), `ENABLE_SWAGGER`.

## Architecture

### Module layout

One NestJS module per bounded context under `src/modules/*`, each following controller → service → (DTO) with constructor DI. `PrismaService` (`src/prisma/`) is the single DB gateway; there is no repository layer — services call Prisma directly. There is no maintained per-endpoint inventory doc — read the controllers, or browse Swagger at `/api/docs` in dev. `ARCHITECTURE.md` is the high-level map.

Media/visuals are minimal in the MVP: images only. The client crops and uploads directly to **AWS S3** via a presigned POST (`s3.service.ts`, `POST /media-assets/presign`); `POST /media-assets` only registers the resulting public URL (`media.service.ts` never handles file bytes).

### Auth & authorization (global)

- `JwtAuthGuard` is registered as a global `APP_GUARD` in `app.module.ts`. **Every route is authenticated by default.** Opt out per-route with `@Public()` (`src/common/decorators/public.decorator.ts`).
- `@Roles(...)` + `RolesGuard` restrict CREATOR/ADMIN-only actions (master data, publishing). `RolesGuard` assumes `JwtAuthGuard` already populated `request.user`.
- **Auth is email + password with bcrypt** (`auth.service.ts`: `register`/`login`, `passwordHash` column, 12 rounds — older 10-round hashes still verify since the cost is stored in the hash). `LOCAL_TEST_GUIDE.md` §3.1 walks through `POST /auth/register` then `/auth/login` with this scheme — keep it in sync if the DTOs change.
- **Token revocation:** JWTs carry a `tv` claim = `users.token_version` at issue time, and `JwtStrategy.validate` rejects the token when it no longer matches. `POST /auth/logout-all` bumps the column. `validate` already reads the user row every request, so this costs nothing extra. Any future password-change flow must bump it too. Tokens issued before this existed have no `tv` and are treated as version 0.
- **Rate limiting** (`ThrottlerGuard`) is registered as an `APP_GUARD` **before** `JwtAuthGuard` — order in the `providers` array is execution order, and auth hits the DB on every request, so throttling must come first. Defaults and per-route overrides live in `src/common/throttler/throttler.config.ts`. Auth routes additionally use `AuthThrottlerGuard`, which keys on the target **email** so a distributed attack on one account shares a bucket even across IPs. `app.set('trust proxy', 1)` in `main.ts` is what makes `req.ip` the real client behind Railway/Vercel — without it every user collapses into one bucket.
- **Login must not leak account existence.** Identical message *and* identical timing: a missing user still pays a dummy bcrypt compare (`burnCompare`). Don't "optimize" that early return back in.

### Classification & question types (MVP model)

- **No unit tree.** Questions are classified directly by *세부과목* (sub-subject) — the `subjects` table, where `subjects.examCategory` is the 대분류 (e.g. 국어) and `subjects.name` is the sub-subject (e.g. 문학/언매). `Question.subjectId` (NOT NULL) points at it. There is no `units` table.
- **`questionType` is a VARCHAR**, not an enum — only `"객관식"` (objective) or `"주관식"` (subjective). The single source of truth for allowed values and the annotation constants is `src/common/constants/question.ts` (`QUESTION_KINDS`, etc.); DTOs validate with `@IsIn(QUESTION_KINDS)`.

### Content format — ProseMirror is owned by our code, not the LLM

`question.stem`, `choices[].content/explanation`, `passage.content`, and `explanation` are all stored as **Tiptap/ProseMirror JSON** (MySQL `Json` columns). The critical rule:

- The LLM is only ever asked for **plain text** (see `llm.types.ts`, the system prompt in the LLM service): `choices` for 객관식, `answerText` for 주관식 단답, `explanationText` otherwise. It never emits node trees.
- `src/common/prosemirror/prosemirror.util.ts` owns *all* assembly: `buildRichDoc` / `buildRichBlocks` turn plain text into node trees (splitting on `\n`), and `extractPlainText` flattens trees back to text for the `search_text` cache. This keeps the storage format stable even when LLM output drifts. When adding fields that store rich text, go through these helpers.
- **Client-supplied rich text is whitelisted before it is stored.** `prosemirror.sanitize.ts` allows only the node types, marks, and attrs the Tiptap v3 StarterKit editor actually produces, and restricts link/image URLs to `http`/`https`/`mailto` (a `javascript:` href would otherwise persist and fire on click). Depth and node-count caps guard against hostile JSON. DTOs opt in via `@IsProseMirrorDoc()` / `@IsProseMirrorBlocks()` / `@IsQuestionChoices()`. **If you add a Tiptap extension to the editor, widen the allowlist in the same change** — otherwise saving silently starts 400ing. Note `choices[].content` legitimately arrives as either a doc node (frontend editor) or a block array (AI path); the validator accepts both.

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
- **Answer masking is a two-endpoint boundary, not one.** While a session is `IN_PROGRESS`, `maskSnapshot` strips choice `isCorrect` flags, `correctAnswerText`, and explanations from the session payload. But the same payload also returns `questionId`, so the question-bank routes have to mask too or the whole thing is one request away from useless: `GET /questions/:id` and `GET /questions/:id/stats` check for an in-progress session on that question and mask accordingly (`answer-masking.ts`). `/stats` is `@Public()`, so it also withholds `isCorrect` from anonymous callers — it returns `null`, never `false`, because `false` would let you derive the answer by elimination. The question's own creator is exempt (the edit UI needs the original). This matters beyond fair play: correct answers pay XP and coins, and coins buy physical shop items.
- **Grading (`grading.util.ts`):** 객관식 → exact-set match (no partial credit); 주관식 with `correctAnswerText` → normalized string compare (단답 auto-grade); 주관식 without it → `null` (서술형, self-graded). Auto-graded answers update `questions.total/correct_solved_count` on submit; self-graded ones update via `PUT /exam-sessions/questions/:id/self-grade` after submit (which reconciles the same caches).

### 오답노트 2.0 — text annotations

The wrong-answer notebook is two decoupled axes, joined only on the client (and in one merged read endpoint):

- **Annotations (`annotations` module, `user_question_annotations`):** multiple text-anchored highlights/underlines per question (dropped the old single-memo model). Each row carries `target`/`selectionRange`/`selectedText` (anchor), `markStyle`+`color`, `reasonCode` (오답원인 tag, drives stats), and `memoText`. CRUD: `GET/POST /questions/:id/annotations`, `PATCH/DELETE /annotations/:id`.
- **Stats (`me` module):** `GET /me/notes` merges aggregation + annotations — `summary` (`bySubject`/`byType`/`byReason`) plus `wrongQuestions` (from graded `isCorrect === false` answers) with each question's annotations nested. `GET /me/exam-sessions` is the separate solve-history list.

### Prisma / schema notes

- `prisma/schema.prisma` is the MVP-refactored schema: `subjects` (as 세부과목) → `questions.subjectId`, `questionType` VARCHAR, `questions.correctAnswerText`, and `user_question_annotations`. Removed vs. the original DDL: `units`, `question_variants`, comment `isPinned`, media `GRAPH_CODE/SVG`+`sourceCode`, the old `user_question_memos`. DB column names are `snake_case` via `@map`; Prisma fields are `camelCase`. `prisma/0001_qidea_extensions.sql` is a hand-maintained reference only (prod uses `db push`).
- The generated client doesn't surface `Prisma.InputJsonValue`, so code writing structured objects into `Json` columns casts through a local `type JsonWritable = any` alias (see the processor). Follow that existing pattern rather than fighting the types.
- Path alias `@/*` → `src/*` (configured in both `tsconfig.json` and the jest `moduleNameMapper`).
- `schema.prisma` is authoritative for the current shape. The MVP refactor that produced it removed `units`, `question_variants`, `user_question_memos`, and the `QuestionType` enum; the schema file's own header comment records this. Older docs that mention a `units` table or `POST /api/units` are describing a shape that no longer exists.

### Deployment

Railway via `railway.json` → `npm run start:railway`, which runs `prisma db push --skip-generate` then `node dist/main.js`. **Production uses `db push`, not migrations** — the `prisma/migrations` dev flow and the deployed schema-sync path differ; keep `schema.prisma` authoritative. `--accept-data-loss` was deliberately dropped: on schema drift the deploy now fails loudly instead of silently dropping columns. Don't add it back to quiet a failing deploy — fix the drift. The frontend is deployed to **Vercel** (`https://i-ea.vercel.app`); `@cloudflare/next-on-pages`/`wrangler` remain in `web/package.json` from an earlier abandoned Cloudflare Pages attempt (no `wrangler.toml` present) — don't assume that path is live.

### Frontend (`web/`) notes

`web/WEB_GUIDE.md` is the authoritative AI-facing guide for this app. Key rules from it:

- **Vega charts must be client-only.** Chart components import `vega`/`vega-lite`/`react-vega`, which break under SSR (`canvas` errors). Load them via `next/dynamic` with `ssr: false`, and double-guard with `typeof window !== 'undefined'` inside the component. The webpack config stubs `canvas` to `false` for the same reason. (The old "don't bump Vega" rule is retired — the stack was moved to vega 6 / vega-embed 7 / vega-lite 6 to clear XSS advisories and to match `react-vega@8`'s peer requirement.)
- **Security headers come from `next.config.mjs`'s `headers()`** — CSP, HSTS, `frame-ancestors: none`, `nosniff`. The CSP's `connect-src` is built from `NEXT_PUBLIC_API_URL`, so pointing the app at a new API origin means that env var must be set at build time or requests get blocked. It matters here because the auth token lives in `localStorage`: one XSS and the token is gone, so CSP is the second line of defence.
- **Layout is flat, no `AppFrame` wrapper.** `app/layout.tsx` renders a global sidebar (`AppSidebar`), which is responsive: a fixed left rail (`md:` and up, `pl-[64px]` on `body`) collapses to a bottom tab bar on mobile (`pb-14` on `body` below `md`). Pages start directly with `<main>` — don't reintroduce a layout wrapper or duplicate the margin. `app/intro/page.tsx` offsets both (`-mb-14 md:-ml-[64px]`) since the sidebar hides there. Routes like `app/notes/` use parallel routes (`@sidebar` slot) and stack to a single column below `md`.
- **Real API vs mock data is still mixed.** `lib/api.ts` + `lib/hooks.ts` are the real backend integration and should be preferred for any new/changed feature; some pages (e.g. `app/questions/page.tsx`) still read `lib/mock-data.ts`. `lib/mock-data.ts` and `lib/types.ts` disagree on shape in places (e.g. `id: number` vs `string`) — treat `lib/types.ts` as the source of truth and fix mismatches toward it. API calls read the auth token from `localStorage`, so they must run in client components only.
- **Rich text is ProseMirror JSON, same as the backend** (`stem`, `choices`, `explanation`). Never render these fields as raw strings — use `lib/prosemirror.ts`'s `extractPlainText` or a dedicated renderer, or you'll get `[object Object]` or a runtime crash.
- **Defensive guards expected throughout:** `typeof window !== 'undefined'` before any `localStorage` access, existence checks before `new Date(field)` conversions, and `(data || []).map(...)` before assuming an API response is an array.

## Conventions

- Comments and user-facing messages (validation errors, exceptions) are written in **Korean**; match that when editing existing files.
- TypeScript is strict (`strict`, `noImplicitAny`). Validation is enforced globally by a `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` — every request body needs a DTO with `class-validator` decorators, or unknown fields are rejected.
