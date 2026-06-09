# MindFlip — Environment & integrations guide

This document explains how to configure everything in [`.env.example`](.env.example): AI (Claude), Google Sign-In, Stripe billing, AWS, email, Sentry, and core auth/database settings.

For running the stack locally, see [`run.md`](run.md).

---

## Quick reference

| Concern | Variables | Status in repo |
|--------|-----------|----------------|
| **AI (Claude)** | `ANTHROPIC_API_KEY`, `ANTHROPIC_SECRET_ID`, `AWS_SECRETS_REGION`, `ENVIRONMENT` | **Implemented** — flashcards, workbooks, `/ai/invoke` |
| **AI (Gemini)** | *(not in `.env.example`)* | **Not implemented** — would need new code |
| **Google auth (web)** | `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID` | **Implemented** — login page + `POST /auth/google` |
| **Google auth (mobile)** | `EXPO_PUBLIC_GOOGLE_*` in `mobile/.env` | **Partial** — UI exists; must call `POST /auth/google` |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL` | **Backend done** — needs Stripe Dashboard + webhook + frontend button |
| **AWS S3** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `S3_REGION` | **Implemented** — book PDF uploads |
| **Email** | `RESEND_API_KEY`, `FROM_EMAIL` | **Implemented** — Celery worker sends mail |
| **Sentry** | `VITE_SENTRY_DSN`, `SENTRY_DSN_API`, `SENTRY_VERIFY_SECRET`, `VITE_ENV`, `ENVIRONMENT` | **Optional** |
| **Core** | `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `CORS_ORIGINS`, `VITE_API_URL` | **Required** for local/prod |

Copy the example file once:

```bash
cp .env.example .env
# API also reads services/api/.env — symlink or copy:
cp .env services/api/.env
```

Restart **Vite** and the **API** after changing `.env`.

---

## 1. AI models — Claude vs Gemini

### What the app uses today

MindFlip is built around **Anthropic Claude**, not Gemini:

- Model is **fixed in code**: `claude-sonnet-4-20250514` ([`services/api/anthropic_client.py`](services/api/anthropic_client.py))
- Used for: PDF → flashcards, workbooks (Celery), and synchronous UI calls (`POST /ai/invoke`)
- Token usage is logged for cost tracking

### Recommendation

| Option | Verdict |
|--------|---------|
| **Claude Sonnet 4** (current) | **Use this.** Already wired, good at structured JSON (flashcards), strong reasoning on long PDF excerpts. |
| **Add Gemini** | Only if you need a second provider (cost, region, or A/B). Requires new client module, env vars, and changes in `ai_tasks.py` / `routers/ai.py`. Not a “flip a switch” change. |
| **OpenAI** | Same story — not in `.env.example`; would be new integration. |

**Practical advice:** Set `ANTHROPIC_API_KEY` and ship. Add Gemini later only with a clear reason (e.g. cheaper batch generation).

### How to configure Claude (development)

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/).
2. In root `.env`:

   ```env
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ENVIRONMENT=development
   ```

3. Ensure the **Celery worker** is running (flashcard jobs run there, not in the HTTP request).

4. Test: upload a book and trigger generation, or call `POST /ai/invoke` from the API docs with a Bearer token.

### How to configure Claude (production)

When `ENVIRONMENT=production`, the API **does not** read `ANTHROPIC_API_KEY` from `.env`. It loads the key from **AWS Secrets Manager**:

| Variable | Purpose |
|----------|---------|
| `ENVIRONMENT` | Must be `production` to use Secrets Manager |
| `ANTHROPIC_SECRET_ID` | Default: `mindflip/anthropic-api-key` |
| `AWS_SECRETS_REGION` | e.g. `us-east-1` |
| IAM on the API/worker role | `secretsmanager:GetSecretValue` on that secret |

Secret value can be **plain text** (the API key) or JSON, e.g.:

```json
{"ANTHROPIC_API_KEY": "sk-ant-..."}
```

Supported JSON keys: `api_key`, `ANTHROPIC_API_KEY`, `secret`, `value`.

---

## 2. Google Sign-In

### Architecture

```mermaid
sequenceDiagram
  participant Browser as Student app (Vite)
  participant Google as Google Identity
  participant API as FastAPI /auth/google

  Browser->>Google: GoogleLogin (GIS)
  Google-->>Browser: id_token (JWT)
  Browser->>API: POST { id_token }
  API->>Google: Verify signature, aud, iss, exp
  API-->>Browser: access_token + user + refresh cookie
```

- **Frontend** (`@react-oauth/google`): obtains an **ID token** (JWT).
- **Backend** (`POST /auth/google`): verifies the token with `google-auth`, checks `aud` matches your client ID, creates/links user, returns MindFlip JWT.

The **same OAuth client ID** must be used in the browser and on the API:

- `VITE_GOOGLE_CLIENT_ID` — Vite exposes this to the SPA
- `GOOGLE_CLIENT_ID` — API verification audience

### Step-by-step (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (for real users) or **Internal** (Workspace only)
   - Add scopes: `email`, `profile`, `openid`
   - Add test users while in “Testing” mode
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** (local dev):
     - `http://localhost:5173` (student app)
     - `http://localhost:5174` (admin, if you add Google there later)
   - **Authorized redirect URIs**: often not required for the **Google Identity Services** button flow used by `@react-oauth/google`, but if you use redirect-based OAuth, add your callback URLs.
4. Copy the **Client ID** (ends with `.apps.googleusercontent.com`).

### `.env` (web)

```env
VITE_GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_ID=123456789-xxxx.apps.googleusercontent.com
```

Use the **exact same** value for both.

### What’s already in the repo

| Piece | Location |
|-------|----------|
| Google provider wrapper | [`src/main.jsx`](src/main.jsx) — `GoogleOAuthProvider` when `VITE_GOOGLE_CLIENT_ID` is set |
| Login button | [`src/pages/Login.jsx`](src/pages/Login.jsx) |
| API exchange | [`src/lib/AuthContext.jsx`](src/lib/AuthContext.jsx) → `POST /auth/google` |
| Token verification | [`services/api/services/oauth_auth.py`](services/api/services/oauth_auth.py) |
| Route | [`services/api/routers/auth.py`](services/api/routers/auth.py) — `POST /auth/google` |

If `GOOGLE_CLIENT_ID` is empty, the API returns **503** “Google OAuth is not configured”. If `VITE_GOOGLE_CLIENT_ID` is empty, the Google button is hidden on the login page.

### Rate limiting

Auth routes share Redis rate limits (see `.env.example`):

```env
AUTH_RATE_LIMIT_WINDOW_SEC=60
AUTH_RATE_LIMIT_MAX_REQUESTS=40
```

Set `AUTH_RATE_LIMIT_MAX_REQUESTS=0` to disable in local dev.

### Mobile (Expo) — extra steps

The API route is ready; the mobile app still shows a placeholder alert after Google sign-in.

1. In Google Cloud, create **additional** OAuth clients:
   - **iOS** (bundle ID from `app.json` / Expo config)
   - **Android** (package name + SHA-1 from your keystore)
   - Reuse the **Web client ID** as `webClientId` in Expo (required for Android id token flow)
2. In `mobile/.env`:

   ```env
   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=....apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=....apps.googleusercontent.com
   EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=....apps.googleusercontent.com
   ```

3. Wire [`mobile/app/(auth)/login.tsx`](mobile/app/(auth)/login.tsx) to call the same backend as the web app:

   ```ts
   const { data } = await api.post('/auth/google', { id_token: idToken });
   // store data.access_token, user — same shape as web LoginResponse
   ```

4. For **production**, add the API’s audience: mobile id tokens may use the iOS/Android client as `aud`. The server currently expects `GOOGLE_CLIENT_ID` to match. Options:
   - Use the **web client ID** in Expo’s `webClientId` and ensure tokens are issued for that audience, **or**
   - Extend the API to accept multiple client IDs (comma-separated env var) — not implemented yet.

### Apple Sign-In (optional)

`APPLE_BUNDLE_ID` in `.env.example` is for native Apple tokens (`POST /auth/apple`). Configure in Apple Developer → Identifiers → Services ID / App ID. Web student app does not require it unless you add Sign in with Apple on web.

---

## 3. Stripe billing

### Architecture

```mermaid
sequenceDiagram
  participant App as Student app
  participant API as POST /billing/checkout
  participant Stripe as Stripe Checkout
  participant WH as POST /billing/webhook

  App->>API: Bearer token
  API->>Stripe: Create Customer + Checkout Session
  Stripe-->>App: checkout_url
  App->>Stripe: User pays (hosted page)
  Stripe->>WH: checkout.session.completed
  WH->>API: subscription_tier = student
```

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /billing/checkout` | Bearer JWT | Returns `{ checkout_url }` |
| `POST /billing/webhook` | Stripe signature | Updates `subscription_tier` on user |

Success/cancel URLs (from code):

- `{FRONTEND_URL}/billing/success`
- `{FRONTEND_URL}/billing/cancel`

Free-tier limits return `upgrade_url: "/billing/checkout"` when users hit caps ([`services/api/dependencies.py`](services/api/dependencies.py)).

### Step-by-step (Stripe Dashboard)

1. Create account at [dashboard.stripe.com](https://dashboard.stripe.com). Use **Test mode** for development.
2. **Product → Add product** — e.g. “MindFlip Student”, $8/month.
3. Add a **recurring Price** → copy **Price ID** (`price_...`) → `STRIPE_PRICE_ID`.
4. **Developers → API keys** → copy **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`.
5. **Developers → Webhooks → Add endpoint**
   - Local: use Stripe CLI (below)
   - Production URL: `https://api.mindflip.io/billing/webhook`
   - Events to listen for (minimum, matching [`services/api/routers/billing.py`](services/api/routers/billing.py)):
     - `checkout.session.completed`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
   - Copy **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

### `.env`

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:5173
```

`FRONTEND_URL` must match where your student app runs (used for Checkout redirect URLs).

### Local webhook forwarding

Stripe cannot POST to `localhost` directly. Use the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe login
stripe listen --forward-to localhost:8000/billing/webhook
```

The CLI prints a **webhook signing secret** — put that in `STRIPE_WEBHOOK_SECRET` for local dev (it differs from the Dashboard endpoint secret).

### Frontend (not built yet)

The API is ready; the student app has **no** “Upgrade” button yet. Minimal integration on Profile or a paywall:

```js
const { data } = await client.post('/billing/checkout');
window.location.href = data.checkout_url;
```

Add routes/pages:

- `/billing/success` — thank you + `refreshUser()`
- `/billing/cancel` — return to profile

`subscription_tier` on the user is `"free"` or `"student"` ([`services/api/models/user.py`](services/api/models/user.py)).

### Testing

1. Set all three Stripe env vars.
2. Log in, call `POST /billing/checkout` from http://localhost:8000/docs with Authorize.
3. Open `checkout_url`, pay with test card `4242 4242 4242 4242`.
4. Confirm webhook received and user tier is `student` via `GET /users/me`.

### Production checklist

- Live keys: `sk_live_...`, live `price_...`, live webhook `whsec_...`
- Webhook endpoint on public API URL
- `FRONTEND_URL=https://app.mindflip.io` (or your student app URL)
- Consider [Stripe Customer Portal](https://stripe.com/docs/customer-management) for cancel/manage — not wired in this repo yet

---

## 4. AWS S3 (book uploads)

Used for presigned PDF uploads (`POST /books/upload-url` → client PUTs to S3 → `POST /books/`).

```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=mindflip-books
S3_REGION=us-east-1
```

1. Create an S3 bucket in the chosen region.
2. IAM user or role with `s3:PutObject`, `s3:GetObject`, `s3:PutBucketCors` on that bucket (and `s3:DeleteObject` if you add deletes).
3. **CORS on the bucket** — required for browser presigned `PUT` uploads. Without it you get `No 'Access-Control-Allow-Origin'` in DevTools.

   Config lives in [`infra/s3-cors.json`](../infra/s3-cors.json). Apply after setting AWS env vars:

   ```bash
   cd services/api
   source .venv/bin/activate
   # loads AWS_* and S3_* from repo-root .env via config.py
   python scripts/apply_s3_cors.py
   ```

   Uses `AllowedOrigins: ["*"]` so Vercel preview URLs work; uploads stay protected by short-lived presigned URLs.

For production, prefer an **IAM role** on the API host instead of long-lived access keys.

---

## 5. Transactional email (Resend)

```env
RESEND_API_KEY=re_...
FROM_EMAIL=MindFlip <hello@mindflip.io>
```

1. Sign up at [resend.com](https://resend.com).
2. Add and verify domain **mindflip.io** (SPF/DKIM).
3. Without `RESEND_API_KEY`, the API **skips** sends; registration still works.

Emails are queued on the **Celery worker** (welcome, password reset, challenges, digests). Worker must be running.

---

## 6. Sentry (optional)

| Variable | App |
|----------|-----|
| `VITE_SENTRY_DSN` | Student Vite app |
| `VITE_ENV` | Sentry environment tag (frontend) |
| `SENTRY_DSN_API` | FastAPI |
| `ENVIRONMENT` | Sentry environment tag (API + workers) |
| `SENTRY_VERIFY_SECRET` | Enables `POST /health/sentry-verify` test exception |

Leave DSNs empty to disable. Never commit real DSNs to git.

---

## 7. Core backend & frontend

### Student app (Vite)

```env
VITE_API_URL=http://localhost:8000
```

Restart Vite after changes.

### Database & Redis

```env
DATABASE_URL=postgresql://mindflip:mindflip@localhost:5432/mindflip
REDIS_URL=redis://localhost:6379/0
```

Run migrations: `npm run db:migrate` (see `run.md`).

Neon/Upstash: use the connection strings from your provider; API normalizes `postgresql://` to `postgresql+asyncpg://` for async SQLAlchemy.

### JWT & cookies

```env
JWT_SECRET=<long-random-string>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=30
REFRESH_TOKEN_COOKIE_SECURE=false   # true in production behind HTTPS
REFRESH_TOKEN_COOKIE_PATH=/auth
```

Generate a secret, e.g. `openssl rand -hex 32`.

### CORS

```env
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,https://admin.mindflip.io
```

Every browser origin that calls the API must be listed. Restart API after edits.

---

## 8. Admin & mobile env files

These are **separate** from the root `.env` (called out in `.env.example`):

| File | Key vars |
|------|----------|
| [`apps/admin/.env.example`](apps/admin/.env.example) | `VITE_API_URL` — admin uses email/password, not Google |
| [`mobile/.env.example`](mobile/.env.example) | `EXPO_PUBLIC_API_URL`, optional Google + Sentry |

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Google button missing | Set `VITE_GOOGLE_CLIENT_ID`, restart Vite |
| `Invalid Google token` | `GOOGLE_CLIENT_ID` must match the web client used in the browser |
| `Google OAuth is not configured` | Set `GOOGLE_CLIENT_ID` on API, restart API |
| `Anthropic API not configured` | Set `ANTHROPIC_API_KEY`, `ENVIRONMENT=development`, restart worker |
| AI jobs stuck | Start Celery worker |
| `Stripe billing is not configured` | Set `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` |
| Paid but still `free` tier | Webhook not reaching API — check `stripe listen` or Dashboard delivery logs |
| CORS errors | Add origin to `CORS_ORIGINS` |

---

## 10. Suggested implementation order

1. **Core:** `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `VITE_API_URL`, `CORS_ORIGINS`
2. **Claude:** `ANTHROPIC_API_KEY` + worker
3. **Google:** Cloud OAuth client → `VITE_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_ID`
4. **Stripe:** Product/price → API keys → CLI webhook → frontend checkout button + success/cancel pages
5. **S3:** When testing book upload
6. **Resend:** When testing email flows
7. **Sentry / production secrets:** Before launch

---

## Related files

- [`.env.example`](.env.example) — template
- [`run.md`](run.md) — local dev commands
- [`services/api/anthropic_client.py`](services/api/anthropic_client.py) — Claude client
- [`services/api/routers/billing.py`](services/api/routers/billing.py) — Stripe
- [`services/api/services/oauth_auth.py`](services/api/services/oauth_auth.py) — Google/Apple verification
- [`src/pages/Login.jsx`](src/pages/Login.jsx) — Google Sign-In UI
