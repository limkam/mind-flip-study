# MindFlip — Local development run guide

How to run every part of the stack on your machine: marketing site, student web app, admin dashboard, API, background workers, and mobile.

---

## What runs where

| App | Folder | Dev URL | Default port |
|-----|--------|---------|--------------|
| **Marketing** (landing, SEO) | `apps/marketing/` | http://localhost:3000 | 3000 |
| **Student web app** (sign in, study) | repo root (`src/`) | http://localhost:5173 | 5173 |
| **Admin dashboard** | `apps/admin/` | http://localhost:5174 | 5174 |
| **API** (FastAPI) | `services/api/` | http://localhost:8000 | 8000 |
| **API docs** | — | http://localhost:8000/docs | 8000 |
| **Mobile** (Expo) | `mobile/` | Expo Dev Tools (QR / simulator) | 8081 (Metro) |

Production mapping (for reference):

| Surface | URL |
|---------|-----|
| Marketing | https://mindflip.io |
| Student app | https://app.mindflip.io |
| Admin | https://admin.mindflip.io |
| API | https://api.mindflip.io |

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Docker** + Docker Compose (easiest way to run Postgres + Redis + API)
- **Python** 3.12 (only if you run the API on the host instead of in Docker)
- **Mobile:** [Expo Go](https://expo.dev/go) on a device, or Android Studio / Xcode simulators

---

## One-time setup

### 1. Clone and install JavaScript dependencies

```bash
# Student web app (repo root)
cd /path/to/mind-flip-study
npm install

# Admin dashboard
cd apps/admin && npm install && cd ../..

# Marketing site
cd apps/marketing && npm install && cd ../..

# Mobile
cd mobile && npm install && cd ..
```

### 2. Environment files

Copy examples and edit as needed:

```bash
# From repo root
cp .env.example .env

cp apps/admin/.env.example apps/admin/.env
cp mobile/.env.example mobile/.env
# Optional for marketing:
cp apps/marketing/.env.example apps/marketing/.env.local
```

**Root `.env`** (used by Docker for API/worker, and by the student Vite app):

| Variable | Local dev value |
|----------|-----------------|
| `VITE_API_URL` | `http://localhost:8000` |
| `DATABASE_URL` | `postgresql://mindflip:mindflip@localhost:5432/mindflip` (when Postgres is on host) |
| `REDIS_URL` | `redis://localhost:6379/0` |
| `JWT_SECRET` | Long random string (required) |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:5174` |
| `FRONTEND_URL` | `http://localhost:5173` |
| `ANTHROPIC_API_KEY` | Your key (for AI flashcard generation) |

**`apps/admin/.env`:** `VITE_API_URL=http://localhost:8000`

**`mobile/.env`:** `EXPO_PUBLIC_API_URL=http://localhost:8000`  
On a **physical phone**, use your computer’s LAN IP, e.g. `http://192.168.1.5:8000`, and start the API with `--host 0.0.0.0`.

**`apps/marketing/.env.local` (optional):**

```
NEXT_PUBLIC_APP_URL=http://localhost:5173
```

Marketing CTAs default to `https://app.mindflip.io/register` in code. For local testing, open the student app directly at http://localhost:5173/register or set `NEXT_PUBLIC_APP_URL` and wire components to use it if you extend them.

### 3. Python API (if not using Docker for the API)

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

The API reads `.env` from **`services/api/.env`**. Either copy the root file:

```bash
cp ../../.env .env
```

or symlink it. Docker Compose uses the **repo root** `.env` via `env_file: .env`.

### 4. Database migrations

With Postgres running (see below):

```bash
# From repo root
npm run db:migrate
```

### 5. Create a dev admin user (for admin dashboard)

```bash
npm run db:create-admin
```

Default credentials (override with env vars if you like):

- **Email:** `admin@mindflip.local`
- **Password:** `Admin123!`

---

## Start the backend (pick one approach)

### Option A — Docker (recommended)

**Local Postgres** (bundled container) — starts Postgres, Redis, API, and Celery worker:

```bash
# From repo root — expose Postgres/Redis on localhost for tools/migrations
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d

# First time only (uses DATABASE_URL from `.env`, or localhost:5432 default)
npm run db:migrate
npm run db:create-admin
```

**Neon (or other hosted Postgres)** — API/worker use `DATABASE_URL` from repo-root `.env`; only Redis runs in Docker:

```bash
# Set DATABASE_URL in `.env` to your Neon URL first, then:
docker compose -f docker-compose.yml -f docker-compose.neon.yml up -d

npm run db:migrate
npm run db:create-admin
```

Do **not** use `docker-compose.ports.yml` with Neon unless you also want local Postgres for something else. Without the neon override, Docker **ignores** your Neon URL and forces `postgresql://mindflip:mindflip@postgres:5432/mindflip`.

Check API:

```bash
curl http://localhost:8000/health
```

Stop everything:

```bash
docker compose -f docker-compose.yml -f docker-compose.ports.yml down
```

**Note:** Without `docker-compose.ports.yml`, Postgres and Redis are *not* published to your host. Use the ports file whenever you run migrations or a host-side API.

### Option B — API on your machine (Docker only for DB)

```bash
# Terminal 1 — infra only
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d postgres redis

npm run db:migrate

# Terminal 2 — API
cd services/api
source .venv/bin/activate
cp ../../.env .env   # if not already present
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3 — Celery worker (AI jobs, notifications)
cd services/api
source .venv/bin/activate
celery -A tasks.celery_app worker --loglevel=info

# Terminal 4 — Celery beat (optional: leaderboard refresh, streak reminders)
cd services/api
source .venv/bin/activate
celery -A tasks.celery_app beat --loglevel=info
```

---

## Start the frontends

Use **separate terminals** for each app.

### Marketing landing page

```bash
cd apps/marketing
npm run dev
```

Open **http://localhost:3000**  
Routes: `/`, `/pricing`, `/privacy`, `/sitemap.xml`, `/robots.txt`, and 10 static SEO pages:

- http://localhost:3000/study/biology  
- http://localhost:3000/study/mathematics  
- http://localhost:3000/study/chemistry  
- http://localhost:3000/study/history  
- http://localhost:3000/study/psychology  
- http://localhost:3000/study/economics  
- http://localhost:3000/study/computer-science  
- http://localhost:3000/study/medicine  
- http://localhost:3000/study/law  
- http://localhost:3000/study/languages  

Production build check:

```bash
npm run build && npm run start
```

### Student web app (sign in, library, games)

```bash
# From repo root
npm run dev
```

Open **http://localhost:5173**

| Path | Purpose |
|------|---------|
| http://localhost:5173/register | Create account |
| http://localhost:5173/login | Sign in |
| http://localhost:5173/library | PDFs & sets (after login) |
| http://localhost:5173/profile | Profile & billing |

Requires API at `VITE_API_URL` (default `http://localhost:8000`).

### Admin dashboard

```bash
cd apps/admin
npm run dev
```

Open **http://localhost:5174** → sign in with `admin@mindflip.local` / `Admin123!`.

Routes: `/users`, `/content`, `/metrics`.

### Mobile (Expo)

```bash
cd mobile
npm start
```

Then:

- Press **`a`** — Android emulator  
- Press **`i`** — iOS simulator (macOS only)  
- Scan **QR code** with Expo Go on a physical device  

Ensure `EXPO_PUBLIC_API_URL` in `mobile/.env` points to a reachable API (`--host 0.0.0.0` on uvicorn when using a real device).

---

## Full local stack (cheat sheet)

Open **5 terminals** from the repo root:

```bash
# T1 — Backend
docker compose -f docker-compose.yml -f docker-compose.ports.yml up

# T2 — Student app
npm run dev

# T3 — Admin
cd apps/admin && npm run dev

# T4 — Marketing
cd apps/marketing && npm run dev

# T5 — Mobile (optional)
cd mobile && npm start
```

Quick links:

- Marketing: http://localhost:3000  
- Student register: http://localhost:5173/register  
- Student login: http://localhost:5173/login  
- Admin: http://localhost:5174/login  
- API health: http://localhost:8000/health  
- API Swagger: http://localhost:8000/docs  

---

## Flow: landing page → student sign-in

1. Start API + DB (Docker or Option B).  
2. Start student app: `npm run dev` → http://localhost:5173  
3. (Optional) Start marketing: `cd apps/marketing && npm run dev` → http://localhost:3000  
4. On marketing, click **Get Started** (production URL) **or** go directly to http://localhost:5173/register.  
5. Register → you’re redirected to login → sign in → `/library`.

Admin is separate: http://localhost:5174 with the admin user from `db:create-admin`.

---

## Useful commands

| Task | Command |
|------|---------|
| Run DB migrations | `npm run db:migrate` |
| Create admin user | `npm run db:create-admin` |
| Student app lint | `npm run lint` |
| Student app production build | `npm run build` → `npm run preview` |
| API tests | `cd services/api && source .venv/bin/activate && pytest` |
| Marketing production build | `cd apps/marketing && npm run build` |

---

## Troubleshooting

### `VITE_API_URL` / network errors in the browser

- Confirm API is up: `curl http://localhost:8000/health`  
- Student app must use `http://localhost:8000`, not `https://api.mindflip.io`, in root `.env`.  
- Restart Vite after changing `.env`.

### Login / register shows `net::ERR_EMPTY_RESPONSE` or `Network Error`

The browser cannot reach a healthy API. Check:

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`. If curl fails or hangs:

1. **API container crashed on startup** (common cause: Redis unreachable):

   ```bash
   docker logs mind-flip-study-api-1 --tail 30
   ```

   If you see `Name or service not known` for `redis`, recreate the stack:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.ports.yml down
   docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d --force-recreate
   ```

2. **Port 6379 already in use** (another project's Redis). MindFlip publishes Redis on host port **6380** (see `docker-compose.ports.yml`). Internal containers still use `redis://redis:6379/0`.

3. **Port 8000 not running** — start the backend (Option A above) before the Vite app.

### Google Sign-In: `The given origin is not allowed for the given client ID`

In [Google Cloud Console](https://console.cloud.google.com/) → **Credentials** → your OAuth **Web client** → add:

- **Authorized JavaScript origins:** `http://localhost:5173`
- Save, wait ~1 minute, hard-refresh the login page.

`VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` in `.env` must match that client ID.

### CORS errors

Add your frontend origin to `CORS_ORIGINS` in root `.env`, e.g.:

```
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

Restart the API after changing.

### Migrations fail / “connection refused” to Postgres

- Run `docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d postgres`  
- Use `DATABASE_URL=postgresql://mindflip:mindflip@localhost:5432/mindflip` in `.env`.

### Mobile can’t reach the API

- Use your machine’s LAN IP in `mobile/.env`, not `localhost`.  
- Start API with `uvicorn main:app --host 0.0.0.0 --port 8000`.  
- Allow port 8000 through your firewall.

### AI flashcard generation stuck

- Celery **worker** must be running (included in `docker compose up`, or start manually).  
- Set `ANTHROPIC_API_KEY` in `.env`.

### Transactional email (Resend)

- Set `RESEND_API_KEY` and `FROM_EMAIL` in root `.env` (see `.env.example`).  
- Verify domain `mindflip.io` in Resend (SPF/DKIM) before production sends.  
- Without a key, the API logs and skips sends — registration still succeeds.  
- Celery **worker** sends welcome, challenge, password-reset, and digest emails (`.delay()`).  
- Optional **Celery beat** for weekly digests: `celery -A tasks.celery_app beat --loglevel=info`  
- Password reset UI: http://localhost:5173/forgot-password → email link → `/auth/reset-password?token=...`

### Admin login fails

- Run `npm run db:create-admin`  
- Use `admin@mindflip.local` / `Admin123!` (unless you overrode env vars).

### Marketing port in use

```bash
cd apps/marketing && npm run dev -- -p 3001
```

---

## Production deploy (pointer)

| App | Host |
|-----|------|
| Marketing | Vercel — root directory `apps/marketing` |
| Student web | Static host / CDN (Vite `npm run build` → `dist/`) |
| Admin | Static host (e.g. Railway — see `apps/admin/railway.toml`) |
| API + worker | Railway / Fly / Docker — `services/api` |

Set production env vars from `.env.example` on each platform; never commit real secrets.
