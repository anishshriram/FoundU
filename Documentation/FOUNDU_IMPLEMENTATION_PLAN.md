# FoundU — Implementation Plan

> Created: 2026-05-01
> Hard Launch: 2026-09-17 (first live campus session)
> Status: Pre-development — no code written yet

---

## How to Use This File

This plan is the authoritative build sequence for FoundU. Each milestone has a hard dependency on the ones before it — do not start a milestone until all blockers in the one before it are resolved. When a milestone is complete, log it in `FOUNDU_CHANGELOG.md` and mark progress here.

The plan is organized by **milestone**, not calendar week, because velocity is unknown before coding begins. The hard constraint is September 17, 2026. Work backwards from that date when scheduling.

---

## Pre-Development Blockers

These five decisions must be finalized before a single line of application code is written. Each one has downstream consequences that cannot be cleanly refactored around later.

| # | Decision | Blocks | Options |
|---|---|---|---|
| PD-1 | Cloud provider for main backend + DB | All infrastructure setup | Railway/Render (recommended for MVP speed), AWS, GCP |
| PD-2 | Python matching microservice hosting | Matching service setup | Same provider as PD-1, Modal, Hugging Face Spaces |
| PD-3 | SMS verification provider | Registration flow | Twilio, Vonage, Textbelt |
| PD-4 | Monitoring and alerting tooling | Staging setup | Provider-native (Railway metrics + Sentry), Datadog, custom |
| PD-5 | Redis at Phase I or defer | WebSocket architecture | Include from start (safer), defer to Phase II (simpler now) |

**Blocking dependency for PD-1:** The chosen provider must support the `pgvector` PostgreSQL extension. Confirm this before finalizing.

**Recommendation if no dedicated DevOps resource:** Railway or Render for PD-1 and PD-2. Both support same-day deployment from GitHub, require no IAM configuration, and cost under $100/month at Phase I scale. Migrate to AWS or GCP at Series A.

---

## Milestone 0 — Project Scaffold and Dev Environment

**Goal:** Every developer can run the full stack locally against a local Postgres instance.

**Deliverables:**
- Git repository initialized and connected to `https://github.com/anishshriram/FoundU`
- `.env.example` with all required keys documented (no real values committed)
- `.gitignore` covering `node_modules/`, `.env`, Python `__pycache__/`, `*.pyc`, `dist/`, `.DS_Store`
- `backend/` directory scaffolded: Fastify app boots, returns 200 on `GET /health`
- `matching_service/` directory scaffolded: FastAPI app boots, returns 200 on `GET /health`
- `mobile/` directory scaffolded: React Native project boots on iOS simulator
- `prisma/schema.prisma` initialized (empty, just datasource + generator blocks)
- Local PostgreSQL running with pgvector extension confirmed
- `README.md` with local setup instructions covering all three services

**Exit criteria:** Running `npm run dev` in `backend/`, `uvicorn main:app` in `matching_service/`, and opening the iOS simulator all work without error on a fresh clone.

---

## Milestone 1 — Database Schema

**Goal:** Full Prisma schema in place with all tables, indexes, and constraints matching Section 7 of the spec. Migrations run cleanly.

**Deliverables:**
- `prisma/schema.prisma` — all 8 models: `User`, `Signal`, `Intro`, `Prompt`, `Venue`, `Report`, `Block`, `BEvent`
- All enums, constraints, foreign keys, and default values match the spec exactly
- `pgvector` extension wired in for `embedding_vector` on User model
- Indexes created: `idx_users_gender_preference`, `idx_users_age_range`
- Initial migration applied and committed: `prisma/migrations/`
- Prisma Client generated and importable from backend services
- Seed script: inserts 10 placeholder Ice Breaker prompts into `prompts` table (marked `// TODO: TBD — confirm value before launch`)

**Exit criteria:** `npx prisma migrate dev` runs cleanly. `npx prisma studio` shows all tables with correct structure. Seed script populates prompts.

---

## Milestone 2 — Authentication Service

**Goal:** Register, login, and logout endpoints working end-to-end. JWT middleware protects all subsequent endpoints.

**Deliverables:**

### Registration (`POST /users/register`)
- Validates Rutgers `.edu` email domain (C-3.2)
- Validates phone number format
- Calls SMS provider (PD-3) to send verification code
- Hashes password with `bcryptjs` (min 8 characters)
- Creates user record with `account_standing: active`, `behavioral_score: 100`, `is_open: false`
- Returns JWT on success
- One account per phone number enforced (FR-1.3)

### Login (`POST /users/login`)
- Email + password validation against hash
- Returns JWT on success
- Error response on wrong credentials

### Logout (`POST /users/logout`)
- Protected by auth middleware
- Server-side: no-op (stateless JWT — no blacklist in MVP)
- Response signals client to delete token from Keychain

### Auth Middleware (`middleware/auth.ts`)
- Extracts and verifies JWT from `Authorization: Bearer <token>` header
- Attaches `{ user_id, email }` to `req.user`
- Returns 401 on missing/malformed/expired token
- Applied to every route except `/users/register` and `/users/login`

**JWT payload shape:**
```json
{ "user_id": 1, "email": "janedoe@scarletmail.rutgers.edu", "iat": 0, "exp": 0 }
```

**Exit criteria:** Register → receive JWT → use JWT on a protected route → get 200. Use expired/invalid token → get 401. Attempt duplicate phone number → get 400.

---

## Milestone 3 — User Profile Endpoints

**Goal:** Profile CRUD endpoints for onboarding flow and profile updates.

**Deliverables:**

### Profile Update (`PATCH /users/{id}`)
- Ownership enforced — `req.user.user_id` must match `id`
- Accepts any subset of profile fields (partial update)
- On save, triggers matching microservice reindex (async — fire and forget; log failure, do not block response)
- Home base update enforced max once per 30 days (marked `// TODO: TBD — confirm value before launch`)
- Returns updated user object (no password_hash in response)

### Delete Account (`DELETE /users/{id}`)
- Ownership enforced
- Cascades: all signals, intros, reports, blocks, bevents for this user
- Completes within 30 days per NFR-5.4 (immediate soft or hard delete — confirm approach)

### Export Data (`GET /users/{id}/export`)
- Ownership enforced
- Returns all user data as JSON per NFR-5.5
- Does not include `password_hash`

**Exit criteria:** Full onboarding field set can be written via PATCH. PATCH triggers a matching service call (even if microservice is stubbed). DELETE removes the user and cascades. GET export returns all user fields.

---

## Milestone 4 — Matching Microservice

**Goal:** Python FastAPI microservice produces embedding vectors and builds match pools for any given user.

**Deliverables:**

### `embedding.py`
- Serializes all completed profile fields into weighted text strings per the field weight table (Section 11)
- Personality type encoded using Range-Based Reward logic (full weight within 1 point, partial within 2, zero beyond 3)
- Spotify enrichment optional: if `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` present, fetch artist/genre/energy/valence/tempo metadata; if not, skip without error
- Produces embedding vector using `sentence-transformers` (`all-MiniLM-L6-v2` or per Section 11 spec)
- Saves `embedding_vector` and `embedding_updated_at` to user record via internal Prisma/DB write

### `similarity.py`
- Loads all active, non-banned/non-suspended user embeddings from DB
- Applies hard filters before any vector math: mutual gender_preference match, mutual age_range inclusion
- Computes cosine similarity using `faiss`
- Includes users at or above match threshold `0.65` in match pool (marked `// TODO: TBD — confirm value before launch`)
- Match pool stored on user record or in a `match_pools` lookup structure (confirm storage approach with spec Section 11)
- Full rebuild triggered per profile update; must complete within 60 seconds (NFR-1.5)

### `main.py` (FastAPI)
- `POST /reindex` — accepts `{ user_id }`, triggers embedding + pool rebuild for that user
- `GET /health` — returns 200
- Internal only — no public route, never called by mobile client
- CORS restricted to backend service IP only

### `spotify.py`
- Spotify Client Credentials flow (server-to-server, no user auth)
- Fetch top artists/tracks for a user's declared music preferences
- Extract genre, energy, valence, tempo attributes
- Graceful fallback: if Spotify unavailable, log warning and continue without music enrichment

**Exit criteria:** `POST /reindex` with a fully populated user produces an embedding vector stored in the DB. Two users with identical profiles score ~1.0. Two users with no overlapping fields score below threshold. Reindex completes in under 60 seconds for a pool of 1000 users.

---

## Milestone 5 — Proximity Service and WebSocket

**Goal:** Users can toggle Open, receive match cards over WebSocket, and toggle Off.

**Deliverables:**

### WebSocket Server (`websocket.ts`)
- Runs alongside Fastify HTTP server on the same port
- JWT validation on connection establishment — reject unauthenticated connections
- Reconnection handled gracefully: server accepts reconnects without requiring full reauthentication within a grace period
- Maintains in-memory map of `user_id → WebSocket connection`
- Message types:
  - `match_card_appear` — sent when a compatible Open user enters proximity
  - `match_card_expire` — sent when a match card's time window closes or user goes Off
  - `mutual_signal` — sent to both users simultaneously on Signal match (Milestone 6)
  - `system_status` — diagnostic/keepalive messages

### Open Toggle (`POST /proximity/open`)
- Reads current GPS coordinates from request body (coordinates are used in-memory only — never stored, never returned to client)
- Sets `is_open: true` on user record
- Queries match pool for this user filtered by:
  - Physical proximity (within 0.25mi of submitted coordinates)
  - `is_open: true` on candidate
  - `account_standing: active` on candidate
  - No block relationship (either direction) between users
- Pushes `match_card_appear` events to both users via WebSocket
- Freezes match pool: no new cards surfaced until Off + On again, or high-density auto-refresh triggers
- Match cards expire after 45 minutes (marked `// TODO: TBD — confirm value before launch`)

### Off Toggle (`DELETE /proximity/open`)
- Sets `is_open: false` on user record
- Sends `match_card_expire` to all users who currently have this user's card
- Unfreezes pool for affected users

### Get Matches (`GET /proximity/matches`)
- Returns currently active match cards for authenticated user
- Returns name, age, photo_url only — no precise location data

### High-Density Auto-Refresh
- If 10+ Open users within 0.25mi (marked `// TODO: TBD — confirm value before launch`), immediate pool refresh without requiring Off/On cycle
- Triggered by proximity calculation on each new Open event in the area

**Exit criteria:** User A and User B both Open within 0.25mi → both receive `match_card_appear` over WebSocket with each other's name/age/photo. Either goes Off → both receive `match_card_expire`. Card expires after 45 min → `match_card_expire` fires. Coordinates are confirmed absent from any DB write.

---

## Milestone 6 — Signal Service

**Goal:** Full Signal lifecycle from send to mutual to Ice Breaker to Warm Intro creation.

**Deliverables:**

### Send Signal (`POST /signals`)
- Validates receiver is in sender's active match pool (not just proximity — must be in pre-built pool)
- Creates Signal record: `status: pending`, `expires_at` = match card expiry
- Does NOT notify receiver (pending Signal is anonymous and invisible to recipient)
- If a pending Signal already exists from receiver → sender: transition both to `mutual`
  - Set `status: mutual`, `mutually_matched_at: now()` on Signal
  - Send `mutual_signal` WebSocket event to both users simultaneously (same timestamp)
  - Payload includes both users' prompt + answer (Ice Breaker reveal)
  - Create Intro record: `status: dormant`, `expires_at: now() + 24hrs`
- One Signal per sender/receiver pair per session enforced

### Get Signal (`GET /signals/{id}`)
- Ownership enforced — only sender or receiver can read
- Returns signal status, Ice Breaker content if mutual

### Get Intro (`GET /intros/{id}`)
- Ownership enforced — only signal participants can read
- Returns intro status, expiry, tap status (not revealing one-sided tap to other user)

### Tap Intro (`POST /intros/{id}/tap`)
- Ownership enforced
- Validates Intro window is not expired
- Records tap for authenticated user
- If other user has already tapped:
  - Retrieve both contact values
  - Deliver simultaneously to both users (response + WebSocket push)
  - Delete contact values from Intro record immediately after delivery
  - Set `status: mutual`, `completed_at: now()`
- If other user has not tapped:
  - Set `status: pending` (initiator_id = tapping user)
  - Return acknowledgement without revealing tap to other user

**Exit criteria:** User A sends Signal → User B sends Signal back → both receive `mutual_signal` at the same time with Ice Breaker content → Intro created dormant → A taps → B taps → both receive contact info → contact values deleted from DB → Intro status = mutual. One-sided Signal on expired card is rejected.

---

## Milestone 7 — Safety Service

**Goal:** Reports, blocks, and behavioral scoring fully operational.

**Deliverables:**

### Submit Report (`POST /reports`)
- Ownership enforced (reporter_id = req.user.user_id)
- Creates Report record
- Creates Block record (auto-block on report)
- Creates BEvent: `event_type: report_received`, `score_delta: -15` (marked `// TODO: TBD`)
- Applies score delta to reported user's `behavioral_score`
- Checks suspension threshold (-50, marked `// TODO: TBD`): if breached, set `account_standing: suspended`
- Checks ban threshold (-100, marked `// TODO: TBD`): if breached, set `account_standing: banned`
- Removes reported user from reporter's live match card view immediately
- Notifies reporter (APNs push): "Your report has been received"

### Block User (`POST /blocks`)
- Ownership enforced
- Creates Block record (UNIQUE constraint prevents duplicates)
- Creates BEvent: `event_type: block_received`, `score_delta: -5` (marked `// TODO: TBD`)
- Applies score delta
- Removes blocked user from live match card view immediately

### Passive Score Recovery
- Background job: every 24 hours, increment `behavioral_score` by +2 for any user with `account_standing: active` and `behavioral_score < 100` (all values marked `// TODO: TBD`)
- Does not apply to suspended or banned accounts

### Screenshot Detection
- Triggered by mobile client event (iOS screenshot notification)
- Creates BEvent: `event_type: screenshot_detected`, `score_delta: -20` (marked `// TODO: TBD`)
- Applies score delta, checks thresholds

**Exit criteria:** Reporting User B: creates Report + Block + BEvent, decrements B's score, B disappears from A's view. Score reaches -50: B suspended. Score reaches -100: B banned. Banned/suspended users do not appear in any match pool.

---

## Milestone 8 — Notification Service

**Goal:** APNs push notifications delivered for all triggering events.

**Deliverables:**

### `notificationService.ts`
- Fire-and-forget: no DB writes, failures logged but not propagated to caller
- Wraps APNs HTTP/2 API using `apns2` or equivalent Node.js library
- Push payloads:
  - Match card appear: "Someone nearby is open to meeting you"
  - Mutual Signal: "It's a match — check your Ice Breaker"
  - Warm Intro tap received: "Someone tapped 'I met someone tonight'"
  - Warm Intro completed: "Your contact has been exchanged"
  - Warm Intro expiring: "Your Warm Intro window closes soon" (24hr window)
  - Report received confirmation: "Your report has been received"

**Exit criteria:** All six notification types fire in staging. A failing APNs call does not cause the triggering request to fail or return an error to the client.

---

## Milestone 9 — Venue Service

**Goal:** Venue database seeded, readable via API.

**Deliverables:**

### Pre-launch Seeding Script
- Reads venue data from Google Places and/or Foursquare APIs using `GOOGLE_PLACES_API_KEY` / `FOURSQUARE_API_KEY`
- Targets Rutgers New Brunswick campus area venues (bars, libraries, campus spaces, restaurants)
- Writes to `venues` table with correct `category` enum values
- One-time script — not a runtime dependency

### Get Venues (`GET /venues`)
- Returns all `is_active: true` venues
- Optionally filtered by category
- No auth-sensitive logic — but protected by auth middleware per the endpoint table
- Used by mobile client for context (density display, home base selection during onboarding)

**Exit criteria:** Seeding script populates 20+ real Rutgers venues. `GET /venues` returns them. `GET /venues?category=bar` filters correctly.

---

## Milestone 10 — Mobile App

**Goal:** Full iOS app implementing all screens in the onboarding and core use flows, connecting to the live backend.

**Screen build order follows the critical path (auth → onboarding → home → core flows → safety → profile):**

### Auth Screens
1. `Register` — email, phone, password; calls `POST /users/register`
2. `Login` — email, password; calls `POST /users/login`; stores JWT in Keychain

### Onboarding Screens (enforced order by navigation)
3. `OnboardingPhoto` — photo upload (manual review queue)
4. `OnboardingPrompt` — select prompt from list, write answer
5. `OnboardingRequired` — required profile fields (age, gender_identity, gender_preference, age_range, interests, etc.); calls `PATCH /users/{id}`
6. `OnboardingOptional` — skippable optional fields; calls `PATCH /users/{id}`
7. `OnboardingLocation` — location permission request + NJDPA opt-in consent text + home base capture

### Core Screens
8. `Home` — Open/Off toggle, active match cards; WebSocket connection established on mount
9. `MatchCard` — name, age, photo; Signal button, "I'm not interested" button
10. `IceBreaker` — mutual Signal reveal; both users' prompts + answers displayed
11. `WarmIntro` — "I met someone tonight" tap; contact type selection (Instagram or phone)
12. `WarmIntroComplete` — contact exchange confirmation

### Safety Screens
13. `Report` — reason selection, optional detail; calls `POST /reports`

### Profile and Settings
14. `Profile` — editable profile fields; calls `PATCH /users/{id}`
15. `Settings` — logout, delete account, data export, Signal opt-out

**Mobile implementation rules:**
- JWT stored via `react-native-keychain`, attached to every Axios request via interceptor
- GPS read at Open toggle only — coordinates sent to backend, never stored on device beyond the request
- WebSocket connection opened on Home mount, closed on app background
- All third-party API calls (Spotify, venues) go through the backend — never from the mobile client
- NJDPA opt-in consent must be explicit tap (not pre-checked) at `OnboardingLocation`

**Exit criteria:** Full happy path works end-to-end on iOS simulator: Register → Onboarding → Home → Open → see match card → Signal → mutual Signal → Ice Breaker → Warm Intro → contact exchange. Report flow removes reported user from view.

---

## Milestone 11 — Staging Environment and Pre-launch Testing

**Goal:** Full system running in a cloud environment on synthetic data. Internal field test ready.

**Deliverables:**
- Staging environment provisioned on chosen cloud provider (PD-1, PD-2)
- All environment variables set in provider secrets manager (not `.env` files)
- CI/CD pipeline configured: full test suite runs on every PR; deploy to staging on merge to main
- Staging database seeded with synthetic test user data (no real user data)
- End-to-end test coverage for:
  - Registration + login
  - Onboarding completion
  - Open toggle + match card surfacing
  - Signal → mutual Signal → Ice Breaker → Warm Intro → contact exchange
  - Report → block → score degradation → suspension
- Monitoring and alerting live (PD-4): uptime, error rate, WebSocket connection count, reindex job times
- Compliance checklist verified:
  - [ ] NJDPA opt-in consent collected at onboarding
  - [ ] Privacy policy accessible in app
  - [ ] Terms of service accessible in app
  - [ ] Account deletion completes within 30 days
  - [ ] Personal data export available

**Exit criteria:** Internal field test session conducted with real devices on Rutgers campus (or simulated equivalent). All critical path flows complete without error. Monitoring dashboard shows live metrics. Post-session data report generated.

---

## Milestone 12 — Launch

**Goal:** Production environment live, first real campus session on September 17, 2026.

**Deliverables:**
- Production environment provisioned and verified (separate from staging)
- Production database empty (no synthetic data)
- Daily automated database backups confirmed
- Manual backup taken before first deploy
- APNs production credentials active (not sandbox)
- All TBD values confirmed and TODO comments resolved (or explicitly accepted as final):

| TBD Item | Placeholder | Must confirm by |
|---|---|---|
| Match card expiry window | 45 min | Before Milestone 5 |
| High user density threshold | 10 users / 0.25mi | Before Milestone 5 |
| Behavioral score suspension threshold | -50 | Before Milestone 7 |
| Behavioral score ban threshold | -100 | Before Milestone 7 |
| Score delta — report_received | -15 | Before Milestone 7 |
| Score delta — block_received | -5 | Before Milestone 7 |
| Score delta — screenshot_detected | -20 | Before Milestone 7 |
| Score delta — passive_recovery | +2 per 24hrs | Before Milestone 7 |
| Match similarity threshold | 0.65 | Before Milestone 4 |
| Ice Breaker prompt list | 10 placeholders | Before Milestone 2 |
| Home base update frequency | Once per 30 days | Before Milestone 3 |
| SMS verification provider | Stubbed | Before Milestone 2 |

- Production deployment gated behind CI/CD pipeline (passing test suite required)
- No deployment during peak windows (Friday/Saturday/Sunday evenings, Tuesday/Thursday evenings per NFR-2.2)
- On-call team member designated and reachable for September 17 session

---

## Build Sequence Summary

```
PD-1 through PD-5 (infrastructure decisions)
       ↓
Milestone 0 (scaffold)
       ↓
Milestone 1 (schema)
       ↓
Milestone 2 (auth)          ← SMS provider (PD-3) required here
       ↓
Milestone 3 (profile CRUD)
       ↓
Milestone 4 (matching)      ← Python microservice hosting (PD-2) required here
       ↓
Milestone 5 (proximity + WS)
       ↓
Milestone 6 (signals)
       ↓
Milestone 7 (safety)
       ↓
Milestone 8 (notifications)
Milestone 9 (venues)        ← Can run in parallel with M8
       ↓
Milestone 10 (mobile)       ← Can begin UI scaffold in parallel with M2–M9
       ↓
Milestone 11 (staging + testing)
       ↓
Milestone 12 (launch — 2026-09-17)
```

---

## Out of Scope for MVP — Do Not Build

These items are explicitly excluded per the spec. Do not scope them in, even if they seem quick:

- Android app
- Web interface
- In-app messaging between users
- Companion mode
- Venue partnership program / in-venue instant reporting
- Stable matching algorithm (Gale-Shapley)
- Behavioral score influencing match pool ranking (score only affects account_standing filter in MVP)
- User-submitted venue additions
- Subscription tier / paywall logic
- Social media login (Apple, Google)
- Multi-campus expansion logic
- General release trigger logic
- Range-based subscription tiers
- Refresh token mechanism
- Token blacklist on logout
- Redis Pub/Sub (unless PD-5 resolves to include at Phase I)
