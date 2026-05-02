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

## [0.9.0] — 2026-05-02 — Milestone 6 Complete

### added
- `backend/services/signalService.ts` — full Signal/Intro lifecycle:
  - `sendSignal`: validates receiver in match pool; enforces one-signal-per-pair; detects mutual (reverse pending signal exists) → transitions both to `mutual`, creates dormant 24hr Intro, pushes `mutual_signal` WS event to both simultaneously with Ice Breaker payload
  - `getSignal`: ownership enforced; marks `sender_viewed_icebreaker` / `receiver_viewed_icebreaker` on read; returns other user's Ice Breaker when mutual
  - `getIntro`: ownership enforced; exposes `you_tapped` without revealing other side's tap status
  - `tapIntro`: phone_number required, instagram optional; first tap → `pending`; mutual tap → delivers both contacts simultaneously via response + WS push, then immediately nulls all four contact columns (FR-6.x)
- `backend/routes/signals.ts` — `POST /signals`, `GET /signals/:id`
- `backend/routes/intros.ts` — `GET /intros/:id`, `POST /intros/:id/tap`

### changed
- `backend/prisma/schema.prisma` — `Intro` model: replaced `sender_contact_type/value` + `receiver_contact_type/value` with `sender_phone_number`, `sender_instagram`, `receiver_phone_number`, `receiver_instagram`; removed `ContactType` enum (no longer needed)
- `backend/prisma/migrations/20260502172642_.../migration.sql` — drops old contact columns + enum, adds new explicit columns

### decision
- ADR-015: `ContactType` enum removed; contact fields made explicit (`phone_number` required, `instagram` optional/nullable). Simpler than a generic type+value pair and enforces the product rule at the schema level.

---

## [0.8.0] — 2026-05-02 — Milestone 5 Complete

### added
- `backend/websocket.ts` — WebSocket connection manager: JWT auth via first-message `{ type: "auth", token }` handshake; in-memory `Map<userId, WebSocket>`; ping/pong keepalive; `send(userId, message)` helper used by proximity and signal services
- `backend/services/proximityService.ts` — full proximity state machine:
  - `goOpen`: sets `is_open: true`, stores coords in-memory only (never DB), filters match pool by proximity (Haversine ≤0.25mi), `is_open`, `active`, no-block; pushes `match_card_appear` to both users; high-density auto-refresh if ≥10 open users nearby
  - `goOff`: sets `is_open: false`, clears coords, cancels all timers, pushes `match_card_expire` to affected users
  - `getActiveCards`: returns current cards (name, age, photo_url only — no location)
  - Cards expire after 45 minutes via `setTimeout`; `match_card_expire` fired to both sides on expiry
- `backend/routes/proximity.ts` — `POST /proximity/open`, `DELETE /proximity/open`, `GET /proximity/matches` — all protected by `authenticate`
- `backend/app.ts` — registered `@fastify/websocket` plugin; `GET /ws` WebSocket endpoint via `registerWebSocket`

### changed
- `backend/package.json` — added `@types/ws` dev dependency (required for strict TypeScript on WebSocket message handler)

### decision
- ADR-014: WebSocket connection state and open-user GPS coordinates stored in-memory on the Node process (single-server MVP). Redis pub/sub needed for multi-instance scaling but deferred until PD-4 is resolved.

---

## [0.7.0] — 2026-05-01 — Milestone 4 Complete

### added
- `matching_service/db.py` — psycopg2 DB utilities: `fetch_user`, `fetch_all_active_users_with_embeddings`, `write_embedding`, `upsert_match_pool`, `fetch_match_pool`; uses pgvector Python adapter
- `matching_service/spotify.py` — Spotify Client Credentials flow; fetches genre, energy, valence, tempo metadata for declared artists; graceful None fallback when credentials absent or API unavailable
- `matching_service/embedding.py` — profile → weighted text → `all-MiniLM-L6-v2` (384-dim) embedding; field weight tiers per Section 11; Spotify enrichment applied when available; vector written to `users.embedding_vector` via psycopg2
- `matching_service/similarity.py` — FAISS `IndexFlatIP` on L2-normalized vectors (= cosine similarity); mutual gender preference and mutual age range hard filters; match pool persisted to `match_pools` table; threshold 0.65 (placeholder, TODO: TBD)
- `matching_service/main.py` — `POST /reindex` (generate embedding + rebuild pool, fire-and-forget from Node backend); `GET /match-pool/{user_id}` (read pre-computed pool for proximity service); sentence-transformers model warmed up at startup
- `matching_service/models.py` — added `MatchCandidate`, `MatchPoolResponse`
- `backend/prisma/schema.prisma` — added `MatchPool` model (user_id unique, candidates JSONB, cascade delete)
- `backend/prisma/migrations/20260502025024_add_match_pools_and_hnsw_index/migration.sql` — creates `match_pools` table; adds HNSW index on `users.embedding_vector` (ADR-007 resolved)
- `matching_service/requirements.txt` — added `pgvector==0.3.6`

### decision
- ADR-007 resolved: HNSW index added via `CREATE INDEX ON users USING hnsw (embedding_vector vector_cosine_ops)` in Milestone 4 migration as planned.
- ADR-012: Match pools stored in PostgreSQL `match_pools` table (JSONB) rather than Redis or in-memory. Avoids Redis dependency (PD-4 still open). Proximity service reads via `GET /match-pool/{user_id}`.
- ADR-013: `all-MiniLM-L6-v2` confirmed as embedding model (384 dimensions). Matches schema placeholder — no migration needed. Dimension locked for Milestone 4+.

---

## [0.6.0] — 2026-05-01 — Milestone 3 Complete

### added
- `backend/services/profileService.ts` — profile CRUD service layer
  - `updateUser`: partial update of all profile fields; home base enforced max once per 30 days (429 with days-remaining message if violated); fires-and-forgets POST to `MATCHING_SERVICE_URL/reindex` after any update (logs failure, never blocks response)
  - `deleteUser`: hard delete — FK cascades remove all user-owned rows across all tables
  - `exportUser`: returns all user fields (no `password_hash`) plus all related records (signals, intros, reports, blocks, bevents) per NFR-5.5
- `backend/prisma/schema.prisma` — added `home_base_updated_at DateTime?` to `User` model for home base cooldown tracking
- `backend/prisma/migrations/20260502023631_add_home_base_updated_at/migration.sql` — migration applied

### changed
- `backend/routes/users.ts` — replaced three 501 stubs with full implementations:
  - `PATCH /:id` — ownership enforced (403 if JWT `user_id` ≠ path `id`); delegates to `updateUser`
  - `DELETE /:id` — ownership enforced; delegates to `deleteUser`; returns 204
  - `GET /:id/export` — ownership enforced; delegates to `exportUser`

### decision
- ADR-010: Hard delete chosen for account deletion. Schema FKs already use `CASCADE`/`SET NULL` to handle all related records cleanly. Immediate deletion satisfies NFR-5.4 (must complete within 30 days).
- ADR-011: `home_base_updated_at` column added to `users` table to enforce the 30-day home base update cooldown (A-3.5 placeholder). Checked on every PATCH that touches lat/lon; set to `now()` on success.

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
| ADR-010 | Hard delete for account deletion | 2026-05-01 | FK cascades handle all related rows; immediate deletion satisfies NFR-5.4 (30-day completion requirement) |
| ADR-011 | `home_base_updated_at` column tracks home base cooldown | 2026-05-01 | Needed to enforce the 30-day update limit (A-3.5 placeholder); set on every successful home base write |
| ADR-012 | Match pools stored in PostgreSQL `match_pools` (JSONB) | 2026-05-01 | Avoids Redis dependency (PD-4 open); proximity service reads via GET /match-pool/{user_id} |
| ADR-013 | `all-MiniLM-L6-v2` confirmed as embedding model (384-dim) | 2026-05-01 | Matches schema placeholder; dimension locked, no migration needed |
| ADR-014 | WS connections and GPS coords stored in-memory (single-server) | 2026-05-02 | Redis pub/sub needed for multi-instance but deferred until PD-4 resolved |
| ADR-015 | Intro contact fields explicit (phone_number + instagram) | 2026-05-02 | Enforces phone required / instagram optional at schema level; simpler than generic ContactType enum |

---

## Version History

| Version | Date | Summary |
|---|---|---|
| 0.9.0 | 2026-05-02 | Milestone 6 complete — Signal lifecycle, mutual match, Ice Breaker, Warm Intro, contact exchange |
| 0.8.0 | 2026-05-02 | Milestone 5 complete — WebSocket server, proximity open/off, match card appear/expire, Haversine filter |
| 0.7.0 | 2026-05-01 | Milestone 4 complete — matching microservice, embeddings, FAISS similarity, match pools, HNSW index |
| 0.6.0 | 2026-05-01 | Milestone 3 complete — profile PATCH/DELETE/export, home base cooldown, matching reindex fire-and-forget |
| 0.5.0 | 2026-05-01 | Milestone 2 complete — register, login, logout, JWT middleware, nullable onboarding fields migration |
| 0.4.0 | 2026-05-01 | Milestone 1 complete — full Prisma schema, migration applied, 10 prompts seeded |
| 0.3.0 | 2026-05-01 | Milestone 0 complete — backend and matching service scaffold, verified boot |
| 0.2.0 | 2026-05-01 | Implementation plan created — full milestone sequence through launch |
| 0.1.0 | 2026-05-01 | Project initialization — context and changelog files created |
