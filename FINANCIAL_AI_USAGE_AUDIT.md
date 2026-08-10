# Financial Analytics, Billing, and AI Usage Audit

Audit date: 2026-08-03 UTC  
Scope: current working tree, configured Neon database, local API/worker logs, and configured Stripe test account.  
Method: read-only inspection; no billing records, Stripe objects, or source code were changed.

## Executive conclusion

The financial dashboard is not a valid representation of Stripe billing. It reads only the empty legacy `licenses` table. The active billing pipeline writes to `user_subscriptions` and `credit_purchases`, and never writes a `License`. Consequently every financial metric is zero even though Stripe has four successful subscription payments totaling $19.96 and four active subscriptions across two customers.

Stripe has **zero webhook endpoints configured** in this test account. Therefore none of the 92 Stripe events were delivered to this application. The three newest subscriptions reached `user_subscriptions` through application-side reconciliation; an older active $7.99 subscription remains missing. One customer has three simultaneous Quick subscriptions. This is a real duplicate-charge incident in test mode, not a charting issue.

AI usage is also incomplete and materially mispriced. The database contains 281 successful Anthropic calls with a stored lifetime cost of $9.915259, but direct TOC and metadata requests bypass usage persistence. A successful Anthropic TOC request on 2026-08-03 appears in worker logs while the newest `token_usage` row is 2026-07-27. Haiku 4.5 calls are priced with Sonnet rates; tracked expected lifetime cost is approximately $7.290539–$7.540090, so stored cost is overstated by approximately $2.375169–$2.624720 even before adding missing calls.

## Highest-priority findings

| Severity | Finding | Root cause | Classification |
|---|---|---|---|
| Critical | All financial cards use an empty table | `financial_analytics()` queries `licenses`; billing writes `user_subscriptions`/`credit_purchases` | Backend/data-model split |
| Critical | No Stripe events are delivered | Stripe test account has zero webhook endpoints | Missing synchronization/configuration |
| Critical | One customer has three active Quick subscriptions | Checkout occurred three times; only Stripe-subscription uniqueness exists, not one-active-subscription-per-user protection at the provider level | Duplicate billing / concurrency |
| High | One active paid Stripe subscription is absent from DB | No webhook delivery; reconciliation recovered only the newer customer's subscriptions | Missing synchronization |
| High | No invoice/payment/refund ledger exists | There are no invoice, payment, transaction, or revenue tables; subscription payments are not persisted | Missing data model |
| High | Webhook dedupe can permanently discard failed events | Redis event key is set before DB work; a retry returns success even if the first DB transaction failed | Backend idempotency bug |
| High | AI usage omits direct TOC and metadata calls | Those call sites invoke Anthropic directly without `log_token_usage()` | Missing instrumentation |
| High | Haiku cost is calculated at Sonnet rates | One global price constant is used regardless of `model` | Incorrect cost formula |
| High | Failed AI calls cannot be counted | Rows are inserted only after successful responses and have no status/error/provider fields | Missing observability schema |
| Medium | Historical revenue chart is not revenue | It groups active licenses by license creation month, not paid invoices by payment date | Incorrect SQL/definition |
| Medium | Cache cost cannot be reconstructed exactly | Cache read and write tokens are merged into `cached_tokens`; calculation also subtracts them from uncached input | Schema/formula bug |
| Medium | Scheduled Celery jobs are configured but no beat service is running | Compose has API, worker, Redis, optional Postgres, but no Celery beat process | Operations/configuration |
| Medium | Subscription and credit tables lack database foreign keys | Migrations created UUID columns without FK constraints | Migration/schema issue |
| Low | One of ten users lacks country and continent | Nullable/incomplete profile geography | Missing data |

## Raw evidence

### Database inventory

Only these table names matched users/subscriptions/invoices/payments/transactions/organizations/plans/usage/credits/tokens/analytics/revenue/licenses:

| Table | Rows | Latest record |
|---|---:|---|
| `users` | 10 | 2026-07-25 07:33:20 UTC |
| `licenses` | 0 | none |
| `plans` | 4 | 2026-07-23 07:09:33 UTC |
| `user_subscriptions` | 3 | 2026-08-03 20:52:35 UTC |
| `credit_purchases` | 0 | none |
| `credit_ledger` | 1 | 2026-08-03 21:00:05 UTC |
| `token_usage` | 281 | 2026-07-27 06:53:00 UTC |

There are no invoice, payment, charge, refund, transaction, organization, analytics-fact, or revenue-ledger tables.

Database migration is current: `d6e7f8g9h0i1 (head)`.

### Raw subscription records

All three local rows belong to user `9aa62613-9502-4f2c-8c4a-eed7941c75c4`, plan `quick_72`, interval `monthly`, status `active`:

| Stripe subscription | Created UTC | Period end |
|---|---|---|
| `sub_1U0SXWRxROY1vGXK7XFS19dV` | 2026-08-03 20:49:33 | null |
| `sub_1U0SoURxROY1vGXKF43mBMAp` | 2026-08-03 20:51:06 | null |
| `sub_1U0SqVRxROY1vGXKAEmYiyfg` | 2026-08-03 20:52:35 | 2026-09-03 20:52:26 |

Integrity checks:

- User orphans: 0
- Plan orphans by current data: 0
- Users with multiple active/trialing/past-due rows: 1 (three rows)
- Missing subscription Stripe IDs: 0
- Missing billing intervals: 0
- Missing period ends: 2
- Database FK constraints on `user_subscriptions.user_id/plan_id`: absent

### Stripe test-account reconciliation

Configuration: test secret key present; webhook signing secret present; **webhook endpoints: 0**.

Objects:

- Products: 5 (four current products plus legacy Premium)
- Prices: 11 (Quick $3.99/month, $24/year; Standard $6.99/month, $42/year; Premium $8.99/month, $54/year; three one-time credit prices; two legacy Premium prices)
- Customers: 4
- Checkout sessions: 12 total; 4 complete/paid and 8 expired/unpaid
- Active subscriptions: 4
- Paid invoices: 4
- Successful payment intents: 4
- Successful charges: 4
- Refunds: 0
- Stripe events: 92; all show `pending_webhooks=0` because no endpoint exists

Successful payments:

| Date UTC | Customer/user | Plan | Amount | DB subscription |
|---|---|---|---:|---|
| 2026-07-21 07:20 | `cus_UvOl…` / `28137ea0…` | Legacy Premium | $7.99 | Missing |
| 2026-08-03 20:32 | `cus_V0TT…` / `9aa62613…` | Quick | $3.99 | Present |
| 2026-08-03 20:50 | `cus_V0TT…` / `9aa62613…` | Quick | $3.99 | Present |
| 2026-08-03 20:52 | `cus_V0TT…` / `9aa62613…` | Quick | $3.99 | Present |

Every successful payment does **not** appear in a database payment record. There is no such subscription-payment table, `licenses` is empty, and `credit_purchases` is only for one-time credit checkout.

### Webhook validation and failures

Signature verification itself is correctly implemented: the handler reads exact raw bytes and calls `stripe.Webhook.construct_event(payload, stripe-signature, STRIPE_WEBHOOK_SECRET)` before processing.

No failed webhook deliveries can be listed because no Stripe webhook endpoint exists and no webhook-event/audit table exists. This is worse than a list of failed deliveries: all 92 events had no delivery target. Recent local API logs contain no `POST /billing/webhook` request.

Handled event types are incomplete. The code handles checkout completion, subscription create/update/resume/pause/delete, `invoice.payment_failed`, and `invoice.payment_succeeded`. It does not persist or reconcile `charge.refunded`, refund updates/failures, payment-intent failures, `checkout.session.async_payment_*`, `invoice.paid`, or the newer `invoice_payment.paid` event observed in Stripe.

The Redis dedupe key is written before DB processing. If processing throws, Stripe's retry finds the key and receives `{"received": true}` without replaying the transaction. Dedupe must instead be a durable DB event row with `processing/succeeded/failed` state, committed atomically with side effects.

## Financial metric trace and reconciliation

### Current implementation

Source: `services/api/routers/admin_analytics.py`, `financial_analytics()`.

```sql
-- monthly_rev = price / billing_period_months
SELECT COALESCE(SUM(price / NULLIF(billing_period_months, 0)), 0)
FROM licenses
WHERE status IN ('active', 'paid');

SELECT COUNT(DISTINCT user_id)
FROM licenses
WHERE status IN ('active', 'paid');
```

- MRR = sum of normalized active license price
- ARR = MRR × 12
- Paying users = distinct active/paid license users
- ARPU = MRR / paying users
- Revenue over time = the same normalized license amount grouped by `licenses.created_at` for the last 365 days
- Plan/continent/country = active licenses grouped by plan or joined user geography

Because `licenses` has zero rows, MRR, ARR, payers, and ARPU are zero and all breakdown arrays are empty. This is a backend/data-source bug, not caching or a frontend chart bug. The API returns 200 and the frontend renders the returned values correctly. Its only fallback is a synthetic twelve-month zero series when the API array is empty.

### Recalculated values

Two truths must be shown until duplicate subscriptions are remediated:

| Metric | Dashboard | Stripe provider state | Current DB subscription state |
|---|---:|---:|---:|
| MRR | $0.00 | $19.96 | $11.97 inferred from configured Quick price |
| ARR run rate | $0.00 | $239.52 | $143.64 |
| Paying users/customers | 0 | 2 | 1 |
| ARPU | $0.00 | $9.98 | $11.97 |
| Active subscriptions | not shown | 4 | 3 |

Provider-state revenue breakdown:

- Revenue collected July 2026: $7.99
- Revenue collected August 2026: $11.97
- August growth versus July: 49.81%
- Revenue by plan: Quick $11.97; legacy Premium $7.99
- Revenue by continent: Oceania $11.97; Africa $7.99
- Revenue by country: Australia $11.97; Nigeria $7.99
- New paying customers in August: 1
- Monthly active paying customers in August: 1
- Observed churn: 0 (no canceled subscription exists), but historical churn cannot be calculated reliably without a subscription-event history
- Realized lifetime revenue per paying customer: $19.96 / 2 = $9.98
- Annual-plan revenue collected: $0.00; ARR is a run-rate, not collected annual revenue

The provider numbers are financially real test charges, but three Quick subscriptions for one user are anomalous. After cancellation/refund of unintended duplicates, normalized MRR will change. Do not “fix” analytics by simply counting all duplicates without surfacing the conflict.

Revenue-over-time SQL is conceptually wrong even if `licenses` were populated: it counts only currently active licenses and groups by license creation date. Canceling a license would erase historical revenue, and renewals would never create monthly revenue points. Revenue charts must aggregate paid invoice/payment ledger rows by `paid_at` and subtract refunds.

## AI usage and cost audit

### Providers found

Only Anthropic is configured or called. No application call sites or configuration were found for OpenAI, Gemini, Groq, Together AI, OpenRouter, Replicate, Mistral, xAI, or DeepSeek. Image, audio, and embedding request tracking does not exist; observed application counts are therefore 0, with confidence high for this codebase but not a substitute for provider-console reconciliation.

### Stored totals

| Metric | Stored |
|---|---:|
| Successful tracked calls | 281 |
| Failed tracked calls | unavailable |
| Input tokens | 595,404 |
| Output tokens | 532,369 |
| Cached tokens | 78,363 |
| Lifetime stored cost | $9.915259 |
| Today/week/month cost (2026-08-03 UTC) | $0.00 / $0.00 / $0.00 |
| Latest tracked request | 2026-07-27 06:53 UTC |

The zero current-period values are false/incomplete: worker logs show a successful Anthropic request at 2026-08-03 21:03:17 UTC for TOC extraction.

Tracking completeness:

- 131/281 legacy rows have null duration, feature type, and metadata.
- All rows lack provider, response status, error code, request ID, cache-read tokens, and cache-write tokens.
- Direct `extract_toc_with_ai()` and `infer_metadata_from_text()` calls are untracked.
- Failed calls and retries are logged only as text and do not create usage rows.
- Main generation calls suppress persistence failures (`token_usage_persist_failed`) and continue, creating additional silent omissions.

### Cost verification

Stored calculator uses $3/M input, $15/M output, $0.30/M cache read, and $3.75/M cache write for every model. Official Haiku 4.5 pricing is $1/M input, $5/M output, $0.10/M cache read, and $1.25/M cache write.

| Model | Calls | Stored cost | Expected cost range | Discrepancy |
|---|---:|---:|---:|---:|
| `claude-haiku-4-5` | 128 | $3.788259 | $1.252358–$1.262759 | over by $2.525500–$2.535901 |
| `claude-sonnet-4-6` | 153 | $6.127000 | $6.038181–$6.277331 | -$0.150332 to +$0.088819 |
| Total tracked | 281 | $9.915259 | $7.290539–$7.540090 | over by $2.375169–$2.624720 |

Ranges are necessary because historical rows combine cache reads and writes. The implementation also incorrectly subtracts cache tokens from `input_tokens`; Anthropic usage reports these categories separately. Store uncached input, 5-minute cache creation, 1-hour cache creation, cache read, output, and provider-reported cost separately.

The dashboard's cache hit calculation `cached_tokens / input_tokens` is ambiguous and can exceed/understate the provider definition because input and cache categories are separate. Use `cache_read / (uncached_input + cache_read + cache_creation)` with a documented definition.

## Frontend/API trace

Financial path:

`FinancialAnalytics.jsx` → `useAdminDashboard('/admin/financial-analytics')` → `GET /admin/financial-analytics` → `financial_analytics()` → `licenses`.

AI path:

`AiUsageAnalytics.jsx` → `GET /admin/ai-usage` and paginated `GET /admin/ai-usage/logs` → SQL aggregates over `token_usage`.

Observed API requests return HTTP 200. React Query uses one retry and no explicit stale time; there is no server or frontend cache causing financial zeros. Chart field names match response schemas. Financial charts are empty because the backend sends empty arrays. AI logs pagination is correct (`limit=50`, `offset`), but summary totals cannot include missing rows.

Frontend timezone display uses browser-local `toLocaleString()` for `updated_at`; backend financial windows mix `date.today()` with UTC construction. Use `datetime.now(UTC).date()` consistently. More importantly, invoice revenue needs explicit half-open UTC boundaries (`paid_at >= start AND paid_at < end`). No fiscal-year logic exists.

## Logging and operations

- API and worker are running; Redis is healthy.
- Recent API financial/AI dashboard requests return 200.
- Worker runs as root (Celery security warning).
- Celery task events are disabled, limiting retrospective success/failure counts.
- One recent `presentation_pdf_detect_failed` warning fell back successfully; TOC job completed.
- No recent AI rate-limit, timeout, or terminal job failure appeared in the available 400-line logs.
- No webhook requests appeared in recent API logs.
- Beat schedules are defined, but no Celery beat container/process is running, so monthly refills and scheduled automation will not execute from Compose.
- Logs are ephemeral container output, not a durable audit source.

## Recommended implementation

1. Create `billing_events` with unique Stripe event ID, type, status, attempt count, payload hash, error, received/processed timestamps. Claim, process, and mark success transactionally; allow failed events to retry.
2. Configure a Stripe webhook endpoint for `/billing/webhook` with the exact deployed API URL and subscribe to the implemented event set plus refund/payment failure events. Verify in Stripe Workbench, then replay all recoverable events.
3. Reconcile all Stripe customers/subscriptions/invoices/charges into durable local tables. Cancel/refund unintended duplicate Quick subscriptions with explicit operator approval.
4. Replace or retire `licenses`. Make `user_subscriptions` the entitlement source and paid invoice/payment/refund rows the revenue source. Never derive realized revenue from plan catalog prices.
5. Add DB FKs for subscription/purchase/ledger user and plan IDs; add a constraint or transaction-level guard enforcing one current subscription per user, plus Stripe-side idempotency that cannot produce a second subscription.
6. Build financial queries from paid payments: MRR from current non-conflicted subscriptions; revenue/churn/growth/LTV from immutable invoice/payment/refund facts.
7. Centralize every AI provider call behind an instrumented wrapper that writes an attempt row before calling and updates status, token categories, latency, provider request ID, error, and provider-reported cost afterward.
8. Use a versioned per-provider/per-model pricing table with effective dates. Preserve cache-read/write fields and store both estimated and provider-billed cost.
9. Add Anthropic Admin Usage/Cost API reconciliation if an admin API key is available; alert when provider totals and local totals diverge.
10. Run Celery beat as a separately monitored service, enable durable task events/monitoring, and run worker as a non-root user.

## Suggested canonical SQL

```sql
-- Active subscription conflicts
SELECT user_id, COUNT(*), ARRAY_AGG(stripe_subscription_id)
FROM user_subscriptions
WHERE status IN ('active', 'trialing', 'past_due')
GROUP BY user_id
HAVING COUNT(*) > 1;

-- Realized monthly revenue after introducing payments/refunds
SELECT date_trunc('month', paid_at AT TIME ZONE 'UTC') AS month,
       SUM(amount_paid_cents - amount_refunded_cents) / 100.0 AS revenue_usd
FROM payments
WHERE status = 'succeeded'
GROUP BY 1
ORDER BY 1;

-- MRR after reconciliation; use actual subscription item unit amount
SELECT SUM(
  CASE interval
    WHEN 'month' THEN unit_amount_cents::numeric / interval_count
    WHEN 'year' THEN unit_amount_cents::numeric / (12 * interval_count)
  END
) / 100.0 AS mrr_usd
FROM subscriptions
WHERE status IN ('active', 'trialing', 'past_due')
  AND conflict_state IS NULL;

-- Stored AI totals and completeness
SELECT model, COUNT(*), SUM(input_tokens), SUM(output_tokens),
       SUM(cached_tokens), SUM(estimated_cost_usd),
       COUNT(*) FILTER (WHERE duration_ms IS NULL) AS missing_duration
FROM token_usage
GROUP BY model;
```

## Dashboard validation matrix

| Card/widget | Displayed | Provider-backed expected | Confidence |
|---|---:|---:|---|
| MRR | $0.00 | $19.96 before duplicate remediation | High |
| ARR | $0.00 | $239.52 before duplicate remediation | High |
| Paying Users | 0 | 2 | High |
| Avg Revenue/User | $0.00 | $9.98 | High |
| Revenue Over Time | empty/zeros | Jul $7.99; Aug $11.97 | High |
| Revenue by Plan | empty | Quick $11.97; legacy Premium $7.99 | High |
| Revenue by Continent | empty | Oceania $11.97; Africa $7.99 | High |
| Revenue by Country | empty | Australia $11.97; Nigeria $7.99 | High |
| AI lifetime calls | 281 | at least 282; exact provider count unavailable | Medium |
| AI lifetime cost | $9.915259 | tracked rows $7.290539–$7.540090 plus missing calls | High for tracked rows; low for complete lifetime |
| AI today/week/month | $0 | greater than $0 due to untracked Aug 3 TOC call | High |

## Prioritized action plan

**Immediate:** stop duplicate subscription creation, configure the webhook endpoint, preserve/replay events, reconcile four active subscriptions, and obtain approval before canceling/refunding duplicates.

**Next:** introduce payment/invoice/refund and webhook-event ledgers; migrate the dashboard off `licenses`; correct all financial definitions and UTC boundaries.

**Then:** centralize AI instrumentation, correct model-specific pricing, add missing token/status fields, backfill what can be reconstructed, and reconcile against Anthropic provider reports.

**Operational hardening:** add Celery beat, durable logs/alerts, webhook and provider reconciliation tests, and dashboards for sync lag, duplicate subscriptions, failed webhooks, and missing AI usage rows.
