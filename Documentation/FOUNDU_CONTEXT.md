# FoundU — Agent Context File
> Last Updated: 2026-05-01
> Version: 0.2.0
> Paired With: Software_Documentation_Master_V0_0_.pdf (the canonical source of truth)

---

## How to Use This File

This file is your working context for building FoundU. It gives you the essentials — architecture, entities, services, open decisions, and coding rules — so you can work efficiently without reading the full spec on every task.

**Related files:**
- `FOUNDU_IMPLEMENTATION_PLAN.md` — milestone-by-milestone build sequence with deliverables, exit criteria, and dependency order. Read this before starting any milestone.
- `FOUNDU_CHANGELOG.md` — paper trail of all coding sessions, decisions, and resolved TBD items.
- `FoundUSoftwareDocumentation.pdf` — canonical source of truth for all requirements.

**However, you must read the full Software Documentation for:**
- Any functional requirement (FR-X.X) referenced in a task
- Any non-functional requirement (NFR-X.X) referenced in a task
- The complete matching algorithm (Section 11) before touching embedding.py or similarity.py
- The complete database schema (Section 7) before writing any Prisma schema or migration
- The complete API specification (Section 8) before writing any route or controller
- All use case details (Section 6) before implementing any user-facing flow
- All constraints (Section 3) and out-of-scope items (Section 4) before adding any feature not listed here

When in doubt, read the spec. This file summarizes. The spec is authoritative.

---

## What FoundU Is

A proximity-based iOS dating app. The algorithm matches users behind the scenes. When two compatible users are both **Open** and within ~0.25 miles of each other, their name, age, and photo appear on each other's screen. Users can send an anonymous **Signal**. If mutual, both are notified simultaneously, an **Ice Breaker** surfaces, and a 24-hour **Warm Intro** window opens. If both tap "I met someone tonight," contact info is exchanged. No swiping. No messaging. The approach happens in real life.

---

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Database | PostgreSQL 16 | pgvector extension required for embedding_vector |
| ORM | Prisma | Source of truth for schema; use migrations |
| Backend Runtime | Node.js 20 | |
| Backend Framework | Fastify | Not Express |
| Backend Language | TypeScript | Strict mode |
| Real-Time | WebSockets (ws) | Proximity updates and mutual Signal notifications |
| Matching Service | Python 3.12, FastAPI | Separate microservice, internal only |
| Embedding | sentence-transformers | See Section 11 of spec before implementing |
| Vector Search | faiss | Cosine similarity over embedding vectors |
| Auth | JWT (HS256) | 24-hour expiry, stored in iOS Keychain, no refresh token in MVP |
| Password Hashing | bcryptjs | Minimum 8 characters |
| Mobile | React Native 0.84 | iOS only |
| Secure Storage | react-native-keychain | JWT storage on device |
| GPS | @react-native-community/geolocation | |
| Navigation | @react-navigation/native-stack | |
| HTTP Client | Axios | |
| Push Notifications | APNs | No fallback in MVP |
| SMS Verification | TBD provider | Must be selected before auth service is built |
| Music Metadata | Spotify API | Optional enrichment only; graceful fallback required |
| Venue Seeding | Google Places / Foursquare | Pre-launch seeding only, no runtime dependency |

---

## Backend File Structure

```
backend/
  server.ts               — Entry point; calls app.listen()
  app.ts                  — Fastify app definition and plugin registration
  websocket.ts            — WebSocket server setup and connection management
  middleware/
    auth.ts               — JWT validation middleware
  routes/
    users.ts
    proximity.ts
    signals.ts
    intros.ts
    reports.ts
    blocks.ts
    venues.ts
  services/
    authService.ts
    proximityService.ts
    signalService.ts
    safetyService.ts
    notificationService.ts
    venueService.ts
  types/
    express.d.ts          — Extends Fastify request with req.user.user_id
  prisma/
    schema.prisma         — Prisma schema (source of truth for DB)
    migrations/

matching_service/
  main.py                 — FastAPI entry point
  embedding.py            — sentence-transformers vector generation
  similarity.py           — faiss cosine similarity and match pool building
  spotify.py              — Spotify API metadata enrichment
  models.py               — Pydantic request/response models
```

---

## Mobile App Screens

| Screen | Route Name | Key Action |
|---|---|---|
| Registration | Register | POST /users/register |
| Login | Login | POST /users/login |
| Onboarding — Photo | OnboardingPhoto | Photo upload for manual review |
| Onboarding — Prompt | OnboardingPrompt | Select Ice Breaker prompt + write answer |
| Onboarding — Required Fields | OnboardingRequired | PATCH /users/{id} |
| Onboarding — Optional Fields | OnboardingOptional | Skippable |
| Onboarding — Location | OnboardingLocation | Location permission + NJDPA opt-in consent |
| Home | Home | Open/Off toggle, active match cards |
| Match Card | MatchCard | Signal action, I'm not interested action |
| Ice Breaker | IceBreaker | Mutual Signal reveal — both prompts + answers |
| Warm Intro | WarmIntro | "I met someone tonight" tap |
| Warm Intro Complete | WarmIntroComplete | Contact exchange confirmation |
| Report | Report | POST /reports |
| Profile | Profile | PATCH /users/{id} |
| Settings | Settings | Logout, delete account, export data, Signal opt-out |

**Onboarding flow order (enforced by navigation):**
Register → OnboardingPhoto → OnboardingPrompt → OnboardingRequired → OnboardingOptional → OnboardingLocation → Home

---

## Core Entities (Summary)

> ⚠️ Read Section 7 of the spec in full before writing the Prisma schema. What follows is a summary only.

### users
Key fields: `id`, `name`, `email`, `phone_number`, `password_hash`, `photo_url`, `prompt_id` (FK → prompts), `prompt_answer`, `age`, `gender_identity`, `preferences` (JSONB), `gender_preference`, `age_range_min`, `age_range_max`, `home_base_latitude`, `home_base_longitude`, `embedding_vector`, `embedding_updated_at`, `is_open`, `behavioral_score`, `account_standing` (enum: active/suspended/banned), `created_at`, `last_active_at`

### signals
Key fields: `id`, `sender_id` (FK → users), `receiver_id` (FK → users), `status` (enum: pending/mutual/expired), `sender_viewed_icebreaker`, `receiver_viewed_icebreaker`, `created_at`, `expires_at`, `mutually_matched_at`

### intros
Key fields: `id`, `signal_id` (FK → signals, 1:1), `initiator_id` (FK → users, nullable), `sender_contact_type` (enum: instagram/phone_number), `receiver_contact_type` (enum: instagram/phone_number), `status` (enum: dormant/pending/mutual/expired), `created_at`, `expires_at`, `completed_at`

### prompts
Key fields: `id`, `prompt_text`, `is_active`

### venues
Key fields: `id`, `name`, `category` (enum: bar/party/library/campus_space/restaurant/other), `latitude`, `longitude`, `address`, `source` (enum: google_places/foursquare), `external_id`, `is_active`, `created_at`, `updated_at`

### reports
Key fields: `id`, `reporter_id`, `reported_id`, `signal_id` (nullable), `warm_intro_id` (nullable), `reason` (enum: inappropriate_behavior/harassment/fake_profile/spam/other), `reason_detail` (nullable), `created_at`

### blocks
Key fields: `id`, `blocker_id`, `blocked_id`, `created_at`

### bevents
Key fields: `id`, `user_id`, `event_type` (enum: report_received/block_received/screenshot_detected/multiple_accounts_detected/passive_recovery), `score_delta`, `triggered_by_id` (nullable), `report_id` (nullable), `block_id` (nullable), `created_at`

---

## Services (Summary)

> ⚠️ Read Section 10.3 of the spec for full service definitions before implementing any service.

| Service | Responsibility | Critical Path? |
|---|---|---|
| Authentication | Registration, login, logout, JWT, session validation | Yes — gates all other services |
| Proximity | Open toggle, match card surfacing via WebSocket, pool freeze/unfreeze | Yes |
| Matching & Embedding | Python microservice — embedding vectors, cosine similarity, match pool building | Yes |
| Signal | Signal lifecycle, mutual Signal detection, Ice Breaker unlock, Warm Intro creation | Yes |
| Safety | Reports, blocks, behavioral scoring, account standing management | Yes |
| Notification | APNs push dispatch — fire and forget, no DB writes | No |
| Venue | Seeded venue database reads, density detection context | No |

---

## Key Application Flows (Summary)

> ⚠️ Read Section 10.4 of the spec for the full step-by-step flows before implementing.

**Open Toggle:** POST /proximity/open → auth middleware → record is_open → build filtered candidate pool (blocks + account_standing + match pool) → push match cards via WebSocket → freeze pool

**Send Signal → Mutual Signal:** POST /signals → validate receiver in match pool → create Signal (pending) → monitor for return Signal → on mutual: transition to mutual, notify both simultaneously, unlock Ice Breaker, create Warm Intro (dormant, 24hr expiry)

**Warm Intro Tap:** POST /intros/{id}/tap → validate window open → record tap → on mutual tap: retrieve contact info, deliver simultaneously, delete from Intro record, transition to mutual

**Report:** POST /reports → remove reported user from live view → create Report → create Block → create BEvent → apply score_delta → check suspension threshold → notify reporter

**Profile Update → Reindex:** PATCH /users/{id} → save changes → call matching microservice → recompute embedding → rebuild match pool

---

## API Endpoints (Summary)

> ⚠️ Read Section 8 of the spec for full request/response shapes, auth requirements, and error handling before implementing any endpoint.

| Method | Endpoint | Service |
|---|---|---|
| POST | /users/register | Auth |
| POST | /users/login | Auth |
| POST | /users/logout | Auth |
| PATCH | /users/{id} | Profile |
| DELETE | /users/{id} | Profile |
| GET | /users/{id}/export | Profile |
| POST | /proximity/open | Proximity |
| POST | /proximity/off | Proximity |
| GET | /proximity/matches | Proximity |
| POST | /signals | Signal |
| GET | /signals/{id} | Signal |
| GET | /intros/{id} | Signal |
| POST | /intros/{id}/tap | Signal |
| POST | /reports | Safety |
| POST | /blocks | Safety |
| GET | /venues | Venue |

All endpoints except /users/register and /users/login are protected by auth middleware. Auth middleware extracts `user_id` from JWT and attaches to `req.user.user_id`. Controllers never manually verify tokens.

---

## Matching Algorithm (Summary)

> ⚠️ Read Section 11 of the spec in full before writing a single line of embedding.py or similarity.py. What follows is orientation only.

1. All completed profile fields are serialized and encoded into a single embedding vector using sentence-transformers
2. Spotify metadata (genre, energy, valence, tempo, artist) optionally enriches the music component — graceful fallback if unavailable
3. Cosine similarity is computed between user vectors using faiss
4. Hard filters applied BEFORE similarity scoring: gender_preference and age_range (mutual — both users must fall within each other's preferences)
5. Users above the match threshold are added to the match pool
6. Match pool is fully rebuilt on every profile update
7. Individual reindex must complete within 60 seconds (NFR-1.5)
8. The matching microservice is internal only — never called directly by the mobile client

---

## Auth and Session Management (Summary)

> ⚠️ Read Section 12 of the spec before implementing auth.

- JWT signed with HS256, 24-hour expiry
- Stored in iOS Keychain on device
- No refresh token mechanism in MVP
- Included in Authorization header on every protected request
- Middleware extracts user_id and attaches to req.user.user_id
- Ownership enforced on all resource-specific endpoints — user_id 1 cannot touch user_id 2's resources
- Rutgers .edu email required at registration (C-3.2)
- One account per phone number and per device enforced (FR-1.3, FR-1.4)

---

## Privacy Rules (Non-Negotiable)

These are hard constraints — do not implement anything that violates them:

- Precise GPS coordinates are **never** transmitted to the client and **never** stored. Discard immediately after proximity calculation.
- No history of proximity events is ever logged or retained. Proximity is ephemeral.
- One-sided Signal data is not retained beyond match card expiry.
- Contact information exchanged via Warm Intro is delivered to device and deleted from the Intro record immediately after delivery confirmation.
- Gender identity, sexual orientation preference, and precise geolocation are sensitive data under NJDPA — never used beyond core matching and proximity functions.

---

## Open Items — Do Not Hardcode Without Flagging

These values are TBD in the spec. Use the placeholder values below for MVP development but mark every instance with `// TODO: TBD — confirm value before launch` so they are easy to find and replace.

| Item | Spec Reference | Placeholder for MVP |
|---|---|---|
| Match card expiry window | FR-4.7 | 45 minutes |
| High user density threshold for auto-refresh | FR-4.4 | 10 Open users within 0.25 miles |
| Behavioral score suspension threshold | FR-8.5 | -50 |
| Behavioral score ban threshold | FR-8.5 | -100 |
| Score delta — report_received | FR-8.5 | -15 |
| Score delta — block_received | FR-8.5 | -5 |
| Score delta — screenshot_detected | FR-8.5 | -20 |
| Score delta — passive_recovery | FR-8.5 | +2 per 24hrs |
| Match similarity threshold | Section 11 | 0.65 |
| Ice Breaker prompt list | A-3.2 | Seed with 10 placeholder prompts |
| Home base update frequency limit | A-3.5 | Once per 30 days |
| SMS verification provider | C-4.4 | TBD — stub for now |

---

## Out of Scope for MVP — Do Not Build

- Android app
- Web interface
- In-app messaging between users
- Companion mode
- Venue partnership program
- In-venue instant reporting with venue staff
- Stable matching algorithm (Gale-Shapley)
- Behavioral scoring influencing match pool composition
- User-submitted venue additions
- Subscription tier enforcement / paywall logic
- Social media login (Login with Apple, Login with Google)
- Multi-campus expansion logic
- General release trigger logic
- Range-based subscription tiers

---

## Coding Rules for This Project

1. **TypeScript strict mode** throughout the backend — no `any` types
2. **Never expose raw SQL** — all database access goes through Prisma
3. **Never call third-party APIs from the mobile client** — Spotify, Google Places, Foursquare, SMS provider are all server-side only
4. **Never store or transmit precise GPS coordinates** to the client
5. **Auth middleware on every protected route** — no exceptions
6. **Ownership enforcement on every resource endpoint** — validate req.user.user_id matches the resource owner
7. **WebSocket for proximity and Signal events only** — all other communication is REST
8. **Matching microservice is internal only** — no public endpoint, called only by the Node.js backend
9. **All TBD values must be flagged** with `// TODO: TBD — confirm value before launch`
10. **No scheduled maintenance during peak windows** — Friday, Saturday, Sunday evenings and Tuesday, Thursday evenings (NFR-2.2)

---

## Phase I Constraints (Rutgers MVP Only)

- All users must have a Rutgers .edu email (C-3.2)
- User base capped at 1,000 (Phase I) — no open registration
- Proximity operates exclusively within Rutgers campus area (C-2.1)
- Proximity radius capped at 0.25 miles (C-2.2)
- iOS only (C-1.1)
- App Store rating: 17+ (C-1.4)
- Home base used for Phase III range matching — required during onboarding but not enforced for proximity in Phase I

---

## Regulatory Compliance Checklist

Before any service touches sensitive data, confirm:
- [ ] NJDPA opt-in consent collected at onboarding for location data (NFR-5.6)
- [ ] Privacy policy accessible within app (NF-5.8)
- [ ] Terms of service accessible within app
- [ ] Data protection assessment documented before proximity and matching services go to production (C-5.6)
- [ ] Account deletion completes within 30 days (NFR-5.4)
- [ ] Personal data export available on request (NFR-5.5)
