# MindFlip performance audit

## Baseline (2026-08-11)

- Routing: React Router 6 browser router. Protected routes nest `RequireAuth`,
  `RequireOnboarding`, and `AppLayout` in `src/App.jsx`.
- Before this pass, `App.jsx` statically imported all 37 page modules. Vite emitted one
  application JavaScript chunk: **1,673.11 kB minified / 469.77 kB gzip**.
- Build warning: the application chunk exceeded Vite's 500 kB warning threshold.
- Auth startup: `AuthProvider` restores an access token from web storage. With remembered
  login and no token it calls `POST /auth/refresh`, then `GET /users/me`. These are
  sequential by necessity. Protected routes formerly showed a full-screen spinner until
  verification completed. Axios also performs a single-flight refresh and queues requests
  after a 401.
- Server-state cache: TanStack React Query, with 5 minute `staleTime`, 30 minute `gcTime`,
  retry 1, and no focus refetch. There is also a user-scoped core-data cache and IndexedDB
  offline progress cache.
- Global startup: `AppLayout` previously prefetched books, flashcard sets, analytics,
  entitlements, and recent quiz results on every authenticated route. React Query deduped
  matching keys, but this made Dashboard traffic global and competed with the requested page.
- Dashboard requests: `GET /billing/entitlements/me`, paginated `GET /books/`,
  `GET /flashcard-sets/?include_cards=false`, `GET /analytics/summary`,
  `GET /quiz-results/?page=1&size=2`, and (when entitled) `GET /quiz-challenges/`.
  React Query starts independent enabled queries concurrently. Books may issue additional
  sequential pages because `fetchAllBooksPages` follows pagination. Entitlements is shared
  with navigation and deduped by query key/cache.
- Dashboard critical data: user (from auth), books, sets, analytics. Recent quiz results and
  challenges are secondary. A bootstrap endpoint is not yet justified: removing global
  overfetch and measuring the independent requests is lower risk, preserves independent
  caching, and avoids a broad coupled response.
- Library already renders its heading, controls, and an eight-card section skeleton while
  books load; it does not replace the whole page with a spinner.

## Backend and database findings

- Initial authenticated startup uses auth refresh when needed and `/users/me`. Dashboard uses
  the six endpoint families listed above.
- The async SQLAlchemy engine is created once per API process and uses the default bounded
  connection pool with `pool_pre_ping=True`; sessions are request-scoped. The worker creates
  one reusable sync engine. Deployment documentation requires Neon's pooled URL.
- `/analytics/summary` currently performs multiple aggregate queries sequentially (totals,
  set/card counts, time, badges, trend, weak topics, rating bands, and activity). Timing data
  should determine whether combining or safely parallelizing these is worth the added query
  complexity. A single `AsyncSession` must not execute concurrent operations.
- Entitlements also makes repeated plan/credit decision queries. It is cached client-side for
  five minutes, but server timing/query counts should guide a future repository-level pass.
- No query-plan evidence was available in the local environment, so no speculative indexes
  were added.

## Infrastructure review

- Repository configuration documents Railway for API/workers, Neon pooled Postgres, and
  Upstash Redis, but does not record production Railway, Neon, or Upstash regions.
- Sleep/cold-start settings are also not represented in the repository. Verify them in each
  provider console before changing infrastructure. Co-locate API, database, and Redis where
  practical; changing regions or always-on settings can affect cost and reliability.

## Implemented

- Route-level lazy imports for all page modules with a Suspense page skeleton.
- A non-sensitive authenticated-shell skeleton during session verification; protected page
  content still does not render before authentication succeeds.
- Targeted navigation preload on hover, keyboard focus, and touch.
- Removed Dashboard request prefetching from the global layout. Dashboard queries remain
  concurrent and use the existing React Query cache.
- Request timing for key endpoint families, including total duration, SQL query count, and
  aggregate SQL time. Individual SQL operations over 100 ms produce a parameter-free warning.
  Logs exclude query strings, request/response bodies, headers, SQL text, and credentials.

## Operational verification still required

Collect production `api_timing` logs and browser network traces before claiming API latency
improvements. Confirm provider regions/cold-start settings in their consoles. Run authenticated
browser smoke tests for refresh, protected redirects, logout, Dashboard, Library, billing,
study/generation flows, and responsive navigation against a configured test environment.

## Build comparison

| Build | Initial application JS | Gzip | Route chunks |
| --- | ---: | ---: | --- |
| Baseline | 1,673.11 kB | 469.77 kB | None (all pages eager) |
| Final (entry + modulepreloads) | 641.67 kB | 205.45 kB | Dashboard 15.44 kB, Library 16.52 kB, Study 83.61 kB, Analytics 438.23 kB, plus other route chunks |

The initial JavaScript payload (entry plus its four modulepreloads) decreased by 1,031.44 kB
minified (61.6%) and 264.32 kB gzip (56.3%). This comparison conservatively sums every script
referenced by `dist/index.html`; lazy route chunks are excluded from both sides. This is build
evidence only; real-user latency and cache-hit changes still require production traces. Stable
framework-vendor chunks keep every emitted chunk below Vite's warning threshold.

## Phase 2 focused investigation (2026-08-11)

### 1. Executive verdict

The only remaining bottleneck proven by local measurements was **frontend JavaScript on the
Analytics route**: chart dependencies were bundled into the route before its API request could
start. A second confirmed problem was a database **N+1 pattern in quiz challenge listing**.
React Query navigation reuse worked correctly in the production build with controlled API
responses. Production API latency, cold starts, and Railway-to-Neon geographic latency remain
unclassified because no production timing logs or provider-console metadata were available.

### 2. Production-like frontend measurements

Measurements used the production Vite build in headless Chromium at 1280×800. Authenticated
API responses were deterministic browser interceptions, so these results validate frontend
request/cache/chunk behavior—not production network or backend latency.

| Measurement | Result |
| --- | ---: |
| First paint, cold browser context | 520 ms |
| First contentful paint, cold browser context | 740 ms |
| Dashboard load to network-idle | 1,772 ms |
| Prefetched Dashboard → Analytics shell | 77 ms |
| Analytics → cached Dashboard | 105 ms |
| Dashboard → cached Library | 85 ms |
| Library → cached Dashboard | 66 ms |

The cold network-idle number includes service-worker and controlled local-browser activity and
must not be treated as production LCP or TTI. LCP, long-task, and production transfer evidence
was not obtainable without a deploy target and authenticated production test account.

Hovering Analytics fetched the Analytics route and its small shared modules, made **zero API
requests**, and the click reused that code. The chart chunk loaded after Analytics data became
available. Dashboard → Analytics made no analytics request in this flow because Dashboard's
`["analytics-summary"]` result was reused. Dashboard → Library and both returns made no repeated
core-data requests within the five-minute freshness window. Cold Dashboard made one request
per exact query key; no duplicates were observed.

### 3. Analytics bundle analysis

An ephemeral Vite/Rollup `generateBundle` analysis inspected the modules actually rendered in
the 438,223-byte chunk; no analyzer dependency was installed. Approximate pre-minification
rendered module contributions were Recharts 593 kB, Lodash 194 kB, decimal.js-light 50 kB,
react-smooth 39 kB, D3 scale/shape/time/format/color/array modules over 100 kB combined, and
MindFlip application code 27 kB. These figures are useful composition weights and do not sum
to the final minified chunk size. Recharts' ES modules are used, but its internal chart factory
still brings chart types/utilities not directly referenced, so tree-shaking is only partial.
No PDF, image export, spreadsheet, date/time, Three.js, or mapping dependency is imported by
Analytics.

Before: Analytics route **438.23 kB / 118.87 kB gzip**. After: interactive Analytics shell
**12.83 kB / 4.35 kB gzip**, with one deferred chart chunk **426.48 kB / 115.43 kB gzip**.
Thus code required to enter the route fell 97.1% minified and 96.3% gzip; eventual bytes for a
fully rendered chart page are nearly unchanged. Charts share one lazy boundary to avoid
excessive micro-chunks and show two panel skeletons while loading.

### 4. React Query findings

- Defaults: `staleTime` five minutes, `gcTime` 30 minutes, `refetchOnWindowFocus: false`,
  retry once. `refetchOnMount` is not overridden, so TanStack's default refetches only stale
  mounted queries. Exact-key observers share cache state and in-flight promises.
- Dashboard and Library both use `["books"]`; Dashboard and Flashcard Sets both use
  `["flashcard-sets"]`; Dashboard and Analytics both use `["analytics-summary"]`; navigation
  and feature gates use `["billing-entitlements"]`. Controlled browser evidence confirmed
  reuse during immediate revisits.
- Quiz history intentionally uses `["quiz-results", "history", page]`, while Dashboard uses
  `["quiz-results", "dashboard-recent"]`; their payload sizes and semantics differ, so these
  are not duplicate queries.
- User identity remains AuthContext state, not React Query. Startup makes one `/users/me`
  request after an access token exists. Refresh then `/users/me` is intentionally sequential.
- Core query data is persisted per user for up to 24 hours while retaining original
  `dataUpdatedAt`; entries older than five minutes therefore render from cache and refresh on
  mount. Logout clears the query cache. No stale-time changes were justified.

### 5. API findings

No `api_timing` samples existed in repository files or the running local container, which was
started before the instrumentation was registered. Therefore min/p50/p95/max and a latency
ranking cannot be reported honestly. The controlled browser waterfall confirms request
concurrency and deduplication only. Deploy the instrumented API and aggregate multiple warm and
cold samples for `/users/me`, `/auth/refresh`, entitlements, books, sets, analytics, quiz
results, and challenges before changing endpoint boundaries or cache policy.

Static query-count inspection found `/users/me` returns the already authenticated user and
adds no endpoint query beyond `get_current_user`'s single primary-key lookup. It does not load
subscriptions or entitlements. Books use count plus paginated rows; quiz results batch set and
book enrichment; flashcard-set listing batches card counts and book titles. Analytics uses a
fixed series of sequential aggregate queries, not an N+1, but production timings must establish
whether that fixed work is slow.

### 6. Database findings

`GET /quiz-challenges/` had a confirmed N+1: after selecting challenges it performed three
`db.get` calls per row for the two users and set. It now uses one batched user query and one
batched set query: endpoint relationship work changes from up to `1 + 3N` SQL operations to
three fixed operations (plus the shared auth lookup). No response fields or access rules
changed.

No `slow_sql` samples or statistically slow endpoints were available, so no query plans were
run and no indexes were proposed or added. Existing analytics aggregates and entitlement query
counts are suspected investigation targets, not confirmed performance defects.

### 7. Infrastructure and connection pooling

- `vercel.json` sets no frontend region; Vercel placement behavior is not verifiable here.
- Railway API region and sleep policy are absent from repository/deployment metadata.
- The configured Neon hostname identifies a pooled endpoint in AWS `eu-west-2`. Neon compute
  suspend settings require console access.
- Railway-to-Neon geographic latency cannot be calculated until the Railway region is known.
- API ORM: SQLAlchemy AsyncEngine with asyncpg and a process-reused
  `AsyncAdaptedQueuePool`. Runtime inspection of current defaults: pool size 5, max overflow
  10, timeout 30 seconds, no recycle (`-1`), and pre-ping enabled. Sessions are request-scoped.
  Worker processes each reuse one synchronous psycopg engine with pre-ping.
- The connection URL is a Neon `-pooler` hostname and SSL parameters are mapped for asyncpg.
  There is no evidence of per-request engine creation. Pool size should not be changed without
  concurrency and checkout-wait measurements.

### 8. Changes implemented in Phase 2

1. **Analytics chart boundary** — evidence: 94%+ of rendered module weight was third-party
   chart stack. Change: one lazy chart component after data resolution. Result: route-entry
   chunk 438.23 → 12.83 kB; deferred chart chunk 426.48 kB.
2. **Challenge batch loading** — evidence: three ORM gets inside every challenge loop.
   Change: two `IN` queries and dictionary lookup. Result: relationship query complexity
   `1 + 3N` → fixed 3. Runtime latency is not claimed without deployed samples.

### 9. Remaining issues and operational checks

- **Confirmed:** chart code remains 115.43 kB gzip when charts render; Study remains the next
  larger route at 83.61 kB, but no composition/runtime evidence currently justifies splitting it.
- **Suspected:** sequential Analytics aggregates and repeated entitlement decisions may be
  backend costs. Timing distributions are required.
- **Operational:** collect API/SQL distributions, production cold/warm web vitals, Railway
  region/sleep settings, Neon suspend settings, pool checkout waits, and an authenticated real
  network waterfall. Verify login/logout/refresh and billing against a designated test account.

### 10. Final performance verdict

Phase 2 removed a proven JavaScript gate and a proven N+1 pattern. Local controlled navigation
shows route preloading and five-minute cache reuse working as designed. Overall production
performance is **not declared fixed**: backend latency, SQL distributions, cold starts, real
geographic latency, and real-user web vitals remain unmeasured operational dependencies.

## Billing Performance

### Baseline

Billing & Usage previously returned a full-page skeleton until `GET /billing/overview`
finished. That request performed the local plan, usage, credit, and ledger reads, then a live
Stripe subscription listing and concurrent Stripe invoice and payment-method listings. A free
plan label enabled `POST /billing/subscription/sync`; a successful sync invalidated overview,
producing a second overview and a second complete Stripe waterfall. Pricing started catalog
and entitlement queries together, but authenticated checkout buttons could briefly be
actionable before entitlement state resolved.

### Billing authority model

- Plan and entitlement enforcement come from `UserSubscription`, `Plan`, credit-ledger state,
  and the entitlement service. Server-side entitlement checks remain authoritative.
- Stripe subscription/customer IDs, status, price, interval, paid-through date,
  and the denormalized user tier are synchronized into local state by checkout completion,
  subscription webhooks, invoice webhooks, cancellation, and explicit sync.
- Renewal/end date and cancellation presentation use the synchronized local subscription row.
  Credits and activity come only from local credit records.
- Invoices and masked card brand/last-four/expiry remain live Stripe data and are never inferred.
- Checkout, cancellation, checkout verification, and explicit recovery still
  call the live Stripe subscription resolver. It rejects ambiguous state and never chooses the
  newest subscription. Local multiple-active-ID conflicts are detected before Stripe I/O.
- The fast overview is a synchronized read model. It requests reconciliation only when a Stripe
  customer exists but the local subscription reference is missing. Financial actions do not
  trust this optimization and retain live verification.

### Changes and request waterfall

- `services/api/routers/billing.py`: overview now performs no live Stripe I/O; added authenticated
  `GET /billing/invoices` and `GET /billing/payment-method` endpoints returning minimum display
  fields; added component timing logs and retained action-time reconciliation.
- `src/lib/billing.js`: added independent invoice and payment-method clients.
- `src/pages/BillingUsage.jsx`: renders its heading/safe shell immediately; core, invoices, and
  payment method have independent query keys and loading/error/retry states; sync is gated by
  `needs_reconciliation`, and a successful sync intentionally invalidates overview once.
- `src/components/billing/PricingPlans.jsx`: authenticated plan actions stay disabled while the
  authoritative entitlement snapshot resolves; catalog cards still render from pricing data.
- `services/api/tests/unit/test_billing_performance_split.py`: covers no-Stripe local resolution,
  local conflict preservation, isolated invoice failure, and payment metadata minimization.

```text
BEFORE
Billing -> overview -> DB + Stripe subscriptions + Stripe invoices + Stripe payment methods
        -> sync for every free label -> Stripe subscriptions -> overview again

AFTER (normal synchronized account)
Billing -> safe shell
        -> overview -> DB only -> core plan/credits/actions
        -> invoices -> Stripe invoices (independent)
        -> payment-method -> Stripe payment methods (independent)

AFTER (missing local subscription reference)
Billing -> overview -> needs_reconciliation
        -> one explicit sync -> Stripe subscriptions -> one overview invalidation if state changed
```

Normal Billing navigation now makes one overview, one invoice, and one payment-method HTTP
request per stale cache cycle, with zero Stripe subscription listings. React Query's 60-second
freshness window reuses each result on an immediate route revisit. A missing synchronized
reference adds one subscription listing and, only if synchronization changes state, one
intentional overview refresh. Controlled authenticated browser counts were not available in
this environment, so these counts are architecture/test expectations rather than production
waterfall measurements.

### Timing and instrumentation

Existing `api_timing` middleware measures total and SQL duration for overview, invoices,
payment method, sync, entitlements, and pricing by route. Structured billing
logs additionally split database time for overview and Stripe duration for invoices, payment
method, and sync. No card data, secrets, tokens, or customer payloads are logged. No production
or representative authenticated timing samples were available, so shell, core, invoice,
payment-method, and entitlement milliseconds are intentionally not invented.

### Regression status and remaining risks

The production frontend build, changed-file ESLint, and Python compilation pass. Focused tests
verify local conflict detection without Stripe, isolated secondary failures, masked payment
metadata, and the pre-existing checkout conflict guard. The broader pytest command made partial
progress but did not terminate within the controlled runner window, so paid/canceled,
checkout, cancellation, webhook, and entitlement suites require a full CI run. Existing action
paths were not relaxed: checkout and cancellation continue to use live unique-subscription
resolution; entitlement enforcement is unchanged; conflict plan/price/renewal suppression is
unchanged. Operational verification remains necessary for authenticated free/paid/conflict
waterfalls, route revisits, Stripe timeouts, mobile/desktop layout, logs, and production latency.

## Billing Correctness & Production Validation

### 1. Financial authority model

- Normal Billing and entitlement reads use the synchronized local `UserSubscription`, `Plan`,
  credit ledger, and user projection. `/billing/overview` makes no Stripe request.
- Signed Stripe webhooks update subscription status, price, interval, paid-through date,
  invoices, customer linkage, and credit purchases. Event IDs protect replay; Stripe event
  creation time now protects subscription rows from older updates.
- Checkout, cancellation, checkout verification, and conflict detection use live Stripe
  resolution. More than one access-bearing Stripe subscription is always a conflict, including
  when one ID matches a local row.
- Missing/inconsistent linkage is repaired only by explicit sync, invoice recovery, scheduled
  reconciliation, or webhook delivery. Overview only reports `needs_reconciliation`.
- The removed product trial has not been restored. Stripe's legacy `trialing` value remains an
  access-bearing status solely so pre-existing Stripe records are handled safely.

### 2. Regression matrix

| Starting state | Action/event | Expected | Actual | Result |
|---|---|---|---|---|
| Free, no Stripe subscription | Checkout | One session allowed | Session created with configured price/URLs | PASS |
| Active paid | Checkout | Block duplicate | `ALREADY_SUBSCRIBED`, no session | PASS |
| Multiple local IDs | Resolve/action | Conflict before Stripe selection | Conflict, no arbitrary ID | PASS |
| Local A plus Stripe A and B | Resolve/action | Conservative conflict | Both Stripe rows produce conflict | PASS |
| No local ID, multiple Stripe rows | Resolve/action | Conflict | Conflict returned | PASS |
| Repeated checkout in one window | Two requests | Same Stripe idempotency key | Keys identical | PASS |
| Unique active subscription | Cancel | Modify exact ID, then local canceled state | Exact ID targeted | PASS |
| Multiple subscriptions | Cancel | Block without Stripe mutation | 409 conflict; no modify | PASS |
| Stripe cancellation timeout | Cancel | No false local success | 503; local status and transaction unchanged | PASS |
| Duplicate successful webhook | Redelivery | No repeated side effect | `succeeded` marker short-circuits | PASS |
| Failed webhook attempt | Redelivery | Retry is processed | `processing` marker permits retry | PASS |
| Existing credit purchase session | Duplicate completion | No second grant | DB lookup short-circuits | PASS |
| Newer cancellation, older active event | Out-of-order webhook | Do not regress | Older event ignored | PASS |
| Different events in same Stripe second | Out-of-order webhook | Resolve ambiguity | Current subscription retrieved from Stripe | PASS |
| Invoice payment failure | Webhook | Mark past due | Local row becomes `past_due` | PASS |
| Invoice payment success | Webhook | Reactivate/update period | Local row active with new period | PASS |
| Missing subscription linkage | Paid invoice | Recover unique local row | Customer/price linkage created | PASS |
| Expired row plus stale paid user tier | Entitlement read | Paid access denied | Plan resolves to Free | PASS |
| Secondary Stripe failure | Invoice/payment query | Core remains independent | Localized endpoint error | PASS |
| Entitlement request unresolved/failed | Pricing render | No checkout action | Account action remains disabled | PASS |

### 3. Webhook findings

The prior Redis implementation marked an event before its handler succeeded. A handler failure
could therefore cause Stripe's retry to be acknowledged without processing. Redis now records
`processing` first and only records `succeeded` after handler completion; retries of processing
events continue. Credit purchases also retain database idempotency by Checkout Session ID,
invoice facts by invoice ID, subscription rows by subscription ID, credit grants by ledger grant
identity, and billing event facts by Stripe event ID.

The subscription projection previously had no ordering field, allowing an older active update
to overwrite a newer cancellation. `UserSubscription.stripe_event_created_at` and migration
`a7b8c9d0e1f2` now reject older events. Stripe timestamps have one-second resolution; when two
different deliveries tie, the handler retrieves the current subscription from Stripe instead
of trusting arrival order. Checkout completion no longer upgrades the denormalized user tier
from session metadata; canonical subscription webhooks or explicit reconciliation do that.

### 4. Checkout findings

Checkout performs live subscription listing after serialized customer creation. Any active
subscription blocks checkout and any multiplicity blocks it as a conflict. Local linkage no
longer masks a second Stripe subscription. The existing ten-minute, user/plan/interval-derived
Stripe idempotency key is identical for rapid repeated requests, so Stripe returns the same
session rather than creating overlapping sessions.

### 5. Cancellation findings

Cancellation requires one live-resolved subscription and then loads the local row by that exact
Stripe ID. Conflicts never select an ID. Stripe modification now runs off the event loop and
maps failures to `503 CANCELLATION_UNAVAILABLE`; local status is changed and committed only
after Stripe confirms `cancel_at_period_end=true`. Repeated modification is safe at Stripe and
preserves the same local state. Paid-through access remains until `current_period_end`.

### 6. Entitlement findings

Server-side `can_user_do` remains authoritative. The entitlement plan resolver now reads the
latest local subscription row once. An access-bearing, paid-through row resolves its plan; a
known expired or ineligible row resolves Free and cannot fall back to a stale paid
`User.subscription_tier`. Only users with no local subscription history use that legacy tier
fallback. Frontend plan cards never enable authenticated checkout while entitlement state is
pending or failed.

### 7. Drift recovery

- Stripe active/local missing: overview signals reconciliation; explicit sync uniquely resolves
  and writes the row, then Billing invalidates overview once.
- Stripe canceled/local active: webhook, explicit sync, or scheduled reconciliation writes the
  current Stripe state; overview itself remains local-only.
- One Stripe subscription/local ID missing: unique live resolution repairs linkage.
- Multiple Stripe subscriptions/local ID missing or present: conflict, never selection.
- Local expired/Stripe not yet reconciled: entitlement access fails closed until controlled
  reconciliation succeeds.

### 8. Browser request counts

No safe authenticated browser fixture or designated Stripe test account was available. Browser
timings and real free/paid waterfalls were not fabricated. Architecture and query-key audit
expect one overview, invoice, and payment-method request per 60-second freshness cycle; normal
complete free state produces no sync. A missing projection permits one sync and one overview
invalidation only when state changes.

### 9. Full test results

- Backend billing, checkout, cancellation, webhook, credit, entitlement, conflict, persistence,
  and cookie-auth selection: **109 passed, 0 failed, 0 skipped, 0 stalled** (2.24 seconds).
- Billing frontend utility suite: **1 file passed, 0 failed**.
- Focused webhook guardrails, including same-second reconciliation, are included in the final
  backend count above.
- Frontend production build: passed. Changed frontend ESLint: passed. Python compile: passed.
- Alembic: one head (`a7b8c9d0e1f2`); offline PostgreSQL upgrade SQL generated successfully.
- The earlier stall was isolated to real executor behavior leaking through two Stripe unit-test
  mocks. Replacing those with `AsyncMock` made the complete selection terminate.

### 10. Production operational checks

Live production access was unavailable. Before deployment/after rollout, verify:

1. Apply migration `a7b8c9d0e1f2` before new application workers start.
2. Stripe webhook endpoint returns 2xx; inspect recent failed and retried deliveries.
3. Count `billing_events` duplicate IDs/statuses and `processing` events older than the handler SLA.
4. Measure webhook receive-to-processed latency and same-second Stripe reconciliation calls.
5. Calculate p50/p95 for overview, invoices, payment method, sync, and entitlements.
6. Calculate Stripe API p50/p95/error rate for sync, checkout resolution, cancellation, and ties.
7. Monitor billing 4xx/5xx rate, cancellation failures, and invoice/payment-method errors.
8. Count users with multiple access-bearing local or Stripe subscriptions.
9. Measure `needs_reconciliation` and explicit-sync frequency plus outcomes.
10. Verify free, paid, canceled-at-period-end, expired, conflict, and missing-link accounts using
    designated Stripe test customers; record request waterfalls and console output.

### 11. Final verdict

`BILLING VALIDATED WITH OPERATIONAL FOLLOW-UPS`
