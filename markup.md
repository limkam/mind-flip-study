# MindFlip — Pricing & Unit Economics (markup)

Research date: **May 2026**  
Stack: **AWS** (hosting, S3, Secrets Manager) + **Anthropic Claude** (Sonnet 4) + **Stripe** (subscriptions) + **Resend** (email)

This document answers whether **$3.99/mo (Student)** and **$7.99/mo (Premium)** are viable, what you actually spend, and how margin changes as you grow.

---

## TL;DR

| Question | Answer |
|----------|--------|
| Are **$3.99** and **$7.99** okay? | **Yes for early launch**, if you cap abusive AI usage and keep infra lean. Student tier is tight for power users; Premium exists partly to absorb heavier AI + support. |
| Biggest cost risk? | **Anthropic API** (variable, scales with generations), not AWS at small scale. |
| Biggest fixed cost? | **Always-on compute + load balancer** (~$50–120/mo on a typical small AWS setup). |
| Break-even (rough)? | **~25–45 paying subscribers** depending on AWS choices and average AI usage. |
| Pricing inconsistency in repo | Marketing site shows **$8/mo**; app checkout shows **$3.99 / $7.99**. Align before launch. |

---

## What MindFlip charges today (in code)

| Surface | Plans | Notes |
|---------|-------|-------|
| App (`UpgradeSection.jsx`) | **Student $3.99**, **Premium $7.99** | Stripe `basic` → tier `student`; `premium` → tier `premium` |
| Marketing (`PricingSection.tsx`) | **Free $0**, **Student $8/mo** ($72/yr) | Out of sync with app |
| Free tier limits | 3 books, 3 sets, 20 cards total | `FREE_TIER_LIMITS` in `dependencies.py`; gated by `FREE_TIER_PAYWALL_ENABLED` |
| Paid tiers | Unlimited books/sets/cards | Any non-`free` tier bypasses limits |

**AI model in production code:** `claude-sonnet-4-20250514`  
**Typical AI workloads:**
- PDF → flashcards (Celery, up to **15,000 chars** of PDF text per call, **4,096** max output tokens)
- PDF → workbook (same context window)
- Table of contents on upload (`POST /ai/invoke`, title/author only — cheap)
- Chapter summaries / misc (`POST /ai/invoke`)

Token costs are logged with the same rates Anthropic publishes for Sonnet-class models (`token_usage_log.py`: **$3 / 1M input**, **$15 / 1M output**).

---

## Revenue you keep (after Stripe)

Stripe US online cards (typical): **2.9% + $0.30** per charge.  
Stripe Billing (subscriptions): **+0.7%** of billing volume ([Stripe pricing](https://stripe.com/pricing)).

| Plan | List price | Est. Stripe fee | **Net per month** |
|------|------------|-----------------|-------------------|
| Student | $3.99 | ~$0.44 | **~$3.55** |
| Premium | $7.99 | ~$0.59 | **~$7.40** |

Add **+1.5%** for international cards and **+1%** if currency conversion applies — important if you sell globally.

**Annual plans:** Stripe still takes a % per charge; annual $72 @ $8/mo equivalent → ~$2.39 fee → **~$69.61 net** if you keep marketing’s yearly price.

---

## Variable cost #1 — Anthropic (per user, per month)

### Cost per AI operation (estimated)

Assumptions match `ai_tasks.py`: ~**5,000 input tokens** (15k-char PDF excerpt + prompts), **2,500 output tokens** for a medium flashcard job. Adjust linearly for larger sets.

| Operation | Input tok | Output tok | Est. cost |
|-----------|-----------|------------|-----------|
| TOC on upload (`/ai/invoke`) | ~400 | ~600 | **~$0.01** |
| Flashcard generation (30 cards) | ~5,000 | ~2,500 | **~$0.05** |
| Workbook generation | ~5,000 | ~3,500 | **~$0.07** |
| Heavy flashcard run (max output) | ~5,000 | ~4,096 | **~$0.08** |

Official Sonnet 4.x API pricing (May 2026): **$3 / MTok input**, **$15 / MTok output** — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing).

### Monthly AI cost by user behavior

| Persona | Behavior / month | Est. AI cost |
|---------|------------------|--------------|
| Light paid | 2 books, 3 flashcard jobs | **~$0.20** |
| Typical student | 5 books, 8 flashcard jobs, 1 workbook | **~$0.65** |
| Power user | 10 books, 20 flashcard jobs, 3 workbooks | **~$1.50** |
| Abusive / unlimited | 50+ generations | **~$3.00–5.00+** |

**Implication:** At **$3.99**, a typical student still leaves **~$2.90+** after Stripe + AI. A power user on Student can squeeze margin; Premium at **$7.99** is where heavy AI users should land.

**Mitigations (recommended before scale):**
- Monthly AI generation caps per tier (e.g. Student 30 jobs/mo, Premium 100)
- Queue priority only (marketing promise) — does not reduce cost
- Consider **Haiku 4.5** for TOC / simple JSON tasks (~5× cheaper) — not implemented today
- **Prompt caching** for repeated PDF context (cache read ≈ **0.1×** input price) — not implemented today

---

## Variable cost #2 — AWS & adjacent services

MindFlip’s architecture (from `docker-compose.yml` + `INTEGRATIONS.md`): **FastAPI**, **Celery worker**, **Postgres**, **Redis**, **S3** (PDFs), optional **CloudFront**, **Secrets Manager** for Anthropic key in prod.

### Scenario A — Lean launch (recommended 0–500 users)

| Service | Config | Est. $/mo |
|---------|--------|-----------|
| **Neon Postgres** (Launch, usage-based) | Small prod DB, scale-to-zero | **$15–25** |
| **ECS Fargate** — API | 0.25 vCPU, 0.5 GB, 1 task | **~$9** |
| **ECS Fargate** — Celery worker | 0.25 vCPU, 0.5 GB, 1 task | **~$9** |
| **Application Load Balancer** | 1 ALB | **~$22** |
| **ElastiCache Redis** | `cache.t4g.micro` | **~$12** |
| **S3** | ~20 GB PDFs + requests | **~$1–3** |
| **CloudFront** | Static marketing/app assets, low traffic | **~$0–5** |
| **Route 53 + Secrets Manager + CloudWatch** | Minimal | **~$5–8** |
| **Resend** (email) | Free tier ≤3,000 emails/mo | **$0** |
| **Sentry** | Developer free tier | **$0** |
| **Total fixed (approx.)** | | **~$75–95/mo** |

Using **Neon free** for staging only; prod on Launch avoids managing RDS backups yourself.

### Scenario B — Single EC2 (cheaper, more ops)

| Service | Config | Est. $/mo |
|---------|--------|-----------|
| **EC2 t3.small** | API + worker + Redis in Docker | **~$15–18** |
| **Neon Launch** | Managed Postgres | **$15–25** |
| **S3 + CloudFront + DNS** | As above | **~$5–10** |
| **Total** | | **~$35–55/mo** |

Trade-off: you operate patching, scaling, and backups on the box.

### Scenario C — Growth (~2k–10k MAU)

Expect **$300–800+/mo**: larger Fargate fleet, RDS/Aurora or bigger Neon, more S3/egress, Redis cluster, WAF, higher CloudWatch, dedicated support tooling.

Reference: cost-optimized SaaS on AWS often lands **~$90–160/mo** at “launch” and **$7k–8k/mo** at serious scale ([Factual Minds AWS stack write-up](https://www.factualminds.com/blog/cost-optimized-saas-stack-aws-end-to-end/)).

### S3 storage (PDFs) — usually negligible early

Example: **200 users × 5 PDFs × 8 MB** ≈ **8 GB** → ~**$0.20/mo** storage + pennies for PUT/GET.

---

## Full monthly spend model

### Fixed costs (you pay regardless of subscribers)

| Stage | Low | Mid | High |
|-------|-----|-----|------|
| Infrastructure | **$40** (EC2 + Neon lean) | **$85** (Fargate + ALB + Neon) | **$150** (HA, staging env) |
| Tools (Resend Pro, Sentry, domain) | **$0** | **$20** | **$50** |
| **Fixed subtotal** | **~$40** | **~$105** | **~$200** |

### Per paying subscriber (variable)

| Component | Student ($3.99) | Premium ($7.99) |
|-----------|-----------------|-----------------|
| Stripe | ~$0.44 | ~$0.59 |
| AI (typical) | ~$0.65 | ~$1.20 (heavier use assumed) |
| AI (light) | ~$0.20 | ~$0.30 |
| S3/egress share | ~$0.05 | ~$0.05 |
| **Variable total (typical)** | **~$1.14** | **~$1.84** |
| **Contribution margin (typical)** | **~$2.85** (~71%) | **~$6.15** (~77%) |

*Margin % = (list − Stripe − AI) / list, using typical AI row.*

---

## Break-even & scale examples

Formula:  
**Paying subs needed ≈ Fixed costs ÷ Average contribution margin**

Assume **fixed = $85/mo**, **avg net after Stripe = $5.00** (mix of Student/Premium), **avg AI = $0.80**:

- Contribution ≈ **$4.20/sub/mo**
- Break-even ≈ **85 ÷ 4.20 ≈ 21 subscribers**

| Paying subs | Mix | Gross MRR | Est. costs (infra + AI + Stripe) | **Est. profit** |
|-------------|-----|-----------|-----------------------------------|-----------------|
| 25 | 80% @ $3.99, 20% @ $7.99 | ~$120 | ~$85 + ~$20 + ~$11 | **~$4** |
| 50 | same | ~$240 | ~$85 + ~$40 + ~$22 | **~$93** |
| 100 | same | ~$480 | ~$95 + ~$80 + ~$44 | **~$261** |
| 500 | same | ~$2,400 | ~$200 + ~$400 + ~$220 | **~$1,580** |

At **100 paying users** with healthy margins, the business covers infra and leaves room for support/marketing — **if** AI usage stays near “typical” and you don’t have a long tail of abusers on the $3.99 plan.

---

## Is $3.99 too low? Is $7.99 enough?

### Student @ $3.99

| Pros | Cons |
|------|------|
| Strong conversion for students | Low absolute $; one power user ≈ many light users in AI cost |
| Competitive vs Quizlet/Chegg-style tools | Hard to fund human support |
| Good for validation / word of mouth | Stripe fixed $0.30 hurts on small ticket |

**Verdict:** Good **entry paid tier** if you add **soft AI caps** and upsell to Premium.

### Premium @ $7.99

| Pros | Cons |
|------|------|
| ~2× revenue with modest extra infra | Feature gap vs Student is mostly marketing today (offline mode, support) |
| Absorbs ~2–3× typical AI vs Student | Still cheap vs “unlimited AI” competitors at $12–20/mo |

**Verdict:** Reasonable **anchor tier**; consider **$9.99** later if AI caps are generous.

### Comparison to marketing $8/mo

The marketing site’s **$8/mo** is close to Premium and simplifies messaging. Current app prices undercut that:

- **$3.99** undercuts $8 (good for growth, worse for margin)
- Align site + Stripe + app to avoid trust issues at checkout

---

## Suggested pricing structure (optional)

| Tier | Price | Role |
|------|-------|------|
| Free | $0 | 3 books / 3 sets / 20 cards (current) |
| Student | **$4.99** or keep **$3.99** | Unlimited library; **30 AI generations/mo** |
| Premium | **$7.99–9.99** | Unlimited AI; offline; priority queue |
| Annual | **$48/yr** (~$4/mo) or **$72/yr** (~$6/mo) | Improves cash flow; ~20–25% discount max |

Intro promo: **$3.99 for 3 months** → renew at $4.99 is a common pattern.

---

## Cost checklist (what to monitor)

1. **`token_usage` table / logs** — cost per user, per task (`generate_flashcards`, `generate_workbook`, `invoke`)
2. **Stripe dashboard** — failed payments, international %, disputes ($15 each)
3. **AWS Cost Explorer** — ALB, Fargate, data transfer (egress surprises)
4. **S3** — storage growth per active uploader
5. **Neon** — CU-hours if DB is always on
6. **Conversion** — free → paid; Student → Premium

---

## Sources

| Topic | Link |
|-------|------|
| Anthropic API pricing (Sonnet 4.x) | https://platform.claude.com/docs/en/about-claude/pricing |
| Stripe pricing & Billing fee | https://stripe.com/pricing |
| Neon Postgres plans | https://neon.com/pricing |
| Resend email pricing | https://resend.com/pricing |
| AWS cost-optimized SaaS reference | https://www.factualminds.com/blog/cost-optimized-saas-stack-aws-end-to-end/ |
| MindFlip integrations | `INTEGRATIONS.md` |
| Token cost constants in repo | `services/api/token_usage_log.py` |
| AI job implementation | `services/api/tasks/ai_tasks.py` |

---

## Bottom line

- **$3.99 + $7.99 is viable** for an AWS + Anthropic study app at small scale, with **~70–77% contribution margin** for typical users.
- **Fixed AWS ~$75–95/mo** (or **~$40–55** on a lean EC2 setup) matters more than S3 until you have thousands of PDFs.
- **Anthropic is the variable risk** — implement per-tier monthly generation limits before marketing “unlimited AI.”
- **Fix pricing consistency** ($8 marketing vs $3.99/$7.99 app) and map **Premium** to measurable limits (AI quota, support SLA).
- Revisit **Student price toward $4.99–5.99** once you have 3–6 months of real `token_usage` data.

*Estimates use US pricing, May 2026 public rate cards. Your actual bill depends on region, reserved capacity, and user behavior.*
