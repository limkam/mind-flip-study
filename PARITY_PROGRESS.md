# Mobile Parity Progress

- **Last updated:** 2026-08-05
- **Source audit:** `MOBILE_PARITY_AUDIT.md`
- **Mobile application:** `mobile/`
- **Web reference:** `src/`
- **Backend:** `services/api/`
- **Current parity phase:** Phase B — Book and content lifecycle.
- **Next recommended action:** `PAR-012` — Book deletion and cache invalidation

Status is evidence-based. PAR-001–PAR-011, PAR-057, and PAR-058 are `Merged`: PAR-011 code commit `f468fc5` passed mobile typecheck, independent Android and iOS exports, and scoped diff check before commit. No remote push or remote-branch merge is implied.

## 1. Executive Status

| Metric | Count |
| --- | ---: |
| Total tracked tickets | 58 |
| Merged | 13 |
| Ready to merge | 0 |
| Implemented but unreviewed | 0 |
| In progress | 1 |
| Needs refinement | 0 |
| Not started | 33 |
| Blocked | 5 |
| Deferred | 0 |
| Not required | 6 |

All status rows sum to 58. Decision records and technical-debt records are not tickets and are excluded. No ticket is counted twice.

| Reproducible progress measure | Result |
| --- | ---: |
| Executable roadmap progress | 31.4% (29.5 / 94 effort points) |
| Critical-ticket executable progress | 47.4% (9 / 19 effort points) |
| High-priority executable progress | 40.2% (20.5 / 51 effort points) |
| Disposition progress | 32.8% (19 / 58 tickets) |

Effort weights are S=1, M=2, L=3, XL=5. Status completion weights are Not started=0, In progress=.25, Implemented=.6, Under review=.75, Needs refinement=.75, Ready to merge=.9, and Merged=1. Executable progress is `sum(effort × status weight) / sum(executable effort)`; Blocked, Deferred, and Not required are excluded. Critical and High use the same formula on their priority subset. Disposition progress is the count of `Ready to merge`, `Merged`, and `Not required` tickets divided by all tickets. The five blocked tickets are reported separately and remain disposition-incomplete. These measures are neither test coverage nor release readiness.

## 2. Completed and Active Tickets

| ID | Ticket | Audit reference | Priority | Effort | Status | Implementation | Review | Validation | Dependencies | Notes |
| -- | ------ | --------------- | -------- | ------ | ------ | -------------- | ------ | ---------- | ------------ | ----- |
| PAR-001 | Cross-user state isolation | 4.1, 4.29, 10.14; ranked ticket 2 | Critical | L | Merged | Shared `QueryClient`; logout and terminal-auth cache clearing; user-scoped offline queues; legacy queue removal; replay lock | Five-perspective review completed; queue migration, replay races, and cache isolation corrected | Implementation/review evidence records passing scoped mobile typecheck/export; exact command chronology and automated-test outcomes are not preserved in repository artifacts. Tracker creation reran only `cd mobile && npm run typecheck` and Android Expo export; both passed. | None; native refresh redesign excluded | Proven changed files: `mobile/lib/queryClient.ts`, `mobile/hooks/useLogout.ts`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/app/_layout.tsx`, `mobile/api/client.ts`, `mobile/lib/offlineStudy.ts`, `mobile/store/authStore.ts`, `mobile/store/storage.ts`. Residual risk: lifecycle/race behavior lacks automated native tests. Merge proof: commit `93954a0` on local `main`. |
| PAR-002 | Authenticated-user bootstrap | 4.1, 4.3, 10.1 | Critical | M | Merged | `/users/me` startup validation; explicit bootstrap/transient-retry/terminal states; cleanup; blocks authenticated background work until validation | Five-perspective review completed; transient versus terminal handling and identity transitions corrected | Implementation/review evidence records passing scoped mobile typecheck/export; exact command chronology and auth-test outcome are not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | PAR-001; DEC-001 intentionally excluded | Proven changed file: `mobile/hooks/useAuthBootstrap.ts`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/app/_layout.tsx`, `mobile/app/index.tsx`, `mobile/api/client.ts`, `mobile/store/authStore.ts`. Residual risk: native cookie refresh remains architecturally unresolved. Merge proof: commit `93954a0` on local `main`. |
| PAR-003 | Achievement ownership correction | 4.18, 10.9; ranked ticket 1 | High | S | Merged | Removed unsupported `POST /achievements/`; server-earned records are authoritative; local computation is presentation-only | Five-perspective review completed; ownership and locked-progress behavior accepted after correction | Implementation/review evidence records passing scoped validation; exact historical command output is not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | None | Proven changed file: `mobile/components/AchievementsPanel.tsx`. Residual risk: server synchronization/idempotency remains backend-owned. Merge proof: commit `93954a0` on local `main`. |
| PAR-004 | Challenge entitlement gating | 4.15, 4.21, 4.27, 10.13; ranked ticket 3 | High | M | Merged | Complete entitlement typing; hidden navigation; guarded challenge, direct, and leaderboard routes; fail-closed uncertainty | Five-perspective review completed; direct-route and uncertain-entitlement bypasses corrected | Implementation/review evidence records passing mobile typecheck/export; exact route-test outcome is not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | Existing entitlements endpoint | Proven changed files: `mobile/components/ChallengeEntitlementGuard.tsx`, `mobile/app/(tabs)/challenges.tsx`, `mobile/app/challenge-leaderboard.tsx`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/lib/billing.ts`, `mobile/app/(tabs)/_layout.tsx`, `mobile/lib/navigation.ts`. Residual risk: device-level deep-link tests are not evidenced. Merge proof: commit `93954a0` on local `main`. |
| PAR-005 | Authoritative study-progress submission | 4.12, 4.14, 10.6; ranked ticket 4 | Critical | L | Merged | Exact DTOs; runtime response validation; retry classification; durable user-scoped queue acceptance; permanent replay rejection handling; duplicate-tap and queue-data guards | Five-perspective review completed; malformed data, permanent failures, and duplicate submission corrected | Implementation/review evidence records passing mobile typecheck/export and scoped backend validation, but exact backend count/command chronology is not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | PAR-001 | Proven changed file: `mobile/lib/studyProgress.ts`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/types/api.ts`, `mobile/lib/offlineStudy.ts`, `mobile/store/storage.ts`, `mobile/app/study/[id].tsx`, `mobile/app/daily-review.tsx`. Residual risk: no backend idempotency and queued records omit `setId`. Merge proof: commit `93954a0` on local `main`. |
| PAR-006 | Study-progress dependent invalidation | 4.12, 4.14, 4.29 | High | M | Merged | Invalidates scorecards, analytics summary/detail, daily review, and matching study sessions; batches replay invalidation; guards malformed cache; avoids inactive refetch storms | Five-perspective review completed; query matching, replay batching, and malformed-cache behavior corrected | Implementation/review evidence records passing mobile typecheck/export and scoped validation; exact test outcomes are not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | PAR-005 | Proven changed file: `mobile/lib/studyInvalidation.ts`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/lib/offlineStudy.ts`, `mobile/app/study/[id].tsx`, `mobile/app/daily-review.tsx`. Residual risk: query keys are not centrally typed/user-scoped. Merge proof: commit `93954a0` on local `main`. |
| PAR-007 | Authoritative quiz/game result persistence | 4.13, 4.28, 10.7 | High | L | Merged | Central transport; exact DTOs; runtime/semantic validation; duplicate-submit protection; retry state; saved-result navigation recovery; precise invalidation; corrected study-event payload | Five-perspective review completed; semantic validation, retries, navigation recovery, and duplicate taps corrected | Implementation/review evidence records passing mobile typecheck/export and scoped backend validation; exact backend count/command chronology is not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | PAR-006 | Proven changed files: `mobile/lib/quizResults.ts`, `mobile/lib/quizResultInvalidation.ts`, `mobile/app/games/[setId]/[slug].tsx`. Shared working-tree file; exact per-ticket provenance not provable: `mobile/types/api.ts`. Residual risk: backend idempotency and best-effort event delivery. Merge proof: commit `93954a0` on local `main`. |
| PAR-008 | Study-group creation parity | 4.16, 10.8 | High | L | Merged | Entitlement gate; native description/privacy/weekly-goal form; paginated multi-book selection; validation; user-isolated form reset; response validation; saved-group navigation recovery | Five-perspective review completed; identity reset, pagination, fail-closed entitlement, and recovery corrected | Implementation/review evidence records passing mobile typecheck/export and scoped backend validation; exact backend count/command chronology is not preserved in repository artifacts. Tracker creation reran only mobile typecheck/export; both passed. | Existing entitlements and group APIs | Proven changed files: `mobile/app/study-groups.tsx`, `mobile/components/studyGroups/CreateStudyGroupModal.tsx`. Shared working-tree files; exact per-ticket provenance not provable: `mobile/lib/billing.ts`, `mobile/types/api.ts`. Three prior nonexistent component/storage paths were removed. Residual risk: backend create idempotency, strict response schema, and duplicate `book_ids`. Merge proof: commit `93954a0` on local `main`. |

Tracker creation and initial PAR-057 validation ran against the dirty aggregate working tree: mobile typecheck/export passed there, with the known Sentry warning, and 77 targeted backend tests passed. Those mobile pass statements are not clean-HEAD proof. The isolated reproducibility result in PAR-057/PAR-058 and the validation baseline below supersedes any unqualified wording in individual ticket rows.

## 3. Remaining Implementation Roadmap

All `Not started` tickets require fresh web/mobile/backend evidence review before implementation. Expected file areas are deliberately indicative, not authorization to broaden scope.

Relationship labels mean: **Technical dependency** is required for correctness or an API/contract prerequisite; **Recommended sequence** is ordering only; **Blocked by decision** prevents implementation. `None` means the ticket can be implemented independently. Every roadmap relationship was reviewed using these meanings.

### Foundation integration milestone

| ID | Ticket | Priority | Effort | Status | Acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ------------------- | ------------ |
| PAR-057 | Combined foundation integration and commit review | High | L | Merged | Aggregate overlap, routes, imports, transports and query keys reviewed; 77 targeted backend tests passed; foundation committed as `93954a0`; integration boundary corrected in `ae0f44c`; clean build gate restored by PAR-058 commit `917c723`. | Completed prerequisite for PAR-009. |
| PAR-058 | Restore clean committed mobile typecheck baseline | Critical | S | Merged | Replaced invalid `ThemeColors.destructive` use with `danger` and supplied the two required `EmptyState.message` props without weakening shared contracts. Commit `917c723`; isolated committed-HEAD typecheck/export/diff check passed and status was clean. | Complete. |

Integration evidence: `93954a0` contains the coherent 30-file PAR-001–PAR-008 foundation; `917c723` restores the pre-existing mobile build gate with three scoped corrections. At isolated committed HEAD `917c723`, `npm run typecheck`, Android Expo export, and `git diff --check` all passed and worktree status was clean. The existing Sentry warning remains. Bounded backend groups total 77 passes with no skips/failures. No dedicated study-group or quiz-result backend test module exists. Manual/device lifecycle behavior remains a recorded risk rather than automated proof.

### Phase A — Finish study-group functionality

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-009 | Study-group public search parity | High | M | Merged | Debounced, normalized, authenticated public search with user/query-scoped caching; validated public/deduplicated rows; truthful invite-code joining; member-only detail navigation; precise membership refresh | Commit `6a5f95f`; engineering review corrections included scroll ownership, Strict Mode lifecycle, identity transition, and invite-code guidance. Mobile typecheck, Android export, iOS export, scoped diff check, and 29 focused backend tests passed. |
| PAR-010 | Study-group material attachment | High | M | Merged | Member-authorized native book picker; user-scoped pagination; validated detail/material responses; known-duplicate and stale-response protection; exact detail refresh and accepted-write recovery | Commit `6b9da14`; engineering review corrected retained-detail refresh failure, response/book binding, and semantic material deduplication. Mobile typecheck, Android export, iOS export, scoped diff check, and 29 focused backend tests passed; database-backed books suite was environment-blocked. |
| PAR-011 | Study-group detail permission and state review | High | M | Merged | Detail route/components/types; verified owner/member/non-member states, direct routes, loading/error/retained-data states and invalidation | Code commit `f468fc5`; review corrections added explicit 403/404/invalid-link states, identity-bound validated responses, owner/member presentation, stable member keys, retained-data refresh messaging, pull-to-refresh, semantic material validation, and exact joined-group invalidation. Mobile typecheck, Android export, iOS export, and scoped diff check passed; exports retained the known Sentry warning. |

### Phase B — Book and content lifecycle

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-012 | Book deletion and cache invalidation | High | M | In progress | `mobile/app/book/[id].tsx`; confirmation, 204 handling, navigation and precise books/sets invalidation | Active ticket. Technical dependency retained: resolve the known backend fixture failure before acceptance; do not waive it as pre-existing. |
| PAR-013 | Reused flashcard-generation response handling | High | S | Not started | Book generation DTO/route; honor `reused` and `set_id`, navigate without polling | None |
| PAR-014 | Book processing and generation completion behavior | High | M | Not started | Book detail/generation phases; polling, recovery, plan messages and final navigation | Technical dependency: PAR-013 response handling. |
| PAR-015 | Flashcard tag editing | Medium | M | Not started | Flashcard list/editor/types; normalized `PUT /flashcard-sets/{id}`, validation and invalidation | None |
| PAR-016 | Folder metadata clarification and conditional implementation | Low | S/M | Blocked | Folder form/types only if DEC-005 requires description/color/icon/parent parity | Blocked by decision: DEC-005. |

Unsupported top-level book title/author editing is intentionally absent: `BookPatch` supports only `extras`, so the audit's earlier claim was withdrawn. Subject/tag behavior must follow supported `extras` contracts, not invent top-level fields.

### Phase C — Account and engagement

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-017 | Settings and engagement preferences | High | L | Not started | Settings/types; typed GET/PATCH `/engagement/preferences`, coordinated partial failures and auth-store refresh | None |
| PAR-018 | Profile validation and study-theme parity | Medium | M | Not started | Profile/theme/types; shared constraints, native theme mapping, normalized store update | None |
| PAR-019 | Notification deletion and refresh behavior | Medium | M | Not started | Engagement center; individual delete, counts, refresh/invalidation and recovery | Recommended sequence: PAR-021 first; rollout config is not required for endpoint correctness. |
| PAR-020 | Nudge dismissal and invalidation | Medium | S | Not started | Engagement center; dismiss tracking plus query invalidation/refetch | Recommended sequence: PAR-021 first; rollout config is not required for endpoint correctness. |
| PAR-021 | Notification and nudge rollout flags | High | S | Not started | `mobile/.env.example`, central mobile feature config, navigation/render gates with web-equivalent defaults | None |
| PAR-022 | Onboarding return-route preservation | High | M | Not started | Index/onboarding/navigation; validated return route through bootstrap and completion | Technical dependency: PAR-002 bootstrap states. |
| PAR-023 | Global auth-endpoint 401 exclusion parity | High | M | Not started | API client/auth predicate; exclude every auth endpoint and prevent refresh loops | Technical dependency: PAR-001/PAR-002 terminal-auth integration. |

### Phase D — Dashboard and learning UX

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-024 | Dashboard data composition | Medium | L | Not started | Dashboard/view model; books, sets, analytics, entitlements and partial-failure composition | Recommended sequence: typed query-key follow-up; not technically blocked. |
| PAR-025 | Recent quiz-result presentation | Medium | M | Not started | Dashboard/results types; recent cards, empty/error and legacy extras | Technical dependency: PAR-024 dashboard composition point. |
| PAR-026 | Pending challenge count and entitlement state | Medium | M | Not started | Dashboard/challenge queries; pending count and fail-closed entitlement presentation | Technical dependency: PAR-004 entitlement guard and PAR-024 dashboard composition. |
| PAR-027 | Daily-review remaining refinements | Medium | M | Not started | Daily review; returned state presentation, filters, queue completion and errors beyond PAR-005/006 | Technical dependency: PAR-005/PAR-006 authoritative mutation and invalidation. |
| PAR-028 | Central study-event taxonomy and transport | Medium | M | Not started | New event module and learning call sites; shared names/schema, duplicate protection, non-blocking transport | None |
| PAR-029 | Celebration policy and native presentation | Medium | L | Not started | Native provider plus portable policy/seen state; dedupe, bounds, reduced motion, haptics | Technical dependency: PAR-028 trusted event taxonomy/transport. |

Celebration presentation remains separate from study/quiz persistence.

### Phase E — Billing and credits

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-030 | Server-driven pricing catalog | Critical | M | Not started | Billing/pricing/types; render `GET /billing/pricing`, partial configuration and no hard-coded prices | None |
| PAR-031 | Monthly and annual interval presentation | Critical | M | Not started | Pricing UI; server-defined default and explicit monthly/annual selection | Technical dependency: PAR-030 catalog. |
| PAR-032 | Checkout interval behavior | Critical | M | Not started | Checkout helper/UI; selected interval must match checkout query | Technical dependency: PAR-031 selected interval. |
| PAR-033 | Checkout return-flow product decision | Critical | S | Blocked | No callback change; define native deep link versus hosted web/approved alternative | Blocked by decision: DEC-002. |
| PAR-034 | Trial eligibility and start | High | M | Not started | Billing UI/types; eligibility reasons and trial checkout | Technical dependency: PAR-030 catalog/types. Blocked by decision for return handling: PAR-033/DEC-002. |
| PAR-035 | Subscription cancellation | High | M | Not started | Billing UI/types; period-end confirmation and entitlement refresh | Technical dependency: PAR-030 catalog/types. |
| PAR-036 | Credit pricing | High | S | Not started | Credits types/UI; server pricing and quantities | Recommended sequence: PAR-030 first for billing conventions; no API dependency. |
| PAR-037 | Credit purchase | Critical | M | Not started | Credit checkout and error handling | Technical dependency: PAR-036 pricing. Blocked by decision for return handling: PAR-033/DEC-002. |
| PAR-038 | Credit usage and purchase history | High | M | Not started | Billing/usage screen; usage plus paginated purchase history | Recommended sequence: PAR-036 first; history is not technically dependent on pricing. |
| PAR-039 | Billing success/cancel handling | Critical | M | Not started | Approved return routes/screens; verify/refetch state and handle cancellation | Blocked by decision: PAR-033/DEC-002. |

An annual option must never silently launch monthly checkout.

### Phase F — Scorecards and sharing

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-040 | Scorecard rollout gating | High | S | Not started | Feature config/navigation/route; matching rollout default and direct-route guard | None; public-token behavior is unrelated to rollout gating. |
| PAR-041 | Cached-data and refresh-state parity | High | M | Not started | Scorecards; distinguish cached fallback, refreshing, empty and hard error | None |
| PAR-042 | Public share-link creation | High | M | Not started | Scorecards/share types; create link and native share/copy | None |
| PAR-043 | Share expiry and display-name controls | High | M | Not started | Share form; 7/30/90-day expiry and validated optional name | Technical dependency: PAR-042 share creation flow. |
| PAR-044 | Share revoke/regenerate | High | M | Not started | Share lifecycle; revoke, regenerate and cache updates | Technical dependency: PAR-042 share lifecycle/types. |
| PAR-045 | Public-token mobile behavior decision | High | S | Blocked | Decide external browser versus in-app public route before implementing token navigation | Blocked by decision: DEC-004. |

### Phase G — Remaining feature and contract cleanup

| ID | Ticket | Priority | Effort | Status | Expected area / acceptance boundary | Relationship |
| -- | ------ | -------- | ------ | ------ | ----------------------------------- | ------------ |
| PAR-046 | Legacy password screen removal or redirect | Medium | S | Not started | Mobile auth routes; safe passwordless redirect, retaining backend compatibility | Product confirmation recorded in acceptance |
| PAR-047 | Complete feature-flag parity | High | M | Not started | Central feature config and remaining route/component gates; excludes entitlement work already in PAR-004 | Technical dependency: PAR-021/PAR-040 establish feature-config entries and gates. |
| PAR-048 | Analytics event parity | Medium | M | Not started | Learning call sites and payload fixtures | Technical dependency: PAR-028 taxonomy/transport. |
| PAR-049 | Admin-on-mobile product decision | High | S | Blocked | No consumer-mobile admin implementation until scope is approved | Blocked by decision: DEC-003. |
| PAR-050 | Native refresh-token strategy decision | Critical | L | Blocked | Architecture decision only; do not invent refresh-token body support | Blocked by decision: DEC-001. |

Folder metadata product scope is tracked once as PAR-016/DEC-005 rather than duplicated in this phase.

### Verified-parity dispositions

| ID | Audit feature | Audit reference | Status | Final disposition |
| -- | ------------- | --------------- | ------ | ----------------- |
| PAR-051 | Analytics views | 4.19 | Not required | Same `/analytics/me` behavior; native visualization is intentional. Retain contract-drift tests as debt/future hardening. |
| PAR-052 | Quiz history and result detail | 4.20 | Not required | List/detail endpoints and behavior align; legacy/null extras are regression cases, not a feature ticket. |
| PAR-053 | General leaderboard | 4.21 | Not required | Metric paging and rank behavior align. Challenge leaderboard gating was corrected in PAR-004. |
| PAR-054 | Feedback | 4.25 | Not required | Validation and `POST /feedback` align with native presentation. |
| PAR-055 | Library/upload/duplicate core flow | 4.9 | Not required | Core upload, duplicate detection and pagination are already in parity; shared constants remain preventive hardening. |
| PAR-056 | Folder core CRUD/membership | 4.17 | Not required | Core endpoints and membership align. Only optional metadata scope remains in PAR-016/DEC-005. |

## 4. Blocked Product and Architecture Decisions

| Decision ID | Question | Why blocked | Affected tickets | Required owner | Recommended default |
| ----------- | -------- | ----------- | ---------------- | -------------- | ------------------- |
| DEC-001 | How should refresh authentication work reliably in native mobile when the backend requires an httpOnly cookie? | Backend exposes no refresh-token body contract and native cookie persistence is unproven. | PAR-002 residual risk, PAR-050 | Backend/security architecture | Do not invent refresh-token body support. Keep current behavior documented until backend architecture is approved. |
| DEC-002 | Should mobile checkout return through a native deep link, hosted web success page, or another approved flow? | Backend callbacks currently target `FRONTEND_URL`; product and store policy are unresolved. | PAR-033, PAR-034, PAR-037, PAR-039 | Product, mobile platform, billing | Do not change production checkout callbacks without product and store-policy approval. |
| DEC-003 | Does admin functionality belong in the consumer mobile app? | A separate admin application exists and consumer-mobile scope is unknown. | PAR-049 | Product/security | Keep admin functions out of consumer mobile unless explicitly approved. |
| DEC-004 | Should public scorecard links open externally or inside the app? | Native public-token ownership, routing and unauthenticated UX are not specified. | PAR-040, PAR-045 | Product/mobile | Open public links externally until an in-app public route is explicitly approved. |
| DEC-005 | Is the simplified mobile folder form intentional? | Core CRUD aligns, but web exposes description/color/icon/parent metadata. | PAR-016 | Product/design | Preserve the simpler native form unless full metadata parity is requested. |

## 5. Technical-Debt Register

Technical debt is not included in feature-parity completion or ticket status counts.

| Debt ID | Description | Origin ticket | Severity | User impact | Recommended follow-up | Blocking? |
| ------- | ----------- | ------------- | -------- | ----------- | --------------------- | --------- |
| DEBT-001 | Backend idempotency for study-progress replay | PAR-005 | High | Retries can duplicate an accepted mutation after a lost response | Add client idempotency key and backend uniqueness/return semantics | No |
| DEBT-002 | Backend idempotency for quiz-result creation | PAR-007 | High | Retry after ambiguous success can create duplicate results | Add idempotency key and conflict-safe response | No |
| DEBT-003 | Backend idempotency for study-group creation | PAR-008 | Medium | Ambiguous retry can create duplicate groups | Add create idempotency key | No |
| DEBT-004 | Backend must require quiz score not to exceed total questions | PAR-007 | High | Invalid statistics may be stored by malformed/hostile clients | Add schema/service validation and tests | No |
| DEBT-005 | Strict `StudyGroupOut` backend response schema | PAR-008 | Medium | Contract drift may only be caught at runtime on mobile | Replace loose response typing and add contract tests | No |
| DEBT-006 | Server-side duplicate `book_ids` validation/deduplication | PAR-008 | Medium | Duplicate associations may cause errors or inconsistent groups | Normalize and validate IDs transactionally | No |
| DEBT-007 | Structured production telemetry | PAR-001–008 | High | Failures/races are difficult to diagnose | Add redacted structured events for bootstrap, queues and persistence | No |
| DEBT-008 | Mobile test runner | PAR-001–008 | High | Critical logic has type/build checks but no automated units | Configure a maintained RN-compatible runner and CI command | No |
| DEBT-009 | React Native lifecycle and race tests | PAR-001, PAR-002 | High | Foreground/background and identity races may regress | Add lifecycle, logout/login and replay-concurrency tests | No |
| DEBT-010 | `Retry-After` support for 429 | PAR-005, PAR-007 | Medium | Retries may occur too early under throttling | Parse delta/date values and schedule capped retry | No |
| DEBT-011 | Failed offline-sync quarantine or user-visible state | PAR-005 | High | Permanently rejected records can be invisible to users | Add quarantine, diagnostics and retry/discard UI | No |
| DEBT-012 | Query keys are not centrally typed | PAR-006 | Medium | Invalidation can silently miss consumers | Introduce typed key factories incrementally | No |
| DEBT-013 | User-scoped query-key architecture | PAR-001, PAR-006 | High | Clearing protects switches, but keys do not encode identity | Add identity roots where cache retention is needed | No |
| DEBT-014 | Offline queue records do not retain `setId` | PAR-005, PAR-006 | Medium | Replay invalidation must discover affected sessions indirectly | Add versioned optional `setId` migration | No |
| DEBT-015 | Best-effort study-event delivery | PAR-007, PAR-028 | Medium | Analytics events can be lost offline | Define durable/at-most-once event policy separately | No |
| DEBT-016 | Remaining pre-existing whitespace failures | Repository baseline | Low | Repository-wide `git diff --check` remains noisy | Fix unrelated whitespace in a separate cleanup | No |
| DEBT-017 | Pre-existing backend book-deletion fixture failure | PAR-012 | Medium | Full unit suite cannot serve as a clean gate | Repair fixture/service expectation before PAR-012 acceptance | Yes, for PAR-012 validation only |

## 6. Validation Baseline

| Area | Command / situation | Known outcome |
| --- | --- | --- |
| Mobile typecheck | `cd mobile && npm run typecheck` | Isolated committed HEAD `917c723` passes (`tsc --noEmit`, exit 0). |
| Android Expo export | `cd mobile && npx expo export --platform android --output-dir /tmp/mindflip-par-058-clean-export` | Isolated committed HEAD `917c723` passes with the known Sentry warning. |
| Mobile tests | No script/runner in `mobile/package.json` | Absent; typecheck/export do not replace unit, integration or lifecycle tests. |
| Sentry | Export warning | Existing warning: missing Sentry organization/project configuration; environment fallback is used. |
| Backend units | `services/api/.venv/bin/pytest services/api/tests/unit -q -x` | Audit baseline: failed after 38 passes at the pre-existing book-deletion fixture issue. Scoped commands may pass independently. |
| Backend integration | `services/api/.venv/bin/pytest services/api/tests/integration -q -x` | Audit baseline: inconclusive—one pass, nine skips, then stalled/interrupted; DB infrastructure must be diagnosed. |
| Whitespace | Repository-wide `git diff --check` | Known unrelated/pre-existing failures; use scoped checks per ticket. |
| Book deletion | Targeted unit coverage | Pre-existing `test_collects_linked_and_resource_and_orphan_sets` failure because the fixture lacks `book.title`. |

The committed mobile foundation passes its project-wide typecheck, Android export, and diff check at `917c723`. Backend and unrelated repository-wide baselines remain qualified as above.

## 7. Definition of Done

A parity ticket is complete only when:

1. Evidence from web, mobile, and backend has been inspected.
2. Product behavior is not invented.
3. Implementation is bounded.
4. TypeScript passes.
5. Android Expo export passes when applicable.
6. Relevant backend tests pass.
7. Scoped `git diff --check` passes.
8. Five-perspective engineering review is completed.
9. Review defects are corrected.
10. Remaining risks are recorded.
11. Merge state is proven before marking `Merged`.
12. The corresponding original audit finding has a final disposition.

## 8. Next Ticket

The active implementation ticket is **PAR-012 — Book deletion and cache invalidation**.

PAR-011 is merged as code commit `f468fc5` after review corrections and passing independent Android and iOS exports, mobile typecheck, and scoped diff check. Phase B begins with PAR-012, whose DEBT-017 backend-fixture dependency remains blocking until investigated and resolved with evidence.

## Audit Reconciliation

| Original audit finding | Final disposition |
| --- | --- |
| 4.1 Authentication/session lifecycle | PAR-001 and PAR-002 merged; unresolved refresh architecture isolated in PAR-050/DEC-001. |
| 4.2 Legacy password auth | PAR-046. |
| 4.3 Onboarding navigation | Bootstrap aspect PAR-002; return route PAR-022. |
| 4.4 Global API errors | Cache/terminal cleanup PAR-001/PAR-002; auth exclusions PAR-023. |
| 4.5 Dashboard | PAR-024–PAR-026. |
| 4.6 Notifications/nudges/push | PAR-019–PAR-021; native push remains intentionally platform-specific. |
| 4.7 Settings/preferences | PAR-017. |
| 4.8 Profile/theme | PAR-018. |
| 4.9 Library/upload/duplicates | PAR-055 `Not required`. |
| 4.10 Book lifecycle/generation | PAR-012–PAR-014; unsupported title/author claim withdrawn. |
| 4.11 Flashcard set management | PAR-015. |
| 4.12 Study progress | PAR-005/PAR-006 merged; debt explicitly registered. |
| 4.13 Games/quiz persistence | PAR-007 merged; celebrations remain PAR-029. |
| 4.14 Daily review | Core persistence/invalidation PAR-005/PAR-006; UX residue PAR-027. |
| 4.15 Quiz challenges | PAR-004 merged. |
| 4.16 Study groups | PAR-008–PAR-010, PAR-057, and PAR-058 merged; PAR-011 active. |
| 4.17 Folders | PAR-056 `Not required`; optional metadata PAR-016/DEC-005. |
| 4.18 Achievements | PAR-003 merged; server ownership established. |
| 4.19 Analytics | PAR-051 `Not required`. |
| 4.20 Quiz history/detail | PAR-052 `Not required`. |
| 4.21 Leaderboards | PAR-053 `Not required`; challenge route gating included in PAR-004. |
| 4.22 Scorecards/sharing | PAR-040–PAR-045/DEC-004. |
| 4.23 Billing/subscriptions/credits | PAR-030–PAR-039/DEC-002. |
| 4.24 Celebrations | PAR-029. |
| 4.25 Feedback | PAR-054 `Not required`. |
| 4.26 Admin | PAR-049/DEC-003. |
| 4.27 Feature flags/entitlements | Challenge entitlement PAR-004 merged; rollout parity PAR-021/PAR-040/PAR-047. |
| 4.28 Analytics/study events | Quiz payload correction PAR-007 merged; taxonomy/call sites PAR-028/PAR-048. |
| 4.29 Caching/synchronization | PAR-001/PAR-006 merged; architectural refinements in DEBT-012–DEBT-014. |

Every feature in the original audit has one or more explicit dispositions above. No audit finding remains unreconciled; blocked decisions are not presented as approved product behavior, intentional platform differences are preserved, and technical debt is excluded from feature completion. Unsupported top-level book title/author editing, client-side achievement creation, unapproved consumer-mobile admin work, and invented native refresh-token behavior remain explicitly excluded.
