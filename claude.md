# AI Coding Assistant Guidelines (claude.md)

## 1. Project Context
- **Frontend:** Next.js (App Router, React Server Components, TypeScript, Tailwind CSS)
- **Backend:** NestJS (TypeScript, Module-Service-Controller pattern, REST APIs)
- **Database:** MySQL (Relational database, managed via Prisma/TypeORM)
- **Caching/Queue:** Redis (Hosted on Aiven, used for caching, queueing, and rate-limiting)
- **AI Integration:** Gemini API (with Client/Server-side Key Rotation & Fallback Handling)

---

## 2. General Principles
- **Type Safety:** TypeScript is mandatory. Avoid `any`. Use strict compiler flags and define clear interfaces/types for all 데이터 구조.
- **Simplicity & Modularity:** Write clean, self-documenting, and modular code. Avoid over-engineering.
- **Performance:** Keep bundle sizes small in Next.js. Avoid memory leaks and unclosed Redis/DB connections in NestJS.

---

## 3. Frontend Guidelines (Next.js)
- **Architecture:** 
  - Use the App Router (`app/` directory) by default.
  - Fetch data in React Server Components (RSC) whenever possible.
  - Use Client Components (`"use client"`) only when using React hooks (`useState`, `useEffect`) or browser APIs.
- **Directory Structure:**
  - `app/`: Pages, layouts, and Server Actions.
  - `components/`: Reusable UI components.
  - `hooks/`: Custom React hooks.
  - `lib/`: Utility functions and API clients.
  - `types/`: Shared TypeScript declarations.
- **Styling:** Use Tailwind CSS. Utilize `cn` helper (`clsx` + `tailwind-merge`) for conditional and dynamic classes.
- **State Management:** Use Zustand or React Context for global state, and Server Actions/React Query for server-state synchronization.

---

## 4. Backend Guidelines (NestJS)
- **Architecture:**
  - Strictly follow the **Module-Controller-Service** pattern.
  - Avoid tight coupling: always inject dependencies through constructors (Dependency Injection).
  - Do not import services directly across boundaries without proper module exports/imports.
- **Validation & DTOs:**
  - Always validate incoming payloads using `ValidationPipe` with `class-validator` and `class-transformer` DTOs.
- **Database (MySQL):**
  - Define entity relations clearly. 
  - Use transaction blocks for multi-write operations to ensure data integrity.
  - Ensure columns used in `WHERE`, `JOIN`, and `ORDER BY` clauses have appropriate indexes for query optimization.
- **Error Handling:** Use standard NestJS HTTP exceptions (`HttpException`, `BadRequestException`, etc.) and implement global exception filters.

---

## 5. Specific Features Guidelines

### Redis (Aiven)
- Access Redis strictly through a centralized `RedisService` or Redis Module.
- Implement automated key expiration (TTL) for all cached data to prevent memory bloat.
- Use explicit key prefixing (e.g., `app:cache:`, `app:queue:`, `app:rate_limit:`).
- Handle connection failures gracefully with appropriate retry limits and timeout settings.

### Gemini API Rotation
- Inject a dedicated `GeminiRotationService` to handle AI API calls.
- **Key Rotation:** Automatically rotate through configured API keys when encountering rate limits (HTTP `429`) or quota exhaustion errors.
- **Health Monitoring:** Track key health and temporarily disable keys that consistently fail.
- **Fallback Mechanism:** Always include fallback handling. If all Gemini API keys fail completely, return descriptive error messages or trigger a secondary fallback flow to prevent app crashes.
