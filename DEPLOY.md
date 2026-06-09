# MindFlip — Production Deployment Guide

Deploy **only** the student web app (Vercel) and backend API (Railway). Marketing and admin stay in the repo but are **not** deployed yet.

**Target URLs (adjust if you use different domains):**

| Surface | URL | Deploy now? |
|---------|-----|-------------|
| Student web app | `https://app.mindflip.io` | ✅ Yes → Vercel |
| API | `https://api.mindflip.io` | ✅ Yes → Railway |
| Admin dashboard | `https://admin.mindflip.io` | ❌ Later |
| Marketing site | `https://mindflip.io` | ❌ Later |
| Mobile (Expo Go / stores) | — | Connect to Railway API now |

---

## Important questions — answered first

### Can I deploy ONLY the student web app on Vercel while marketing + admin live in the same repo?

**Yes.** Vercel deploys one **Root Directory** per project. Point it at the repo root (where `src/` and root `package.json` live). Vercel ignores `apps/marketing/` and `apps/admin/` unless you create separate Vercel projects for them.

Same monorepo, multiple deploy targets — each platform picks its folder:

```
mind-flip-study/
├── src/                  ← student web (Vercel root)
├── apps/marketing/       ← not deployed
├── apps/admin/           ← not deployed
├── services/api/         ← Railway (Docker)
└── mobile/               ← Expo (EAS later)
```

### If admin is NOT deployed, does it still “receive” user data?

**The admin dashboard never receives data directly.** All user data flows:

```
Mobile / Web → FastAPI → PostgreSQL (+ Redis, S3)
```

The admin UI is just another **client** of the same API. When users sign up, study, upload books, etc., data is stored in Postgres **whether or not** admin is deployed.

When you deploy admin later, it reads the **same database** via `/admin/*` endpoints. Nothing is lost.

### Do I still need backend endpoints for admin?

**Yes — and you already have them.** The API mounts admin routes at `/admin`:

- `GET /admin/users`, `/admin/books`, `/admin/metrics`, etc.
- Protected by `require_role("admin")` — only admin JWTs can call them.

Keep these endpoints live in production. They cost nothing if nobody calls them. When you deploy the admin SPA, it will use them immediately.

### How does admin access data later?

1. Deploy `apps/admin` to Vercel/Railway/static host (see `apps/admin/railway.toml` for a template).
2. Set `VITE_API_URL=https://api.mindflip.io`.
3. Add `https://admin.mindflip.io` to `CORS_ORIGINS` on the API (already in `.env.example`).
4. Run `npm run db:create-admin` against production DB (once) or promote a user to admin role.
5. Admin login → same auth as users, but role = `admin` → access to `/admin/*`.

### Architecture that lets you add admin later without breaking anything

| Layer | Rule |
|-------|------|
| **Database** | Single Postgres — source of truth for all clients |
| **API** | All business logic + admin routes always deployed |
| **Frontends** | Thin clients; each sets its own `VITE_API_URL` / `EXPO_PUBLIC_API_URL` |
| **Auth** | JWT + refresh cookies; role checked server-side |
| **CORS** | Add new frontend origins to `CORS_ORIGINS` when you deploy them |

---

## Prerequisites checklist

Before starting, create accounts and gather secrets:

- [ ] [GitHub](https://github.com) account
- [ ] [Railway](https://railway.app) account
- [ ] [Vercel](https://vercel.com) account
- [ ] [Neon](https://neon.tech) Postgres — **already set up for this project** (copy `DATABASE_URL` into Railway)
- [ ] [Upstash Redis](https://upstash.com) — **already set up** (copy `REDIS_URL` into Railway; often `rediss://...`)
- [ ] AWS S3 bucket + IAM keys (book uploads — **required** for production uploads)
- [ ] Domain DNS access for `mindflip.io` (or your domain)
- [ ] Optional: Anthropic API key, Stripe keys, Resend, Sentry, Google OAuth client IDs

**Note:** The backend is **FastAPI (Python)**, not Node.js. It runs in Docker via `services/api/Dockerfile`.

---

## PHASE 1 — GitHub setup

### 1.1 Monorepo vs separate repos?

**Use the existing monorepo.** You already have the right layout (`run.md`). One repo = one source of truth, simpler CI, shared API types. Split repos only if different teams need different access — not needed for a 1-week launch.

### 1.2 Initialize Git and push

```bash
cd /path/to/mind-flip-study

# Initialize (skip if already a repo)
git init

# Verify .gitignore excludes secrets and build artifacts
cat .gitignore
# Must include: .env, .env.*, node_modules, dist, **/.venv/
```

### 1.3 What to push

| Push ✅ | Do NOT push ❌ |
|---------|----------------|
| `src/` (student web) | `.env`, `mobile/.env`, `apps/admin/.env` |
| `apps/admin/`, `apps/marketing/` (source only) | `node_modules/`, `dist/`, `mobile/node_modules/` |
| `services/api/` (no `.venv`) | `services/api/.venv/` |
| `mobile/` (no `.env`) | AWS keys, JWT secrets, API keys |
| `docker-compose*.yml`, `.env.example` | `.pytest_cache/`, logs |
| Root `package.json`, `vite.config.js`, `index.html` | |

### 1.4 Create GitHub repo and push

```bash
# On GitHub: create empty repo "mind-flip-study" (no README if you have local files)

git add .
git status   # confirm no .env files staged
git commit -m "Initial commit — MindFlip monorepo"
git branch -M main
git remote add origin git@github.com:YOUR_ORG/mind-flip-study.git
git push -u origin main
```

**Result:** GitHub has full source; secrets stay local.

### 1.5 Connect platforms to GitHub

- **Railway:** New Project → Deploy from GitHub repo → select `mind-flip-study`
- **Vercel:** New Project → Import Git Repository → select `mind-flip-study`

**Next:** Deploy backend first (frontend needs the API URL).

---

## PHASE 2 — Backend deployment (Railway + Docker)

**Default for this project:** Railway runs **only the compute** (API + Worker). Postgres and Redis stay on **Neon** and **Upstash** — do **not** add Railway database plugins unless you want an all-in-one Railway stack.

| Layer | Where | Notes |
|-------|-------|-------|
| **API** | Railway | FastAPI (`uvicorn`) |
| **Worker** | Railway | Celery (AI flashcards, emails, background jobs) |
| **Postgres** | Neon | Same DB you use locally (`DATABASE_URL`) |
| **Redis** | Upstash | Same cache you use locally (`REDIS_URL`) |

```
Railway project
├── API service      (root: services/api)
└── Worker service   (root: services/api, celery start command)

External (not in Railway):
├── Neon Postgres    → DATABASE_URL
└── Upstash Redis    → REDIS_URL
```

### 2.1 Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → select your repo.
2. You will add **two services** (API + Worker) inside one project. **Skip** `+ New → Database` for Postgres/Redis.

### 2.2 PostgreSQL (Neon — default)

You already use Neon locally. Reuse the same database for production:

1. [Neon console](https://console.neon.tech) → your project → **Connection details**
2. Copy the **pooled** connection string (`postgresql://...?sslmode=require`)
3. Paste as `DATABASE_URL` on **both** Railway API and Worker services

The API auto-converts `postgresql://` to `postgresql+asyncpg://`. No Railway Postgres service needed.

**If you already ran migrations against this Neon DB locally**, production schema is ready — skip §2.7.

**Alternative (optional):** Railway Postgres via `+ New → Database → PostgreSQL`, then use `${{Postgres.DATABASE_URL}}` in service variables. Only use this if you are **not** on Neon.

### 2.3 Redis (Upstash — default)

You already use Upstash locally. Reuse the same Redis for production:

1. [Upstash console](https://console.upstash.com) → your Redis database → **Connect**
2. Copy the connection URL (often `rediss://default:...@....upstash.io:6379`)
3. Paste as `REDIS_URL` on **both** Railway API and Worker services

Celery and auth rate-limiting require Redis. **Do not skip.**

**Alternative (optional):** Railway Redis via `+ New → Database → Redis`, then copy `REDIS_URL` from that service. Only use this if you are **not** on Upstash.

### 2.4 Deploy API service

1. **+ New** → **GitHub Repo** → same repo (or **Empty Service** and connect repo).
2. **Settings → Root Directory:** `services/api`
3. **Settings → Build:** Dockerfile (`services/api/Dockerfile` is auto-detected).
4. **Settings → Deploy → Start Command:** override the Dockerfile default so Railway can route traffic:

   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT --workers 4
   ```

5. **Variables:** add `DATABASE_URL` (Neon) and `REDIS_URL` (Upstash) plus the rest from §2.6.
6. **Settings → Networking → Generate Domain** → e.g. `mindflip-api-production.up.railway.app`
7. Later: add custom domain `api.mindflip.io` (CNAME to Railway).

### 2.5 Deploy Celery worker (second service)

1. **+ New** → **GitHub Repo** → same repo again.
2. **Root Directory:** `services/api`
3. **Same Dockerfile**, different start command:

   ```
   celery -A tasks.celery_app worker --loglevel=info
   ```

4. **Variables:** copy the **same** env vars as the API — especially Neon `DATABASE_URL`, Upstash `REDIS_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, and AWS keys. Railway lets you duplicate variables across services or use a shared variable group.

**Result:** Background jobs (AI generation, emails) work in production.

### 2.6 Environment variables (API + Worker)

Set these in Railway for **both** API and Worker services:

| Variable | Production value | Required |
|----------|------------------|----------|
| `DATABASE_URL` | Neon connection string (pooled URL) | ✅ |
| `REDIS_URL` | Upstash connection URL (`rediss://...`) | ✅ |
| `JWT_SECRET` | `openssl rand -hex 32` | ✅ |
| `JWT_ALGORITHM` | `HS256` | ✅ |
| `ENVIRONMENT` | `production` | ✅ |
| `CORS_ORIGINS` | `https://app.mindflip.io` (add admin origin later) | ✅ |
| `FRONTEND_URL` | `https://app.mindflip.io` | ✅ |
| `REFRESH_TOKEN_COOKIE_SECURE` | `true` | ✅ |
| `REFRESH_TOKEN_COOKIE_PATH` | `/auth` | ✅ |
| `AWS_ACCESS_KEY_ID` | IAM user with S3 access | ✅ for uploads |
| `AWS_SECRET_ACCESS_KEY` | IAM secret | ✅ for uploads |
| `S3_BUCKET_NAME` | e.g. `mindflip-books` | ✅ |
| `S3_REGION` | e.g. `us-east-1` | ✅ |
| `ANTHROPIC_API_KEY` | Your key (or AWS Secrets Manager in prod) | ✅ for AI |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID | If using Google login |
| `APPLE_BUNDLE_ID` | `io.mindflip.app` | If using Apple login |
| `STRIPE_SECRET_KEY` | `sk_live_...` | If billing enabled |
| `STRIPE_WEBHOOK_SECRET` | From Stripe dashboard | If billing enabled |
| `STRIPE_PRICE_ID_BASIC` / `_PREMIUM` | Price IDs | If billing enabled |
| `FREE_TIER_PAYWALL_ENABLED` | `true` | When ready |
| `RESEND_API_KEY` | Resend API key | For emails |
| `FROM_EMAIL` | `MindFlip <hello@mindflip.io>` | For emails |
| `SENTRY_DSN_API` | Sentry DSN | Optional |
| `AUTH_RATE_LIMIT_WINDOW_SEC` | `60` | Recommended |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `40` | Recommended |

Generate a strong JWT secret locally:

```bash
openssl rand -hex 32
```

**Do not** commit these to GitHub. Set them only in Railway (and later Vercel for frontend-only vars).

### 2.7 Run database migrations

**Skip this** if you already ran `alembic upgrade head` (or `npm run db:migrate`) against your Neon `DATABASE_URL` locally — that **is** the production database.

Otherwise, from your **local machine** (one-time):

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Your Neon DATABASE_URL — do NOT commit this
export DATABASE_URL="postgresql://..."

alembic upgrade head
```

Or from repo root (if venv exists):

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

**Result:** Neon schema matches what the API expects.

### 2.8 Create production admin user

```bash
cd services/api
source .venv/bin/activate
export DATABASE_URL="postgresql://..."

# Default: admin@mindflip.local / Admin123!
python scripts/create_admin.py

# Or override:
ADMIN_EMAIL="you@mindflip.io" ADMIN_PASSWORD="..." python scripts/create_admin.py
```

You won't use this until admin is deployed, but the account will exist in Postgres.

### 2.9 Custom domain for API

1. Railway API service → **Settings → Networking → Custom Domain** → `api.mindflip.io`
2. At your DNS provider:

   ```
   CNAME  api  →  mindflip-api-production.up.railway.app
   ```

3. Wait for TLS (usually minutes).

### 2.10 Test backend after deploy

```bash
# Health check
curl https://api.mindflip.io/health
# Expected: {"status":"ok"}

# Celery worker (optional)
curl https://api.mindflip.io/health/celery
# Expected: worker count > 0 when worker service is running

# OpenAPI docs
open https://api.mindflip.io/docs
```

**Register test user:**

```bash
curl -X POST https://api.mindflip.io/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!","full_name":"Test User"}'
```

**Result:** API is live. Proceed to frontend.

---

## PHASE 3 — Frontend deployment (Vercel — student app only)

The student app is a **Vite + React SPA** at the repo root (`npm run build` → `dist/`).

### 3.1 Create Vercel project (one app only)

1. [vercel.com](https://vercel.com) → **Add New Project** → import GitHub repo.
2. **Root Directory:** `.` (repo root — **not** `apps/marketing` or `apps/admin`)
3. **Framework Preset:** Vite
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Install Command:** `npm install`

Vercel will **not** build marketing or admin unless you create separate projects with those root directories.

### 3.2 Add `vercel.json` for SPA routing

React Router needs all paths to serve `index.html`. Create at repo root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/((?!assets/).*)", "destination": "/index.html" }
  ]
}
```

Commit and push:

```bash
git add vercel.json
git commit -m "Add Vercel config for student SPA"
git push
```

### 3.3 Environment variables (Vercel)

Project → **Settings → Environment Variables** (Production):

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://api.mindflip.io` |
| `VITE_GOOGLE_CLIENT_ID` | Google Web client ID (same as `GOOGLE_CLIENT_ID` on API) |
| `VITE_ENV` | `production` |
| `VITE_SENTRY_DSN` | Optional |
| `VITE_SUBSCRIPTIONS_ENABLED` | `true` when Stripe is live |

**Important:** Vite bakes `VITE_*` vars at **build time**. After changing them, **redeploy**.

### 3.4 Custom domain

1. Vercel → Project → **Domains** → add `app.mindflip.io`
2. DNS:

   ```
   CNAME  app  →  cname.vercel-dns.com
   ```

### 3.5 Update API CORS

In Railway API service, set:

```
CORS_ORIGINS=https://app.mindflip.io
```

When you deploy admin later, append:

```
CORS_ORIGINS=https://app.mindflip.io,https://admin.mindflip.io
```

Redeploy API after changing.

### 3.6 Google OAuth (if used)

Google Cloud Console → Credentials → Web client:

- **Authorized JavaScript origins:** `https://app.mindflip.io`
- **Authorized redirect URIs:** (if using redirect flow)

### 3.7 Test frontend

1. Open `https://app.mindflip.io`
2. Register / log in
3. DevTools → Network: API calls go to `https://api.mindflip.io`
4. Upload a book (confirms S3 + CORS)
5. No CORS errors in console

**Result:** Student web app is production-ready.

### 3.8 What about marketing and admin on Vercel?

| App | Action now |
|-----|------------|
| `apps/marketing/` | Do **not** create a Vercel project |
| `apps/admin/` | Do **not** create a Vercel project |

They remain in Git for local dev (`npm run dev` in each folder). Deploy when ready with separate Vercel/Railway projects and their own root directories.

---

## PHASE 4 — Mobile app (Expo)

### 4.1 Expo Go → production API (now)

Edit `mobile/.env` (local only, not committed):

```bash
EXPO_PUBLIC_API_URL=https://api.mindflip.io
```

Restart Metro:

```bash
cd mobile
npx expo start -c
```

Scan QR with Expo Go. The app uses `mobile/api/client.ts`:

```ts
const baseURL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
```

**Note:** Mobile apps are **not** browser clients — CORS does not apply. The API accepts requests from any origin for mobile; auth is JWT-based.

### 4.2 Physical device testing

- Expo Go reads `EXPO_PUBLIC_API_URL` at bundle time — restart with `-c` after changes.
- Ensure production API is HTTPS (required for production OAuth / secure cookies on web; mobile JWT in headers works over HTTPS).

### 4.3 EAS Build for App Store / Play Store (later)

You already have `mobile/eas.json` and EAS project ID in `mobile/app.json`.

**Preview / internal build:**

```bash
cd mobile
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

**Production build with production API:**

Set env in EAS (recommended — not in Git):

```bash
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value https://api.mindflip.io
```

Or in `eas.json` per profile:

```json
"production": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://api.mindflip.io"
  }
}
```

Then:

```bash
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

### 4.4 Same API for mobile + web

Both clients hit the same endpoints:

| Client | Env var | API client file |
|--------|---------|-----------------|
| Web | `VITE_API_URL` | `src/api/client.js` |
| Mobile | `EXPO_PUBLIC_API_URL` | `mobile/api/client.ts` |
| Admin (later) | `VITE_API_URL` | `apps/admin/src/api/client.js` |

No separate “mobile API” — one FastAPI backend serves all.

---

## PHASE 5 — Architecture validation

### Final architecture

```mermaid
flowchart TB
    subgraph clients["Clients (deployed now)"]
        WEB["Student Web App<br/>Vite SPA<br/>app.mindflip.io<br/>Vercel"]
        MOBILE["Mobile App<br/>Expo Go → EAS later<br/>iOS / Android"]
    end

    subgraph clients_later["Clients (not deployed yet)"]
        ADMIN["Admin Dashboard<br/>apps/admin<br/>admin.mindflip.io"]
        MKT["Marketing Site<br/>apps/marketing<br/>mindflip.io"]
    end

    subgraph railway["Railway (compute only)"]
        API["FastAPI API<br/>api.mindflip.io<br/>Docker"]
        WORKER["Celery Worker<br/>same Docker image"]
    end

    subgraph data["External data stores"]
        PG[("PostgreSQL<br/>Neon")]
        REDIS[("Redis<br/>Upstash")]
        S3[("AWS S3<br/>Book PDFs")]
    end

    WEB -->|"HTTPS + JWT<br/>VITE_API_URL"| API
    MOBILE -->|"HTTPS + JWT<br/>EXPO_PUBLIC_API_URL"| API
    ADMIN -.->|"later: VITE_API_URL"| API
    MKT -.->|"CTA links only"| WEB

    API --> PG
    API --> REDIS
    API --> S3
    WORKER --> PG
    WORKER --> REDIS
    WORKER --> S3

    API -->|"Anthropic / Stripe / Resend"| EXT["External APIs"]
```

### Data flow (user signs up and studies)

```
1. User opens app.mindflip.io (Vercel)
2. Browser loads static JS; VITE_API_URL points to api.mindflip.io
3. POST /auth/register → FastAPI validates → INSERT into PostgreSQL users table
4. JWT returned; refresh token in HttpOnly cookie (Secure=true in prod)
5. User uploads PDF → POST /books/upload-url → presigned S3 PUT → POST /books/
6. Celery worker picks up job → Anthropic generates flashcards → writes to Postgres
7. User studies → POST /study/events → analytics in Postgres
8. Admin dashboard (not deployed): data already in Postgres
9. Later: admin SPA calls GET /admin/users → same Postgres rows
```

### ASCII diagram (quick reference)

```
┌─────────────────┐     ┌─────────────────┐
│  Expo Mobile    │     │  Student Web    │
│  (Expo Go/EAS)  │     │  Vercel         │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │  EXPO_PUBLIC_API_URL  │  VITE_API_URL
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │  FastAPI API (Railway)│◄──── Stripe webhooks, etc.
         │  api.mindflip.io      │
         └───────────┬───────────┘
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
┌──────────┐  ┌────────────┐  ┌─────────┐
│ Postgres │  │   Redis    │  │   S3    │
│ (Neon)   │  │ (Upstash)  │  │  PDFs   │
└──────────┘  └─────┬──────┘  └─────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Celery Worker │
            │  (Railway)    │
            └───────────────┘

Not deployed (yet):
┌─────────────────┐     ┌─────────────────┐
│ Admin Dashboard │     │ Marketing Site  │
│ apps/admin      │     │ apps/marketing  │
└────────┬────────┘     └─────────────────┘
         │ calls /admin/* when deployed
         └──────────────────► FastAPI (same)
```

---

## PHASE 6 — Admin system strategy

### How admin should be structured in code (already correct)

| Piece | Location | Role |
|-------|----------|------|
| Admin UI | `apps/admin/src/` | React SPA — lists users, books, metrics |
| Admin API | `services/api/routers/admin.py` | Server-side auth + DB queries |
| Admin auth | `require_role("admin")` | Enforced on every `/admin/*` route |
| Shared DB | PostgreSQL | All user activity stored here |

**Admin is not a separate backend.** It is a frontend client of existing API routes.

### What gets stored without admin deployed

Everything the student app and mobile app do is persisted:

- Users, auth, profiles, onboarding
- Books, flashcard sets, study events, quiz results
- Billing/subscription state (if Stripe enabled)
- Feedback, analytics, token usage
- IP history (for admin moderation — written by API middleware)

None of this depends on the admin SPA being online.

### Connecting admin later (checklist)

1. **Deploy** `apps/admin` (Vercel root dir `apps/admin`, or Railway static per `apps/admin/railway.toml`).
2. **Env:** `VITE_API_URL=https://api.mindflip.io`
3. **CORS:** Add `https://admin.mindflip.io` to API `CORS_ORIGINS`.
4. **DNS:** `admin.mindflip.io` → host.
5. **Login:** Use admin user from `create_admin.py` or promote user via DB.
6. **Verify:** `GET /admin/users` returns production data.

No migration, no data backfill, no API rewrite.

### Optional: run admin locally against production

For early moderation before public admin deploy:

```bash
# apps/admin/.env (local only)
VITE_API_URL=https://api.mindflip.io
```

```bash
cd apps/admin && npm run dev
```

Open `http://localhost:5174` — admin UI talks to production API. Add `http://localhost:5174` to `CORS_ORIGINS` temporarily if needed.

---

## Week-1 launch checklist

### Day 1–2: Infrastructure

- [ ] GitHub repo pushed, no secrets
- [ ] Neon + Upstash URLs in Railway API + Worker env vars
- [ ] Railway: API + Worker deployed (no Railway Postgres/Redis)
- [ ] Migrations applied to production DB
- [ ] `curl https://api.mindflip.io/health` → ok
- [ ] S3 uploads tested

### Day 3–4: Web app

- [ ] Vercel: root project, `vercel.json`, `VITE_API_URL`
- [ ] Domain `app.mindflip.io` live
- [ ] CORS updated on API
- [ ] Google OAuth origins updated (if used)

### Day 5: Mobile + hardening

- [ ] `EXPO_PUBLIC_API_URL` → production in Expo Go
- [ ] Create admin user in prod DB
- [ ] Sentry enabled (optional)
- [ ] Stripe webhooks pointed at `https://api.mindflip.io/billing/webhook` (if billing)
- [ ] `FREE_TIER_PAYWALL_ENABLED=true` when ready

### Day 6–7: Smoke tests

- [ ] Register → onboard → upload book → generate flashcards → study session
- [ ] Password reset email (Resend)
- [ ] Mobile same flow on Expo Go
- [ ] Load test `/health` and one authenticated route

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| CORS error on web | Add exact origin (with `https://`, no trailing slash) to `CORS_ORIGINS`; redeploy API |
| 401 on all routes | Check JWT / clock skew; `REFRESH_TOKEN_COOKIE_SECURE=true` requires HTTPS |
| Upload fails / S3 CORS error | Run `cd services/api && .venv/bin/python scripts/apply_s3_cors.py` (needs `s3:PutBucketCors`); verify AWS keys and bucket name/region |
| AI generation stuck | Worker not running or `ANTHROPIC_API_KEY` missing on **worker** service |
| API 502 on Railway | Start command must use `--port $PORT`, not hardcoded `8000` |
| DB/Redis connection errors | Verify Neon/Upstash URLs in Railway vars; Neon needs `sslmode=require` |
| Vite app blank routes | Add `vercel.json` rewrites for SPA |
| Mobile "network error" | Wrong `EXPO_PUBLIC_API_URL`; restart Metro with `-c` |
| Admin 403 locally | User lacks `admin` role; run `create_admin.py` |

---

## GitHub-based deployment flow (summary)

```
git push main
    │
    ├─► Vercel (auto)     → builds repo root → app.mindflip.io
    │
    └─► Railway (auto)    → builds services/api Dockerfile
            ├─► API service     → api.mindflip.io
            └─► Worker service  → Celery
            (Neon + Upstash are external — env vars only)
```

Environment variables live in each platform's dashboard — never in Git.

---

## Files reference

| File | Purpose |
|------|---------|
| `.env.example` | Template for all env vars |
| `docker-compose.yml` | Local dev (Postgres + Redis + API + Worker) |
| `docker-compose.neon.yml` | Local dev with external Neon DB |
| `services/api/Dockerfile` | Production API/worker image |
| `apps/admin/railway.toml` | Template for future admin static deploy |
| `apps/marketing/vercel.json` | For future marketing deploy (not now) |
| `run.md` | Local development guide |
| `mobile/eas.json` | EAS Build profiles |

---

*Last updated for MindFlip monorepo layout — student web at repo root, FastAPI at `services/api/`.*
