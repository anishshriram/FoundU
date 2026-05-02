# FoundU — Changelog

All notable changes to the FoundU codebase are documented here.
Format: `[VERSION] — YYYY-MM-DD — Author — Description`
Status labels: `added` | `changed` | `fixed` | `removed` | `decision` | `tbd-resolved`

---

## How to Use This File

- Every coding session that produces a commit should add an entry here
- Every TBD item that gets resolved must be logged under `tbd-resolved` with the value chosen and the reason
- Every architectural decision that isn't in the spec must be logged under `decision`
- This file is the paper trail for why the codebase looks the way it does

---

## [Unreleased]

> Work completed but not yet assigned a version number. Move entries to a versioned block on each milestone.

---

## [0.5.0] — 2026-05-01 — Milestone 2 Complete

### added
- `backend/services/authService.ts` — `registerUser` and `loginUser` implementations
  - `registerUser`: validates Rutgers email domain, password ≥8 chars, duplicate email/phone (409); bcrypt hash (12 rounds); creates user with `behavioral_score: 100`, `account_standing: active`, `is_open: false`
  - `loginUser`: finds user by email (401 on missing — same message as wrong password to prevent enumeration); 403 on banned; bcrypt verify
  - SMS verification stubbed: `// TODO: TBD — C-4.4. Stub until provider selected (PD-3)`
- `backend/middleware/auth.ts` — `authenticate` preHandler: calls `req.jwtVerify()`, distinguishes expired token (TTL error) from missing/invalid token, both 401 with context-specific messages
- `backend/routes/users.ts` — full auth routes:
  - `POST /users/register` — unprotected; validates required fields; calls `registerUser`; signs JWT; returns 201 `{ token, user }`
  - `POST /users/login` — unprotected; signs JWT; returns 200 `{ token, user }`
  - `POST /users/logout` — protected via `authenticate`; stateless (client deletes token from Keychain); 200
  - `PATCH /users/:id`, `DELETE /users/:id`, `GET /users/:id/export` — protected stubs, 501 (Milestone 3)
- `backend/prisma/migrations/20260502022946_make_onboarding_fields_nullable/migration.sql` — makes 6 onboarding fields nullable: `photo_url`, `age`, `gender_identity`, `gender_preference`, `age_range_min`, `age_range_max`

### fixed
- `backend/prisma/migrations/20260502015944_init_schema/migration.sql` — prepended `CREATE EXTENSION IF NOT EXISTS vector;` so Prisma's shadow database can replay migrations without `type "vector" does not exist` error

### decision
- ADR-009: Six onboarding fields (`photo_url`, `age`, `gender_identity`, `gender_preference`, `age_range_min`, `age_range_max`) made nullable in `users` table. Registration only collects name/email/phone/password; profile fields are set via `PATCH /users/{id}` during the post-registration onboarding flow.

---

## [0.4.0] — 2026-05-01 — Milestone 1 Complete

### added
- `backend/prisma/schema.prisma` — full schema: 8 enums, 8 models, all fields, constraints, foreign keys, and defaults matching spec Section 7
  - `User` — all fields including `embedding_vector vector(384)` via pgvector `Unsupported` type; indexes `idx_users_gender_preference` and `idx_users_age_range`
  - `Signal` — sender/receiver FKs with cascade delete, status enum, Ice Breaker viewed flags
  - `Intro` — 1:1 with Signal (`signal_id @unique`); contact fields present but deleted on mutual tap delivery
  - `Prompt`, `Venue`, `Report`, `Block`, `BEvent` — all fields per spec; BEvent FK references use `onDelete: SetNull` to preserve audit trail
- `backend/prisma/migrations/20260502015944_init_schema/migration.sql` — initial migration applied to local `foundu` database; all 8 tables verified in PostgreSQL 16
- `backend/prisma/seed.ts` — seeds 10 placeholder Ice Breaker prompts; idempotent (skips if prompts already exist)
- `backend/.env` — local dev env vars; `DATABASE_URL` points to local `foundu` database
- `.gitignore` — updated to explicitly exclude `backend/.env` and `matching_service/.env`

### changed
- `backend/package.json` — added `prisma.seed` config pointing to `tsx prisma/seed.ts`

### decision
- ADR-006: `embedding_vector` uses Prisma `Unsupported("vector(384)")` (renders as `vector(384)` in PostgreSQL). Dimension 384 is a placeholder for `all-MiniLM-L6-v2`. Confirm before Milestone 4. The Python matching service writes this field via psycopg2 directly; Prisma Client does not interact with it.
- ADR-007: pgvector HNSW/IVFFlat index on `embedding_vector` intentionally omitted from this migration — not needed until Milestone 4 (Matching). Will be added as a manual migration step in Milestone 4.
- ADR-008: Postgres 16.13 adopted locally (upgraded from 14) to match spec requirement (C-2.x) and avoid SDK build failures. pgvector 0.8.0 built from source and installed.

---

## [0.3.0] — 2026-05-01 — Milestone 0 Complete

### added
- `backend/` — Fastify 5 + TypeScript strict scaffold. All directories and files in place per spec file structure. `GET /health` returns `{"status":"ok"}`. TypeScript compiles with zero errors.
  - `server.ts`, `app.ts`, `websocket.ts`
  - `middleware/auth.ts` — stub (implemented Milestone 2)
  - `routes/` — 7 route files, all stubs (users, proximity, signals, intros, reports, blocks, venues)
  - `services/` — 6 service files, all stubs (auth, proximity, signal, safety, notification, venue)
  - `types/fastify.d.ts` — `@fastify/jwt` module augmentation for `req.user.user_id`
  - `prisma/schema.prisma` — datasource + generator only (models added Milestone 1)
  - `package.json` — Fastify 5, `@fastify/jwt` 10, `@fastify/websocket` 11, Prisma 6, TypeScript 5 strict
  - `tsconfig.json` — strict mode, ES2022, CommonJS output
- `matching_service/` — FastAPI skeleton. `GET /health` returns `{"status":"ok"}`.
  - `main.py`, `models.py`, `embedding.py`, `similarity.py`, `spotify.py` — all stubs
  - `requirements.txt` — fastapi, uvicorn, sentence-transformers, faiss-cpu, psycopg2
- `.env.example` — all required environment variables documented with descriptions
- `README.md` — full local setup instructions for all three services; milestone progress table

### fixed
- Upgraded `@fastify/jwt` from `^9` to `^10` to resolve critical `fast-jwt` vulnerability (GHSA-rp9m-7r4c-75qg and related). Zero vulnerabilities on `npm audit`.

### decision
- ADR-003: `@fastify/jwt` v10 used instead of v9 (breaking change from v9, but v9 had critical JWT security vulnerabilities in `fast-jwt ≤6.2.0`). v10 is fully compatible with Fastify 5.
- ADR-004: `tsx` used as the TypeScript runtime for development (`npm run dev`) instead of `ts-node`. Faster cold starts, no separate compilation step needed during development.
- ADR-005: Mobile scaffold (`npx react-native@0.84 init mobile`) deferred to manual setup step. Running it programmatically would require Xcode/CocoaPods to be present and verified — documented in README instead.

---

## [0.2.0] — 2026-05-01 — Implementation Plan

### added
- `FOUNDU_IMPLEMENTATION_PLAN.md` — full milestone-by-milestone build sequence covering Pre-Development Blockers through Milestone 12 (Launch). Includes deliverables, exit criteria, build dependency order, and a TBD confirmation checklist keyed to launch.

### changed
- `FOUNDU_CONTEXT.md` — added "Related files" block linking to implementation plan, changelog, and spec. Bumped version to 0.2.0.

### decision
- ADR-002: Implementation follows a strict milestone dependency order (schema → auth → profile → matching → proximity → signals → safety → notifications/venues → mobile → staging → launch). No milestone begins until the previous one's exit criteria are met. See `FOUNDU_IMPLEMENTATION_PLAN.md` for full sequence.

---

## [0.1.0] — 2026-05-01 — Initial

### added
- `FOUNDU_CONTEXT.md` — agent context file created from Software Documentation V0.0
- `CHANGELOG.md` — this file

### decision
- Placeholder values assigned to all TBD items for MVP development. Every instance flagged with `// TODO: TBD — confirm value before launch`. See Open Items table in FOUNDU_CONTEXT.md for full list of placeholders.

---

## TBD Resolution Log

> When a TBD item from the spec is officially decided, log it here with the value chosen and why. Remove the TODO comment from code once resolved.

| Item | Spec Ref | Placeholder Used | Resolved Value | Date Resolved | Reason |
|---|---|---|---|---|---|
| Match card expiry window | FR-4.7 | 45 min | — | — | — |
| Density threshold for auto-refresh | FR-4.4 | 10 users / 0.25mi | — | — | — |
| Behavioral score — suspension threshold | FR-8.5 | -50 | — | — | — |
| Behavioral score — ban threshold | FR-8.5 | -100 | — | — | — |
| Score delta — report_received | FR-8.5 | -15 | — | — | — |
| Score delta — block_received | FR-8.5 | -5 | — | — | — |
| Score delta — screenshot_detected | FR-8.5 | -20 | — | — | — |
| Score delta — passive_recovery | FR-8.5 | +2 per 24hrs | — | — | — |
| Match similarity threshold | Section 11 | 0.65 | — | — | — |
| Ice Breaker prompt list | A-3.2 | 10 placeholders | — | — | — |
| Home base update frequency limit | A-3.5 | Once per 30 days | — | — | — |
| SMS verification provider | C-4.4 | Stubbed | — | — | — |

---

## Architectural Decision Log

> Decisions made during development that are not explicitly specified in the Software Documentation. Each entry should explain what was decided and why, so future engineers understand the reasoning.

| # | Decision | Date | Reason |
|---|---|---|---|
| ADR-001 | Placeholder TBD values assigned — see table above | 2026-05-01 | Allows development to proceed without blocking on unresolved product decisions |
| ADR-002 | Strict milestone dependency order adopted | 2026-05-01 | Prevents building on unstable foundations; each milestone has defined exit criteria before the next begins |
| ADR-003 | `@fastify/jwt` v10 instead of v9 | 2026-05-01 | v9 depended on `fast-jwt ≤6.2.0` which had critical JWT security vulnerabilities; v10 resolves them and is compatible with Fastify 5 |
| ADR-004 | `tsx` as TypeScript dev runtime instead of `ts-node` | 2026-05-01 | Faster cold starts, no separate compilation step during development |
| ADR-005 | Mobile React Native init deferred to manual step | 2026-05-01 | Requires Xcode/CocoaPods environment to be present; documented in README instead of automated |
| ADR-006 | `embedding_vector` uses `Unsupported("vector(384)")` | 2026-05-01 | Renders as native pgvector type; dimension 384 is placeholder for all-MiniLM-L6-v2, confirm before Milestone 4 |
| ADR-007 | pgvector index deferred to Milestone 4 | 2026-05-01 | HNSW/IVFFlat index not needed until matching service is implemented; will be added as manual migration |
| ADR-008 | PostgreSQL upgraded from 14 to 16 | 2026-05-01 | Matches spec requirement; Postgres 14 pg_config had stale MacOSX14 SDK reference causing pgvector build failure |
| ADR-009 | Onboarding fields nullable in `users` table | 2026-05-01 | Registration collects only name/email/phone/password; remaining profile fields set during post-registration onboarding via `PATCH /users/{id}` |

---

## Version History

| Version | Date | Summary |
|---|---|---|
| 0.5.0 | 2026-05-01 | Milestone 2 complete — register, login, logout, JWT middleware, nullable onboarding fields migration |
| 0.4.0 | 2026-05-01 | Milestone 1 complete — full Prisma schema, migration applied, 10 prompts seeded |
| 0.3.0 | 2026-05-01 | Milestone 0 complete — backend and matching service scaffold, verified boot |
| 0.2.0 | 2026-05-01 | Implementation plan created — full milestone sequence through launch |
| 0.1.0 | 2026-05-01 | Project initialization — context and changelog files created |
