# FoundU

A proximity-based iOS dating app for Rutgers University students. No swiping. No messaging. The algorithm matches users and the approach happens in real life.

---

## Project Structure

```
FoundU/
  backend/              — Node.js 20 + Fastify + TypeScript API server
  matching_service/     — Python 3.12 + FastAPI matching microservice
  mobile/               — React Native 0.84 iOS app
  Documentation/        — Spec, context, changelog, implementation plan
```

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- PostgreSQL 16 with the `pgvector` extension
- Xcode 15+ and CocoaPods (for mobile only)

### 1. Clone and configure environment

```bash
git clone https://github.com/anishshriram/FoundU.git
cd FoundU
cp .env.example .env
# Fill in DATABASE_URL and JWT_SECRET in .env
```

### 2. Start the backend

```bash
cd backend
npm install
npm run dev
# Fastify server starts on http://localhost:3000
# Verify: curl http://localhost:3000/health → { "status": "ok" }
```

### 3. Set up the database

```bash
cd backend
npx prisma migrate dev   # applies all migrations
npx prisma db seed       # seeds prompts table (10 Ice Breaker prompts)
```

### 4. Start the matching microservice

```bash
cd matching_service
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Verify: curl http://localhost:8000/health → { "status": "ok" }
```

### 5. Set up the mobile app

> The mobile project must be initialized once before it can run. Run this from the project root:

```bash
npx react-native@0.84 init mobile --skip-install
cd mobile
npm install
cd ios && pod install && cd ..
npx react-native run-ios
```

---

## Useful Commands

### Backend

| Command | Description |
|---|---|
| `npm run dev` | Start with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled output |
| `npx prisma studio` | Open Prisma database browser |
| `npx prisma migrate dev` | Apply pending migrations |
| `npx prisma generate` | Regenerate Prisma Client |

### Matching Service

| Command | Description |
|---|---|
| `uvicorn main:app --reload` | Start with hot reload |
| `uvicorn main:app --port 8000` | Start on port 8000 |

---

## Environment Variables

See `.env.example` for all required variables with descriptions. Key variables:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Always | PostgreSQL connection string |
| `JWT_SECRET` | Always | HS256 signing key (min 32 chars) |
| `MATCHING_SERVICE_URL` | Backend | URL to reach the Python microservice |
| `SPOTIFY_CLIENT_ID/SECRET` | Optional | Music metadata enrichment |
| `APNS_*` | Production | Apple push notification credentials |
| `SMS_PROVIDER_API_KEY` | Milestone 2 | TBD SMS provider key |

---

## Implementation Progress

See `Documentation/FOUNDU_IMPLEMENTATION_PLAN.md` for the full build sequence.

| Milestone | Status | Description |
|---|---|---|
| Pre-Dev Blockers | ⚠️ Pending decisions | Cloud provider, SMS provider, Redis decision |
| 0 — Scaffold | ✅ Complete | Backend + matching service boot, project structure |
| 1 — Schema | 🔲 Not started | Prisma schema, all 8 tables, migrations |
| 2 — Auth | 🔲 Not started | Register, login, JWT middleware |
| 3 — Profile | 🔲 Not started | PATCH /users, DELETE, export |
| 4 — Matching | 🔲 Not started | Embeddings, cosine similarity, match pools |
| 5 — Proximity | 🔲 Not started | WebSocket, Open/Off toggle, match cards |
| 6 — Signals | 🔲 Not started | Signal lifecycle, Ice Breaker, Warm Intro |
| 7 — Safety | 🔲 Not started | Reports, blocks, behavioral scoring |
| 8 — Notifications | 🔲 Not started | APNs push dispatch |
| 9 — Venues | 🔲 Not started | Venue seeding, GET /venues |
| 10 — Mobile | 🔲 Not started | All iOS screens |
| 11 — Staging | 🔲 Not started | Cloud deploy, E2E tests, monitoring |
| 12 — Launch | 🔲 Not started | Sept 17, 2026 |

---

## Documentation

| File | Purpose |
|---|---|
| `Documentation/FoundUSoftwareDocumentation.pdf` | Canonical spec — source of truth for all requirements |
| `Documentation/FOUNDU_CONTEXT.md` | Agent context — architecture summary, coding rules |
| `Documentation/FOUNDU_IMPLEMENTATION_PLAN.md` | Build sequence — milestones, deliverables, exit criteria |
| `Documentation/FOUNDU_CHANGELOG.md` | Paper trail — all decisions and resolved TBD items |

---

## Key Rules

- **TypeScript strict mode** throughout the backend — no `any` types
- **Never store or transmit precise GPS coordinates** to the client
- **Auth middleware on every protected route** — only `/users/register` and `/users/login` are unprotected
- **Matching microservice is internal only** — never called by the mobile client
- **All TBD values flagged** with `// TODO: TBD — confirm value before launch`
- **No deployments during peak windows** — Friday/Saturday/Sunday evenings, Tuesday/Thursday evenings
