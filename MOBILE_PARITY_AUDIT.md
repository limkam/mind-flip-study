# Mobile Feature and Logic Parity Audit

Date: 2026-08-03

## Scope and method

This audit treats the current web SPA as the functional product reference and the FastAPI service as the authoritative wire contract. It compares implementation logic rather than route or screen names. No application code was changed during this audit phase.

The repository was inspected for routes, API calls and payloads, authentication/session behavior, query keys and invalidation, entitlement checks, feature flags, validation, role checks, navigation, and loading/error/empty/success states.

## 1. Repository map

### Product applications

- Web application: `src/` (React 18, React Router, TanStack Query, Axios, Tailwind/Radix).
- Native mobile application: `mobile/` (Expo Router, React Native, TanStack Query, Axios, Zustand).
- API service: `services/api/` (FastAPI, SQLAlchemy, Pydantic schemas, service modules).
- Separate products outside this comparison: `apps/admin/` and `apps/marketing/`.

### Shared and duplicated layers

There is currently no shared TypeScript package consumed by both web and mobile.

| Concern | Web | Mobile | Shared authority |
|---|---|---|---|
| API client | `src/api/client.js` | `mobile/api/client.ts` | API behavior in `services/api/` |
| User/session state | `src/lib/AuthContext.jsx` | `mobile/store/authStore.ts` | Auth routes/schemas in `services/api/routers/auth.py`, `services/api/schemas/auth.py` |
| API types | Mostly implicit JS objects | `mobile/types/api.ts` | Pydantic schemas under `services/api/schemas/` |
| Billing rules/helpers | `src/lib/billing.js`, `src/lib/plans.js` | `mobile/lib/billing.ts` | `services/api/services/entitlements.py`, billing/credits routers |
| Study utilities | `src/lib/study*`, `src/lib/game*`, components | `mobile/lib/study*`, `mobile/lib/game*` | Study, quiz and flashcard API routes |
| Cache | `src/lib/coreDataCache.js`, query client, offline cache | Query client, `mobile/lib/offlineStudy.ts` | None shared |
| Feature navigation | `src/App.jsx`, `src/components/layout/Sidebar.jsx` | `mobile/app/`, `mobile/lib/navigation.ts` | None shared |

Recommended architectural direction: introduce a small browser-free shared package for API DTOs, validation constants, plan labels, entitlement predicates, score calculations, study-event names, and normalization helpers. Do not share UI, storage adapters, router code, Axios instances, or browser/native lifecycle code.

## 2. Executive summary

### Classification counts

- Already in parity: analytics, quiz history/detail, general leaderboard, feedback, most folders behavior, core challenge play flow.
- Missing on mobile: public scorecard links, scorecard link management, billing trial/cancellation/credit purchase/history, web celebration policy, admin user management.
- Outdated on mobile: auth/session recovery, legacy password routes, dashboard data composition, study persistence/invalidation, settings engagement preferences, study-group permissions/search/materials, billing plan catalog, feature flags, book lifecycle, scorecard refresh/share behavior.
- Removed from web but still on mobile: password registration and forgot-password flows.
- Intentionally platform-specific: native push registration, native image sharing, native offline progress queue, haptics, mobile tab/navigation composition.
- Needs product clarification: admin functionality on consumer mobile; whether public scorecard viewing belongs inside the app; whether achievements may be client-created; whether mobile should expose all web subscription management actions or redirect to hosted web billing.

### Highest-risk findings

1. Mobile persists access tokens but relies on a web-style refresh-cookie endpoint. Cookie persistence in native Axios is not guaranteed, so an expired token can log out a valid user instead of refreshing.
2. Mobile study completion does not mirror all web mutations and query invalidations; scorecards, achievements, analytics and quiz history can remain stale.
3. Mobile allows study-group creation without the web entitlement gate `features.study_group_creation === true`.
4. Mobile billing uses a hard-coded partial plan catalog and omits current API-driven pricing, trials, cancellation and credit purchasing.
5. Mobile settings updates only `/users/me`; it does not read or update `/engagement/preferences` as web does.
6. Mobile feature availability is largely unconditional while web uses rollout flags and entitlement route guards.

## 3. Feature parity matrix

| Feature | Classification | Risk |
|---|---|---|
| Authentication and session lifecycle | Outdated on mobile | Critical |
| Legacy password auth screens | Removed from web but still on mobile | Medium |
| Onboarding guard/return flow | Outdated on mobile | High |
| Global API error handling | Outdated on mobile | High |
| Dashboard/home | Outdated on mobile | Medium |
| Notifications and nudges | Outdated on mobile / intentionally platform-specific | Medium |
| Settings and engagement preferences | Outdated on mobile | High |
| Profile and theme | Outdated on mobile | Medium |
| Library/upload/duplicate detection | Mostly in parity | Medium |
| Book lifecycle and generation | Outdated on mobile | High |
| Flashcard set management | Outdated on mobile | Medium |
| Study session and progress | Outdated on mobile | Critical |
| Games and quiz result persistence | Outdated on mobile | High |
| Daily review | Outdated on mobile | Medium |
| Quiz challenges | Mostly in parity | Medium |
| Study groups | Outdated on mobile | High |
| Folders/collections | Mostly in parity | Low |
| Achievements | Needs product clarification | High |
| Analytics | Already in parity | Low |
| Quiz history/detail | Already in parity | Low |
| Leaderboards | Already in parity | Low |
| Scorecards | Outdated/missing on mobile | High |
| Billing, plans and credits | Outdated/missing on mobile | Critical |
| Celebrations and achievement presentation | Missing on mobile | Medium |
| Feedback | Already in parity | Low |
| Admin user management | Needs product clarification | High |
| Feature flags and rollout controls | Outdated on mobile | High |
| Analytics/event tracking | Outdated on mobile | Medium |
| Caching/offline synchronization | Outdated on mobile | High |

## 4. Detailed feature findings

### 4.1 Authentication and session lifecycle

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/lib/AuthContext.jsx`, `src/api/client.js`, `src/pages/Login.jsx`, `src/pages/EmailVerification.jsx`, `src/App.jsx`
- **Relevant mobile files:** `mobile/store/authStore.ts`, `mobile/api/client.ts`, `mobile/app/index.tsx`, `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/verify-email.tsx`, `mobile/hooks/useLogout.ts`
- **Web behavior:** Passwordless email challenge or Google login; `remember_me` selects local/session storage; startup can refresh via cookie before `/users/me`; concurrent 401s queue behind one refresh; user is fetched from the server; logout clears query and core-data caches.
- **Mobile behavior:** Passwordless email and Google are present. Zustand persists user plus bearer token when `keepSignedIn` is enabled. It attempts `/auth/refresh` with `withCredentials`, but native cookie persistence is not established. Persisted user data can be treated as current without an equivalent startup `/users/me` verification. Logout does not centrally clear the mobile QueryClient.
- **Missing/outdated logic:** Reliable native refresh-token strategy, startup server revalidation, auth-endpoint exclusion parity, queued-request failure navigation, cache clearing on logout, role union omits `teacher` even though web behavior explicitly supports it.
- **Intent:** Accidental contract drift; storage mechanics are intentionally platform-specific.
- **Involved:** Auth router/schemas, Axios clients, Zustand, TanStack Query, secure persistence decision.
- **Recommended approach:** Confirm backend-supported native refresh mechanism. Prefer refresh token rotation stored in SecureStore or a documented native cookie jar. Add an auth bootstrap query to `/users/me`, clear the QueryClient on logout/auth failure, and share auth response/user DTOs.
- **Risk:** Critical
- **Tests:** cold start with valid/expired token; keep-signed-in on/off; concurrent 401 requests; refresh failure; onboarding-required response; logout cache isolation between users; teacher/admin user decoding.

### 4.2 Legacy password registration and recovery

- **Classification:** Removed from web but still on mobile
- **Relevant web files:** `src/App.jsx` (register and forgot-password redirect to login)
- **Relevant mobile files:** `mobile/app/(auth)/register.tsx`, `mobile/app/(auth)/forgot-password.tsx`, `mobile/app/(auth)/_layout.tsx`
- **Web behavior:** Registration and forgot-password URLs redirect to passwordless login; reset-password is also redirected.
- **Mobile behavior:** Dedicated password registration and forgot-password screens remain routable.
- **Missing/outdated logic:** Mobile still advertises a product flow removed from the reference app.
- **Intent:** Appears accidental unless mobile is deliberately retaining password auth.
- **Recommended approach:** Product confirmation, then remove route entry points or redirect them to native passwordless login. Do not delete backend compatibility without a separate API decision.
- **Risk:** Medium
- **Tests:** auth navigation snapshot; legacy deep links redirect safely; existing password users can still use the chosen supported path.

### 4.3 Onboarding and protected navigation

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/App.jsx`, `src/pages/Onboarding.jsx`, `src/api/client.js`
- **Relevant mobile files:** `mobile/app/index.tsx`, `mobile/app/onboarding.tsx`, `mobile/api/client.ts`, `mobile/lib/navigation.ts`
- **Web behavior:** Dedicated auth and onboarding guards; incomplete users are redirected; onboarding returns to the originally requested route where possible; API 403 `onboarding_required` redirects globally.
- **Mobile behavior:** Global API redirect exists and initial routing checks auth/onboarding, but onboarding always replaces to tabs and loses the original destination.
- **Missing/outdated logic:** Return-route preservation and consistent loading guard during persisted-store hydration/server revalidation.
- **Intent:** Accidental simplification.
- **Recommended approach:** Store a validated return route in router params/state and consume it after onboarding.
- **Risk:** High
- **Tests:** deep link before onboarding; resumed app during hydration; onboarding API failure; successful completion returns safely.

### 4.4 Global API error and plan-limit handling

- **Classification:** Mostly in parity, with outdated mobile edges
- **Relevant web files:** `src/api/client.js`, `src/components/billing/UpgradeLimitDialog.jsx`
- **Relevant mobile files:** `mobile/api/client.ts`, `mobile/components/UpgradeLimitModal.tsx`, `mobile/lib/upgradeLimitEvents.ts`
- **Web behavior:** Handles onboarding 403, plan-limit 402, refresh queue, auth endpoint exclusions, and login redirect.
- **Mobile behavior:** Handles onboarding 403, 402 modal and refresh queue. It excludes only refresh itself from 401 refresh attempts and does not consistently route to login after terminal refresh failure.
- **Missing/outdated logic:** Auth endpoint exclusion parity, deterministic terminal navigation, cache clear, robust string/object 402 message parsing.
- **Intent:** Accidental.
- **Recommended approach:** Extract pure predicates/message parsers to shared code; keep router adapters separate.
- **Risk:** High
- **Tests:** every auth endpoint returning 401; 402 detail variants; queue resolution/rejection; no redirect loops.

### 4.5 Dashboard/home

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/Dashboard.jsx`, `src/components/dashboard/*`, `src/components/engagement/ContextualNudge.jsx`
- **Relevant mobile files:** `mobile/app/(tabs)/index.tsx`, `mobile/components/EngagementCenter.tsx`, `mobile/components/WeakTopicsChips.tsx`
- **Web behavior:** Books, flashcard sets, analytics summary, recent quiz results and entitlements are prefetched; challenge UI is entitlement-gated; pending challenges, recent sets/results, average score, streak history, weak topics and new-user state are represented.
- **Mobile behavior:** Uses analytics summary and flashcard sets, with native hero/stats/actions/nudge/notifications. It does not fetch books, recent quiz results, or pending challenge count and therefore cannot reproduce the same decisions and empty/onboarding paths.
- **Missing/outdated logic:** Book count/state, recent quiz result cards, entitlement-gated challenge state, role-specific copy, 14-day activity data/type coverage, query prefetch parity.
- **Intent:** Native presentation is intentional; missing data decisions are accidental.
- **Recommended approach:** Add a mobile dashboard view model built from the same endpoints/query keys, with native cards and progressive loading.
- **Risk:** Medium
- **Tests:** zero-data learner; pending challenge; disabled challenges entitlement; partial API failure; stale/cache refresh.

### 4.6 Notifications, nudges and push

- **Classification:** Outdated on mobile; push transport intentionally platform-specific
- **Relevant web files:** `src/components/engagement/NotificationCenter.jsx`, `src/components/engagement/ContextualNudge.jsx`, `src/components/layout/AppLayout.jsx`
- **Relevant mobile files:** `mobile/components/EngagementCenter.tsx`, `mobile/hooks/usePushNotifications.ts`, `mobile/app/_layout.tsx`
- **Web behavior:** Notification list supports read, read-all, individual delete, achievement celebration triggering and rollout flag. Nudges have rollout flag, impression/click/dismiss tracking and query invalidation.
- **Mobile behavior:** In-app list supports read and read-all, but not individual delete or achievement celebration. Nudge tracking exists but dismissal does not invalidate/refetch. No equivalent notification/nudge rollout flags. Remote push is correctly platform-specific and disabled in Expo Go.
- **Missing/outdated logic:** Delete, refresh/invalidation, feature flags, celebration integration, fuller error/loading recovery.
- **Intent:** Push differences intentional; other gaps accidental.
- **Recommended approach:** Complete endpoint parity in native UI; add Expo-public rollout flags with matching defaults; retain lazy native push loading.
- **Risk:** Medium
- **Tests:** unread count, read/read-all/delete, deep link, duplicate impression idempotency, dismissal refresh, Expo Go vs development build.

### 4.7 Settings and engagement preferences

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/Settings.jsx`
- **Relevant mobile files:** `mobile/app/settings.tsx`, `mobile/store/authStore.ts`
- **Web behavior:** Loads `/engagement/preferences`; saves user study settings and engagement preferences together; exposes challenge, streak, achievement and scorecard communication controls plus study behavior and account metadata.
- **Mobile behavior:** Reads and patches `/users/me` preferences only. Engagement preferences are absent, so changes made on web cannot be viewed or updated consistently on mobile.
- **Missing/outdated logic:** `/engagement/preferences` read/write, merged error semantics, full setting keys and local auth-store synchronization.
- **Intent:** Accidental.
- **Recommended approach:** Add a separate engagement query/mutation and a coordinated save with explicit partial-failure reporting; share preference DTOs.
- **Risk:** High
- **Tests:** initial merge, dirty tracking, one request fails, server normalization, auth-store refresh, role rendering.

### 4.8 Profile, demographics and theme

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/Profile.jsx`, `src/lib/appTheme.js`, `src/lib/colorScheme.js`
- **Relevant mobile files:** `mobile/app/profile.tsx`, `mobile/hooks/useTheme.ts`, `mobile/store/authStore.ts`
- **Web behavior:** Validates display name, updates demographic/profile fields, shows analytics summary, and saves `study_theme` separately from color scheme.
- **Mobile behavior:** Has a broader native profile form and color scheme support, but does not reproduce the web study-theme catalog/application and does not expose the same profile analytics presentation.
- **Missing/outdated logic:** Shared validation, study-theme preference parity, consistent user-store update after mutation.
- **Intent:** UI differences intentional; preference drift accidental.
- **Recommended approach:** Share field validation/constants; map study themes to native tokens rather than importing CSS theme code.
- **Risk:** Medium
- **Tests:** blank/long display name, demographic normalization, custom country, theme persistence, server-refreshed user.

### 4.9 Library, upload and duplicate handling

- **Classification:** Mostly in parity
- **Relevant web files:** `src/pages/Library.jsx`, `src/components/library/UploadBookDialog.jsx`, `src/lib/bookUpload.js`, `src/lib/fileHash.js`
- **Relevant mobile files:** `mobile/app/(tabs)/library.tsx`, `mobile/lib/uploadBook.ts`, `mobile/lib/fileHash.ts`
- **Web behavior:** Paginated book retrieval, duplicate pre-check, upload URL flow, validation, progress/jobs and 402 handling.
- **Mobile behavior:** Infinite pagination, document picker, duplicate check and upload flow are present. Native selection and progress presentation differ appropriately.
- **Missing/outdated logic:** Must verify exact MIME/size/title/author validation constants and duplicate decision payloads remain synchronized; query invalidation key is broader/different.
- **Intent:** Mostly intentional platform UX.
- **Recommended approach:** Extract upload validation and duplicate result types; retain native picker.
- **Risk:** Medium
- **Tests:** supported/unsupported types, size boundary, duplicate, 402, signed-upload failure, pagination and refresh.

### 4.10 Book lifecycle, TOC and flashcard generation

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/BookDetail.jsx`, `src/components/library/TocEditor.jsx`, `src/lib/generationPhases.js`
- **Relevant mobile files:** `mobile/app/book/[id].tsx`, `mobile/components/library/TocEditor.tsx`, `mobile/lib/generationPhases.ts`
- **Web behavior:** Fetch/poll processing, edit metadata, extract/edit TOC, select chapters, choose plan-constrained count, generate, delete book with cascade warning, invalidate related caches, and navigate to generated set where available.
- **Mobile behavior:** Fetch, TOC extraction/editing and generation exist. Mobile lacks equivalent book deletion and metadata editing flow and has less complete completion/error/caching behavior.
- **Missing/outdated logic:** Delete API/confirmation/invalidation, title/author/subject/tags update, exact job completion navigation, full plan-limit messages and processing recovery.
- **Intent:** Accidental omissions.
- **Recommended approach:** Build native action sheet/forms while sharing generation request types and plan count calculation.
- **Risk:** High
- **Tests:** processing phases, TOC extraction failure/retry, edit validation, generation count limits, deletion cascade, job completion and cache invalidation.

### 4.11 Flashcard-set management

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/FlashcardSets.jsx`
- **Relevant mobile files:** `mobile/app/(tabs)/flashcards.tsx`, `mobile/lib/flashcardSets.ts`
- **Web behavior:** List, delete, edit tags, navigate to study; mutations invalidate set data.
- **Mobile behavior:** List, delete and games navigation exist; tag editing is absent.
- **Missing/outdated logic:** `PUT /flashcard-sets/{id}` tag payload/validation and related cache updates.
- **Intent:** Accidental.
- **Recommended approach:** Add native tag editor using shared tag normalization constraints.
- **Risk:** Medium
- **Tests:** add/remove/duplicate/empty tags, delete confirmation, mutation errors, cache refresh.

### 4.12 Study session and progress persistence

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/StudySession.jsx`, `src/components/study/*`, `src/lib/analytics.js`, `src/lib/offlineCache.js`
- **Relevant mobile files:** `mobile/app/study/[id].tsx`, `mobile/components/FlashCard.tsx`, `mobile/lib/offlineStudy.ts`, `mobile/components/study/*`
- **Web behavior:** Loads set and card-progress records, restores ratings, records study progress and returned state, supports study/summary/scenario/game flows, saves quiz results, emits study events, and invalidates scorecards, analytics, achievements and quiz-result queries.
- **Mobile behavior:** Loads set plus due cards, records quality with offline fallback, supports native study/summary/scenarios/games. It does not fetch `/card-progress/` for the same restoration model, and its mutation success paths do not invalidate the full dependent query set. Quiz saving is primarily in game routes rather than matching all web session result paths.
- **Missing/outdated logic:** Returned progress handling, cache invalidations, consistent event tracking, quiz result payload parity, error/success acknowledgement, potential ordering differences between due-card subset and full set.
- **Intent:** Offline queue is intentional; behavior drift accidental.
- **Recommended approach:** Define a shared study completion command/result contract and dependent-query invalidation helper with platform adapters.
- **Risk:** Critical
- **Tests:** restore prior ratings, online/offline rating, retry queue idempotency, session completion, quiz/scenario results, all dependent caches, auto-advance preferences.

### 4.13 Games and quiz persistence

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/components/games/*`, `src/lib/gameLifecycle.js`, `src/lib/gameUtils.js`, `src/pages/StudySession.jsx`
- **Relevant mobile files:** `mobile/components/games/*`, `mobile/app/games/[setId]/*`, `mobile/lib/gameLifecycle.ts`, `mobile/lib/gameUtils.ts`
- **Web behavior:** Entitlement-limited game catalog, deterministic lifecycle, quiz-result persistence, study event tracking and dependent cache invalidation.
- **Mobile behavior:** Native versions of the game catalog and games exist and use `games_limit`. It posts quiz results and events, but invalidation and result metadata need exact comparison per game; celebration behavior differs.
- **Missing/outdated logic:** Centralized completion handling, complete result extras, cache invalidation and event parity.
- **Intent:** Native game UI intentional; completion drift accidental.
- **Recommended approach:** Consolidate mobile completion into one hook using shared event/result DTOs.
- **Risk:** High
- **Tests:** every game completion/abandon, entitlement boundary, result payload, duplicate submission, analytics event, offline/error behavior.

### 4.14 Daily review

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/DailyReview.jsx`
- **Relevant mobile files:** `mobile/app/daily-review.tsx`
- **Web behavior:** Book filter, paginated/kept queue, rating with returned progress, scorecard invalidation and queue refresh.
- **Mobile behavior:** Book filter and review queue are present, but rating discards the returned progress and does not invalidate scorecards.
- **Missing/outdated logic:** Dependent cache invalidation and server-result use.
- **Intent:** Accidental.
- **Recommended approach:** Reuse the study progress mutation helper proposed above.
- **Risk:** Medium
- **Tests:** filters, empty queue, rating transition, end of queue, scorecard refresh, offline/error.

### 4.15 Quiz challenges

- **Classification:** Mostly in parity
- **Relevant web files:** `src/pages/QuizChallenges.jsx`, `src/App.jsx`
- **Relevant mobile files:** `mobile/app/(tabs)/challenges.tsx`, `mobile/app/(tabs)/_layout.tsx`
- **Web behavior:** Entire route and navigation are guarded by `features.challenges`; create/play/submit with set lookup and pending status.
- **Mobile behavior:** Create/play/submit logic is present, but tab and screen are not entitlement-guarded.
- **Missing/outdated logic:** Route/tab permission gate and plan-limit flow; verify email validation and result payload fields.
- **Intent:** Accidental permission gap.
- **Recommended approach:** Hide/redirect tab based on entitlements and retain server 402 fallback.
- **Risk:** Medium
- **Tests:** feature enabled/disabled, deep-link bypass, invalid/self email, pending/complete states, submit retry.

### 4.16 Study groups

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/pages/StudyGroups.jsx`, `src/pages/StudyGroupDetail.jsx`
- **Relevant mobile files:** `mobile/app/study-groups.tsx`, `mobile/app/study-groups/[id].tsx`
- **Web behavior:** Mine/search/join/create; creation requires `features.study_group_creation`; create payload includes richer form data; detail can attach book materials.
- **Mobile behavior:** Mine/join/create exist, but no entitlement gate, public search, or material attachment.
- **Missing/outdated logic:** Permission check, search endpoint, payload fields, book lookup and `/materials` mutation.
- **Intent:** Accidental.
- **Recommended approach:** Gate create before rendering and before submit, add native search/material picker, and share group DTOs.
- **Risk:** High
- **Tests:** free/eligible plans, direct submit bypass, search debounce/errors, join invalid code, material permission and invalidation.

### 4.17 Folders/collections

- **Classification:** Already in parity (native UX differs)
- **Relevant web files:** `src/pages/Folders.jsx`, `src/components/folders/*`
- **Relevant mobile files:** `mobile/app/folders.tsx`
- **Web behavior:** Create/edit/delete folder and manage book/set membership.
- **Mobile behavior:** Same core endpoints and membership fields are present with native modal/alert interaction.
- **Missing/outdated logic:** Confirm description/color/icon/parent editing coverage; mobile create currently sends only name while web exposes richer metadata.
- **Intent:** Possibly intentional simplified creation; metadata difference needs confirmation.
- **Recommended approach:** Keep native flow, add fields only if product requires full metadata parity.
- **Risk:** Low
- **Tests:** create/edit/delete, membership preservation, empty state, partial fetch error.

### 4.18 Achievements

- **Classification:** Needs product clarification
- **Relevant web files:** `src/pages/Achievements.jsx`, `src/components/dashboard/AchievementsPanel.jsx`, `src/lib/achievements.js`
- **Relevant mobile files:** `mobile/app/achievements.tsx`, `mobile/components/AchievementsPanel.tsx`, `mobile/lib/achievements.ts`
- **Web behavior:** Computes display achievements from books, sets, analytics and challenges; earned records are read in leaderboard/notification flows. The web display panel does not client-create achievement records.
- **Mobile behavior:** Computes similar achievements, then `AchievementsPanel` GETs earned records and POSTs missing ones to `/achievements/` from the client.
- **Missing/outdated logic:** The mobile client may be authoritatively mutating achievements when web/backend sync is intended to own them.
- **Intent:** Ambiguous; do not remove without confirming whether the POST is a legacy compatibility mechanism.
- **Recommended approach:** Inspect backend achievement sync contract and product ownership decision. Prefer server-side sync plus read-only clients.
- **Risk:** High
- **Tests:** duplicate/idempotent award, concurrent devices, forged thresholds, notification creation, server sync.

### 4.19 Analytics

- **Classification:** Already in parity
- **Relevant web files:** `src/pages/Analytics.jsx`
- **Relevant mobile files:** `mobile/app/analytics.tsx`, `mobile/types/api.ts`
- **Behavior:** Both use `/analytics/me` and present score trend/rating/weak-topic data with platform-native visualization.
- **Gap:** Mobile DTO should be generated/shared to prevent silent schema drift.
- **Intent:** UI variation intentional.
- **Risk:** Low
- **Tests:** empty, partial, complete analytics; null scores; refresh/error.

### 4.20 Quiz history and result detail

- **Classification:** Already in parity
- **Relevant web files:** `src/pages/QuizHistory.jsx`, `src/pages/QuizResultDetail.jsx`
- **Relevant mobile files:** `mobile/app/quiz-history.tsx`, `mobile/app/quiz-results/[id].tsx`
- **Behavior:** Same list/detail endpoints; mobile appropriately uses infinite scrolling and pull-to-refresh.
- **Gap:** Verify null percentage and legacy `extras` answers consistently.
- **Risk:** Low
- **Tests:** pagination, empty/error, legacy result, missing answer metadata.

### 4.21 General and challenge leaderboards

- **Classification:** Already in parity
- **Relevant web files:** `src/pages/Leaderboard.jsx`, `src/pages/ChallengeLeaderboard.jsx`
- **Relevant mobile files:** `mobile/app/leaderboard.tsx`, `mobile/app/challenge-leaderboard.tsx`
- **Behavior:** Metric paging/my-rank and overall/by-content/badges endpoints align. Mobile uses native infinite lists.
- **Gap:** Challenge leaderboard navigation should follow the challenges entitlement gate.
- **Risk:** Low individually; Medium when permission is considered.
- **Tests:** metrics, pagination, current user, empty/error, feature disabled.

### 4.22 Scorecards and public sharing

- **Classification:** Outdated on mobile; public-link management missing
- **Relevant web files:** `src/pages/Scorecards.jsx`, `src/pages/PublicScorecard.jsx`, scorecard route configuration
- **Relevant mobile files:** `mobile/app/scorecards.tsx`
- **Web behavior:** Rollout flag, weekly/monthly/course cards, automatic refresh, cached-data fallback copy, public link create with 7/30/90-day expiry and optional display name, copy/revoke/regenerate, and image download. Public token page is available.
- **Mobile behavior:** Period selection, refresh and native image share exist. Public link creation, display-name controls, revoke/regenerate and public-token route are absent. Error copy does not indicate cached data preservation. No rollout flag.
- **Missing/outdated logic:** Share-link API lifecycle and feature gating.
- **Intent:** Native image share is intentional additional UX; missing public sharing accidental unless product excludes mobile.
- **Recommended approach:** Add native link management and system share/copy; decide whether public links open externally or in an in-app public route.
- **Risk:** High
- **Tests:** refresh, empty/partial card, create constraints, expiry choices, display-name validation, revoke/regenerate, offline cached card, rollout disabled.

### 4.23 Billing, subscriptions and credits

- **Classification:** Outdated and substantially missing on mobile
- **Relevant web files:** `src/lib/billing.js`, `src/pages/Pricing.jsx`, `src/pages/BillingUsage.jsx`, `src/components/billing/*`, `src/pages/BillingSuccess.jsx`, `src/pages/BillingCancel.jsx`
- **Relevant mobile files:** `mobile/lib/billing.ts`, `mobile/app/pricing.tsx`, `mobile/app/billing.tsx`, `mobile/components/UpgradeSection.tsx`, `mobile/components/UpgradeLimitModal.tsx`
- **Web behavior:** Server-driven pricing, monthly/yearly checkout, trial eligibility/start, cancellation-at-period-end, entitlements, credit pricing/purchase/usage/purchase history, success/cancel return handling, upgrade error hooks and subscription rollout flag.
- **Mobile behavior:** Hard-coded three monthly plan buttons, checkout via Linking, entitlements and credit usage only. No API-driven catalog, annual interval, trial, cancellation, credit purchase, purchase history, return verification screens, or upgrade-hook handling. Plan label maps differ from web.
- **Missing/outdated logic:** Most subscription lifecycle and credit commerce behavior.
- **Intent:** Accidental/incomplete implementation; native checkout return handling is platform-specific.
- **Recommended approach:** First share billing DTOs/predicates and make mobile render `/billing/pricing`; then add deep-link return routes, trial, cancellation and credit purchase/history one workflow at a time. Confirm store-policy implications before exposing external Stripe checkout in production mobile binaries.
- **Risk:** Critical
- **Tests:** plan/interval matrix, trial eligibility, checkout deep link, cancel/return, subscription cancellation, credits quantities/prices/history, 402 upgrade hook, stale entitlements.

### 4.24 Celebrations and achievement presentation

- **Classification:** Missing on mobile
- **Relevant web files:** `src/lib/celebrations/*`, `src/components/celebrations/*`, `tests/celebrations/*`
- **Relevant mobile files:** no equivalent policy/queue/seen-state layer; haptic helpers only
- **Web behavior:** Policy-controlled subtle/medium/major celebrations, deduplication/retention, queue limits, accessibility announcements, optional audio/confetti and trusted-event rules.
- **Mobile behavior:** Haptics and ordinary result screens, without the shared celebration rules or seen-state behavior.
- **Missing/outdated logic:** Product-level celebration policy and deduplication, not merely animation.
- **Intent:** Accidental feature gap; visual implementation must remain native.
- **Recommended approach:** Extract pure celebration policy/seen-state logic and add a native provider using Reanimated/haptics, respecting reduced motion.
- **Risk:** Medium
- **Tests:** policy unit tests shared across platforms, deduplication, queue bounds, reduced motion, app background/foreground.

### 4.25 Feedback

- **Classification:** Already in parity
- **Relevant web files:** `src/pages/Feedback.jsx`
- **Relevant mobile files:** `mobile/app/feedback.tsx`
- **Behavior:** Both validate non-empty feedback and POST `/feedback`; presentation is platform-native.
- **Risk:** Low
- **Tests:** empty, success, API error, double submission.

### 4.26 Admin user management

- **Classification:** Needs product clarification
- **Relevant web files:** `src/pages/UserManagement.jsx`, admin route/sidebar checks
- **Relevant mobile files:** none
- **Web behavior:** Admin-only user list, create and role update.
- **Mobile behavior:** No route or feature.
- **Missing/outdated logic:** Entire admin workflow and role guard.
- **Intent:** Could be intentionally desktop-only because `apps/admin/` also exists.
- **Recommended approach:** Do not implement until product confirms admin-on-mobile scope. If required, enforce role both in navigation and screen; backend remains authoritative.
- **Risk:** High
- **Tests:** non-admin deep link, admin list/create/role update, self-role edge cases.

### 4.27 Feature flags and entitlement gates

- **Classification:** Outdated on mobile
- **Relevant web files:** `.env.example`, `src/App.jsx`, `src/components/layout/AppLayout.jsx`, `src/components/layout/Sidebar.jsx`, `src/lib/billing.js`
- **Relevant mobile files:** `mobile/.env.example`, `mobile/lib/billing.ts`, mobile routes/navigation
- **Web behavior:** Flags for subscriptions, notifications, nudges, scorecards and celebrations; entitlements guard challenges, study-group creation and game limits.
- **Mobile behavior:** Subscription flag exists, game limit is read, but notifications/nudges/scorecards are unconditional and challenge/study-group route gates are absent.
- **Missing/outdated logic:** Flag catalog/default parity and entitlement guards.
- **Intent:** Accidental.
- **Recommended approach:** Central mobile feature-config module with matching defaults plus reusable entitlement guard hook/component.
- **Risk:** High
- **Tests:** every flag on/off, stale entitlements, direct deep links, server 402 fallback.

### 4.28 Analytics and study event tracking

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/lib/analytics.js`, study/game call sites
- **Relevant mobile files:** `mobile/app/games/[setId]/[slug].tsx`, scattered/no general tracker
- **Web behavior:** Central fire-and-forget `/study/events` helper used across learning flows.
- **Mobile behavior:** Game route posts events directly; non-game flows are not consistently instrumented and payload naming can drift.
- **Missing/outdated logic:** Central event taxonomy/payload helper and equivalent call sites.
- **Intent:** Accidental.
- **Recommended approach:** Share event names/schema and create platform-specific transport wrappers.
- **Risk:** Medium
- **Tests:** event payload contract, failure does not block UX, no duplicate completion events.

### 4.29 Caching and synchronization

- **Classification:** Outdated on mobile
- **Relevant web files:** `src/lib/query-client.js`, `src/lib/coreDataCache.js`, `src/lib/offlineCache.js`, query invalidations throughout pages
- **Relevant mobile files:** root QueryClient in `mobile/app/_layout.tsx`, `mobile/lib/offlineStudy.ts`, feature query hooks
- **Web behavior:** User-scoped core data cache, defined prefetches, dependent invalidations and offline study flush.
- **Mobile behavior:** Query defaults and offline progress flush exist, but cache is not centrally user-scoped/cleared and dependent invalidation is incomplete.
- **Missing/outdated logic:** User isolation, logout clear, mutation dependency map, scorecard/analytics/achievement refresh, observable offline queue status.
- **Intent:** Offline implementation is intentional; invalidation gaps accidental.
- **Recommended approach:** Add a mobile query-key factory and mutation invalidation helpers; clear all query data on auth identity change; preserve the native offline queue.
- **Risk:** High
- **Tests:** switch users on one device, logout/login, offline mutation replay, duplicate replay, mutation-driven refresh.

## 5. APIs and contracts requiring shared types

Priority DTOs to generate or extract from the FastAPI schemas:

1. `User`, auth challenge/verify/refresh responses, onboarding payload.
2. `EntitlementsSnapshot`, pricing catalog, trial eligibility, credit balances/usage/purchases and structured 402 detail.
3. `FlashcardSet`, `CardProgress`, study progress request/response, quiz result request/response and event metadata.
4. Engagement preference, notification, nudge and scorecard/share-link types.
5. Study group detail/create/material payloads.
6. Book upload/duplicate/job/generation types and validation constants.

The shared layer must be free of DOM, React Router, React Native, storage and Axios dependencies.

## 6. Phased implementation plan

### Phase 0 — Clarifications and contract foundation

1. Decide native refresh-token/cookie strategy.
2. Confirm removal of mobile password registration/recovery.
3. Confirm admin-on-mobile scope.
4. Confirm achievement write ownership.
5. Confirm public scorecard route and external Stripe checkout policy for iOS/Android.
6. Create shared browser-free DTO/validation package or generated API types.

### Phase 1 — Critical platform correctness

1. Authentication bootstrap, refresh and cache isolation.
2. Query-key factory, logout clear and dependent invalidation helpers.
3. Feature-flag config and entitlement route/action guards.
4. Global API error parity.

### Phase 2 — Learning data integrity

1. Study session progress restoration and mutation response handling.
2. Quiz/game completion payload and invalidation parity.
3. Daily review mutation parity.
4. Analytics/study event taxonomy and call sites.

### Phase 3 — Commerce and permissions

1. API-driven pricing and shared plan labels.
2. Checkout intervals and deep-link return flow.
3. Trial and subscription cancellation.
4. Credit pricing, purchase and histories.
5. Study-group creation gate and challenge route guards.

### Phase 4 — Account and engagement

1. Settings plus engagement preferences.
2. Profile validation/theme parity.
3. Notifications/nudges completion and flags.
4. Native celebration provider backed by shared policy.

### Phase 5 — Content management

1. Book metadata/delete/job parity.
2. Flashcard tags.
3. Study-group search/materials.
4. Folder metadata, if product confirms it is required.

### Phase 6 — Scorecards and dashboard completion

1. Public scorecard link lifecycle.
2. Scorecard rollout/cached states.
3. Dashboard view-model/data composition.
4. Public scorecard deep-link behavior based on the Phase 0 decision.

### Phase 7 — Remove obsolete flows and close clarified scope

1. Remove/redirect legacy mobile password screens after confirmation.
2. Add admin workflow only if approved.
3. Remove client achievement writes if server ownership is confirmed.
4. Run end-to-end parity regression matrix.

## 7. Testing strategy

- **Contract tests:** validate mobile DTO parsing against representative FastAPI responses and structured errors.
- **Unit tests:** shared validation, entitlement predicates, plan mapping, study result builders, event schemas, celebration policy.
- **Mobile component tests:** loading/error/empty/success, permission gates, forms, mutation retry.
- **Integration tests:** mocked API flows for auth refresh, book generation, study completion, challenge completion, billing and sharing.
- **Device tests:** deep links, background/resume, offline replay, push behavior in development build, checkout return, secure token persistence.
- **Cross-platform parity fixtures:** run the same business-rule cases against web and mobile adapters.
- **Backend tests:** retain the API as final permission authority; add cases for direct mobile bypass attempts.

## 8. Implementation protocol

For every implementation item:

1. State the inconsistency, exact files, intended behavior and assumptions before editing.
2. Make one bounded, reviewable feature change.
3. Run mobile TypeScript, applicable lint/unit tests, and an Expo/Metro bundle when routes or native modules change.
4. Report exact changes and unresolved decisions.
5. Stop rather than invent a rule where this audit marks product clarification.

---

## 9. Verifiable repository baseline

This baseline was collected on 2026-08-03 before any parity implementation. The worktree already contained unrelated and earlier uncommitted changes; this evidence pass modified only this audit file.

### Toolchain and workspace

- **Package manager:** npm, with independent `package-lock.json` files at the repository root, `mobile/`, `apps/admin/`, and `apps/marketing/`. Node `v24.10.0`; npm `11.6.1`.
- **Workspace structure:** no npm-workspaces declaration and no shared frontend package. Root web SPA (`src/`), Expo app (`mobile/`), FastAPI service (`services/api/`), separate admin and marketing apps (`apps/admin/`, `apps/marketing/`).
- **Web:** React `^18.2.0`, Vite `^6.1.0`, React Router `^6.26.0`, TanStack Query `^5.84.1` (`package.json`).
- **Mobile:** Expo SDK `~54.0.0`, React Native `0.81.5`, React `19.1.0`, Expo Router `~6.0.23`, TanStack Query `^5.100.9` (`mobile/package.json`).
- **Backend:** FastAPI installed `0.136.1` (requirement `>=0.115.0`), Pydantic installed `2.13.4`, SQLAlchemy installed `2.0.49`; Python project is requirements/venv based, not an npm workspace.

### Existing commands and observed results

| Area | Command | Result before parity implementation |
|---|---|---|
| Web type check | `npm run typecheck` | **Fail.** `tsc -p ./jsconfig.json` reported 480 lines, including missing `ImportMeta.env` typing, canvas-confetti `module`, Radix/UI prop inference failures, and existing application errors such as `StudyGroups` mutation typing and missing game props. |
| Web lint | `npm run lint` | **Fail.** 15 unused-import errors across `TagInput`, game components, `RetryDeck`, `FlashcardSets`, and `StudyGroupDetail`. |
| Web celebration units | `npm run test:celebrations` | **Pass.** 5 files/tests passed. |
| Web browser tests | `npm run test:browser -- --reporter=line` | **Fail before tests.** Playwright `webServer` process could not start, exit code 1. |
| Mobile type check | `cd mobile && npm run typecheck` | **Pass.** `tsc --noEmit`. |
| Mobile lint | none | No lint script exists in `mobile/package.json`. |
| Mobile unit/integration tests | none | No mobile test script or test runner is configured. |
| Backend unit tests | `services/api/.venv/bin/pytest services/api/tests/unit -q -x` | **Fail.** 38 passed, then `test_book_deletion.py::test_collects_linked_and_resource_and_orphan_sets` failed because `_flashcard_set_ids_for_book` reads `book.title` from a fixture without that attribute (`services/api/services/book_deletion.py:70`). |
| Backend integration tests | `services/api/.venv/bin/pytest services/api/tests/integration -q -x` | **Inconclusive.** One test passed, nine skipped, then the run stalled and was interrupted. DB-dependent test infrastructure must be started/diagnosed before using this as a gate. |

The precise post-change baseline for mobile tickets is therefore `cd mobile && npm run typecheck`; route/native-module changes additionally require `cd mobile && npx expo export --platform android --output-dir /tmp/bilkeys-parity-export`. Ticket-specific backend tests are listed below. Existing web type-check/lint failures must not be attributed to mobile parity changes unless their output changes.

## 10. Critical and High-risk evidence dossiers

These dossiers supersede any less-specific wording in sections 4.1–4.29. Line numbers refer to the repository state inspected on 2026-08-03.

### 10.1 Authentication/session lifecycle — section 4.1

- **Verification:** **Confirmed**, with one implementation decision blocked by backend capability.
- **Exact web evidence:** `AuthProvider.loadUser`, `loginWithEmailCode`, `loginWithGoogle`, and `logout` in `src/lib/AuthContext.jsx:22-104`; `isAuthNoRefreshUrl` and the Axios response interceptor in `src/api/client.js:79-165`.
- **Exact mobile evidence:** `useAuthStore` actions `setAuth`, `setAccessToken`, `logout` and persistence partializer in `mobile/store/authStore.ts:24-66`; mobile Axios interceptor in `mobile/api/client.ts:19-85`; initial persisted-token routing in `mobile/app/index.tsx:7-34`; `useLogout.performLogout` in `mobile/hooks/useLogout.ts:7-19`.
- **Web wire behavior:** `POST /auth/email/verify` body `{challenge_id, code, remember_me}` -> `LoginResponse {access_token, token_type, user}`; `POST /auth/google` body `{id_token, remember_me}` -> same; startup `POST /auth/refresh` with httpOnly refresh cookie -> `{access_token}`; then `GET /users/me` -> `UserPublic`; `POST /auth/logout` -> `{message}`.
- **Mobile wire behavior:** login uses the same passwordless/Google endpoints and response fields, but persisted startup uses cached `{user, accessToken}` without `GET /users/me`; 401 handling calls cookie-based `POST /auth/refresh` and expects only `{access_token}`; logout posts `/auth/logout` then clears only Zustand auth state.
- **Backend contract:** `refresh_tokens` in `services/api/routers/auth.py:583-626` requires `Cookie(alias=_REFRESH_COOKIE_NAME)` and returns `RefreshTokenResponse` from `services/api/schemas/auth.py:38-42`; `logout` lines 629-650 also consumes that cookie. `get_current_user` accepts a bearer access token (`services/api/dependencies.py:94-118`). Login/email schemas are `EmailAuthVerifyRequest` and `GoogleLoginRequest` (`services/api/schemas/auth.py:61-67,82-87`).
- **Proof:** The mobile source itself notes cookie handling is uncertain (`mobile/api/client.ts:9-12`). The only backend refresh input is an httpOnly cookie; no native refresh-token response field or body schema exists. Mobile also never server-revalidates persisted `user` at bootstrap and cannot clear the root QueryClient from `useLogout`.
- **Authority conflict:** Web intends refresh-cookie rotation; backend supports only cookies. A secure native refresh design cannot be inferred. **Blocked by ambiguity** for refresh-token redesign, but startup `/users/me` validation and cache clearing are confirmed safe gaps.
- **Smallest safe unit:** Add authenticated startup `/users/me` revalidation and QueryClient clearing on logout without changing refresh transport. Handle expired refresh failure by routing to login.
- **Validation:** `cd mobile && npm run typecheck`; `cd mobile && npx expo export --platform android --output-dir /tmp/bilkeys-auth-export`; add/run mobile Axios/store tests once a test runner exists; backend reference test `services/api/.venv/bin/pytest services/api/tests/integration/test_auth.py services/api/tests/unit/test_passwordless_auth.py -q`.

### 10.2 Onboarding navigation — section 4.3

- **Verification:** **Confirmed**.
- **Web evidence:** `RequireOnboarding` in `src/App.jsx:78-98`; `Onboarding.finish` in `src/pages/Onboarding.jsx:21-35`.
- **Mobile evidence:** `Index` in `mobile/app/index.tsx:7-34`; `OnboardingScreen.submit` in `mobile/app/onboarding.tsx:20-33`; 403 redirect in `mobile/api/client.ts:36-42`.
- **Web API:** `POST /auth/onboarding`, body `{full_name: name.trim() || null}`, response `UserPublic`; calls `refreshUser()` (`GET /users/me`) and replaces `location.state.from.pathname` or `/`.
- **Mobile API:** Same POST/body/`User` response; writes response into Zustand, then always `router.replace('/(tabs)')`.
- **Backend:** `complete_onboarding` in `services/api/routers/auth.py:442-453`; `OnboardingRequest {full_name?: string, max_length=255}` in `services/api/schemas/auth.py:89-93`; response `UserPublic`.
- **Proof:** Payload and server state transition match. The user flow does not: web preserves the protected destination while mobile discards it. Backend neither defines nor conflicts with client return navigation.
- **Smallest safe unit:** Carry a validated local `returnTo` router parameter into `/onboarding` and consume it after success; default to tabs.
- **Validation:** `cd mobile && npm run typecheck`; Expo Router integration tests for a protected deep link with incomplete onboarding; Android export command above.

### 10.3 Global 401/402/403 handling — section 4.4

- **Verification:** **Confirmed**.
- **Web evidence:** `isAuthNoRefreshUrl` and Axios interceptor in `src/api/client.js:79-165`; `RequireFeature` in `src/App.jsx:101-123`.
- **Mobile evidence:** Axios interceptor in `mobile/api/client.ts:30-85`; `UpgradeLimitModal` and `emitUpgradeLimit` in `mobile/components/UpgradeLimitModal.tsx` and `mobile/lib/upgradeLimitEvents.ts`.
- **Web wire behavior:** On 403 `{error:'onboarding_required'}` redirects; on 402 reads `response.data.detail.message`; on 401 skips all auth endpoints, queues one `POST /auth/refresh`, and redirects after terminal failure.
- **Mobile wire behavior:** Same 403/402 shapes, but only `/auth/refresh` is excluded from refresh. A 401 from email start/verify, Google, logout, register or Apple can incorrectly trigger refresh. Terminal failure calls `useAuthStore.logout()` but does not explicitly clear queries or route from the interceptor.
- **Backend:** Auth routes use 401/403 `HTTPException`; refresh contract above. Entitlement routes return 402 structured detail, e.g. `create_group` in `services/api/routers/study_groups.py:277-282`.
- **Proof:** The endpoint exclusion lists differ directly (`src/api/client.js:79-90` vs `mobile/api/client.ts:57-63`).
- **Smallest safe unit:** Port the pure auth-endpoint exclusion predicate and terminal-login transition to mobile; do not alter refresh transport.
- **Validation:** `cd mobile && npm run typecheck`; add interceptor unit cases for every auth URL, queued 401, 402 object/string detail, and onboarding 403.

### 10.4 Settings and engagement preferences — section 4.7

- **Verification:** **Confirmed**.
- **Web evidence:** `DEFAULTS`, engagement load effect and `save` in `src/pages/Settings.jsx:47-126`.
- **Mobile evidence:** `DEFAULTS`, `readPrefs`, `me` query and `saveMutation` in `mobile/app/settings.tsx:37-99`.
- **Web API:** `GET /engagement/preferences` -> `{in_app_enabled, learning_reminders, streak_reminders, weekly_summaries, achievement_announcements, marketing_emails, celebration_animations, achievement_sounds, streak_sounds, quiet_hours_start, quiet_hours_end, timezone}`; concurrent `PATCH /users/me {preferences:{settings:prefs}}` and `PATCH /engagement/preferences` with nine selected engagement fields; then `GET /users/me` through `refreshUser`.
- **Mobile API:** `GET /users/me` -> `User`; `PATCH /users/me {preferences:{settings:prefs}}` -> `User`. No engagement request exists.
- **Backend:** `get_preferences` and `patch_preferences` in `services/api/routers/engagement.py:156-170`; schemas `EngagementPreferencesOut` and `EngagementPreferencesPatch` in `services/api/schemas/engagement.py:38-77`; timezone and quiet-hour validation are backend-defined.
- **Proof:** Mobile's `SettingsPrefs`/defaults omit all engagement fields and makes no call to the dedicated preference resource. Same endpoint use is not claimed; this is a distinct persisted model.
- **Smallest safe unit:** Add typed GET/PATCH engagement preference query/mutation and a native engagement section, keeping `/users/me` settings save separate so partial failures are visible.
- **Validation:** `cd mobile && npm run typecheck`; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_engagement.py -q`; mobile mocked integration cases for initial merge, invalid timezone 422, and one-of-two mutation failure.

### 10.5 Book generation and deletion — section 4.10

- **Verification:** **Partially confirmed**. Deletion and reused-generation handling are confirmed gaps; the earlier claim that web edits title/author is not supported by the backend and is withdrawn.
- **Web evidence:** `extractToc`, `generateFlashcards`, reused-set transition, and `handleDelete` in `src/pages/BookDetail.jsx:175-269`; extras patch call around `src/pages/BookDetail.jsx:386-394`.
- **Mobile evidence:** `extractToc` and `startGenerate` in `mobile/app/book/[id].tsx:137-199`; no `api.delete('/books/...')` or book patch exists in this screen.
- **Web API:** `POST /books/{id}/extract-toc`, no body -> `{job_id,message}`; `POST /flashcard-sets/generate` body `{book_id:id,title:buildFlashcardSetTitle(...),num_cards,selected_chapters:[chapter],summary_detail_level}` -> `JobEnqueueResponse {job_id,set_id?,reused?,message?}`; if reused, navigates immediately; `DELETE /books/{id}` -> 204, then invalidates `books` and `flashcard-sets`.
- **Mobile API:** Same TOC endpoint. Generation body uses `{book_id:book.id,title:book.title,num_cards,selected_chapters:[chapter],summary_detail_level}` and types response only as `{job_id}`; it ignores `reused`/`set_id` and invalidates flashcard sets immediately. No delete request.
- **Backend:** `extract_toc_for_book` (`services/api/routers/books.py:437-453`); `delete_book` (`services/api/routers/books.py:510-523`) with ownership/cascade; `GenerateFlashcardsRequest` (`services/api/schemas/flashcards_api.py:79-89`); `enqueue_generate_flashcards` (`services/api/routers/flashcards.py:205-270`) can return an existing `set_id`. `BookPatch` supports only `{extras}` (`services/api/schemas/book.py:94-96`), and `patch_book` merges only extras (`services/api/routers/books.py:488-507`).
- **Proof:** Mobile lacks deletion entirely and loses valid reused response fields. Web's generated title differs from mobile. The backend does not support top-level title/author patch, so implementing that would conflict with the wire contract and is **blocked** unless backend/product change together.
- **Smallest safe unit:** Add native delete confirmation plus 204 handling and cache invalidation. Treat reused-generation navigation as a separate ticket.
- **Validation:** `cd mobile && npm run typecheck`; Android export; backend targeted tests `services/api/.venv/bin/pytest services/api/tests/unit/test_book_deletion.py services/api/tests/unit/test_generation_workflow.py -q` (currently blocked by the documented pre-existing book deletion unit failure).

### 10.6 Study progress and session state — section 4.12

- **Verification:** **Confirmed**.
- **Web evidence:** progress restore effect and `handleCardRate` in `src/pages/StudySession.jsx:110-227`; quiz/game persistence and invalidations in `src/pages/StudySession.jsx:230-305`.
- **Mobile evidence:** session query and due-card selection in `mobile/app/study/[id].tsx:82-176`; `submitProgress`/`rateAndAdvance` in lines 209-259; offline queue/flush in `mobile/lib/offlineStudy.ts:55-110`.
- **Web API:** `GET /flashcard-sets/{id}` -> full `FlashcardSetOut`; `GET /card-progress/` -> progress rows; `POST /study/progress {card_id,quality}` -> `StudyProgressOut` including SM-2 fields and `celebration_events`; response replaces optimistic state and invalidates scorecards.
- **Mobile API:** concurrently `GET /flashcard-sets/{id}` and `GET /study/due-cards?set_id={id}&limit=20`; constructs the active deck only from due cards. `POST /study/progress {card_id,quality}` discards the response and on any network/API error queues the request. Offline flush repeats the POST and also discards the response.
- **Backend:** `StudyProgressIn {card_id, quality 0..5}` and `StudyProgressOut` in `services/api/schemas/quiz_api.py:8-50`; `post_study_progress` in `services/api/routers/study.py:37-182` verifies ownership, transitions SM-2 state, emits events, refreshes scorecards and returns `celebration_events`.
- **Proof:** Mobile does not use the returned authoritative SM-2/celebration state, does not restore `/card-progress/`, and changes the reference full-deck flow to due-only maximum 20. Moreover, it queues all caught failures, including permanent 403/404/422—not only offline/transient failures.
- **Smallest safe unit:** Introduce a typed `postStudyProgress` mobile helper that returns `StudyProgressOut`, queues only connectivity/retryable failures, and invalidates scorecards/analytics/achievements. Do not change deck selection in the same unit.
- **Validation:** `cd mobile && npm run typecheck`; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_sm2.py services/api/tests/unit/test_celebration_events.py -q`; new mobile tests for 200/403/404/422/offline and replay.

### 10.7 Games and quiz-result persistence — section 4.13

- **Verification:** **Confirmed**.
- **Web evidence:** `handleQuizComplete` and `handleGameComplete` in `src/pages/StudySession.jsx:230-305`.
- **Mobile evidence:** `GameBySlugScreen` completion callback in `mobile/app/games/[setId]/[slug].tsx:104-132`.
- **Web API:** `POST /quiz-results/` with `{set_id,score,total_questions,time_taken_seconds,extras:{set_title,book_title,percentage,answers?}}`; consumes returned `QuizResultOut.celebration_events`; invalidates `scorecards`, `quiz-results`, `analytics-summary`, `achievements`; failure is visible to the user. `POST /study/events {event_type,metadata}` is fire-and-forget.
- **Mobile API:** navigates away first, fire-and-forgets `POST /study/events {event_type:'game_continue',set_id,metadata:{game,score}}` and `POST /quiz-results/ {set_id,score,total_questions,time_taken_seconds:0,extras:{percentage}}`; only logs failures and performs no invalidation or response handling.
- **Backend:** `QuizResultCreate`/`QuizResultOut` in `services/api/schemas/quiz_api.py:74-110`; `create_quiz_result` in `services/api/routers/quiz_results.py:89-148` validates ownership, computes percentage, refreshes scorecards, and returns celebration events.
- **Proof:** Endpoint equality hides materially different response handling, metadata, failure UX and cache transitions.
- **Smallest safe unit:** Centralize mobile quiz-result save for games, await it before final transition, parse response, invalidate four query families, and show retryable failure.
- **Validation:** `cd mobile && npm run typecheck`; Android export; mocked completion tests for success, 404 ownership failure, duplicate press and network retry.

### 10.8 Study groups — section 4.16

- **Verification:** **Confirmed**, but server authorization prevents unauthorized persistence.
- **Web evidence:** queries/mutations and create payload in `src/pages/StudyGroups.jsx:35-103`; `canCreateGroup` rendering gate at lines 133-143; material mutation in `src/pages/StudyGroupDetail.jsx:38-71`.
- **Mobile evidence:** `StudyGroupsScreen` queries/mutations in `mobile/app/study-groups.tsx:31-78` and unconditional create control at lines 104-125; read-only detail in `mobile/app/study-groups/[id].tsx:24-79`.
- **Web API:** `GET /study-groups/mine`; `GET /study-groups/search?q` when length >=2; `POST /study-groups/join {code}`; `POST /study-groups/ {name,description,privacy,weekly_card_goal,book_ids}`; `POST /study-groups/{id}/materials {book_id}`. UI create is gated by `entitlements.features.study_group_creation`.
- **Mobile API:** mine/join/create use the same create schema but fixed `{privacy:'public',weekly_card_goal:20,book_ids:[]}`; no search or material POST; no client gate. It does receive the global 402 modal on disallowed creation.
- **Backend:** request models `StudyGroupCreate`, `StudyGroupJoin`, `StudyGroupMaterialIn` in `services/api/routers/study_groups.py:27-41`; `create_group` enforces `Action.CREATE_STUDY_GROUP` and returns structured 402 (`:271-317`); search `:167-193`; materials `:346-373`.
- **Proof:** Mobile exposes an action web hides and omits two web flows. Backend prevents the permission bypass, so this is UX/flow parity rather than a data-security hole.
- **Smallest safe unit:** Extend mobile `EntitlementsSnapshot.features` and hide/disable create using `study_group_creation`, while retaining backend 402 fallback. Search/materials are separate tickets.
- **Validation:** `cd mobile && npm run typecheck`; mocked free/paid entitlement screen tests; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_entitlements_expanded.py -q`.

### 10.9 Achievements ownership — section 4.18

- **Verification:** **Confirmed contract violation**; no product ambiguity remains for the current wire contract.
- **Web evidence:** `Achievements` reads books, sets, analytics and challenges then renders `AchievementsPanel` (`src/pages/Achievements.jsx:9-59`); no achievement POST exists in web.
- **Mobile evidence:** `AchievementsPanel` GETs `/achievements/`, computes missing client achievements, then attempts `POST /achievements/ {achievement_type,metadata}` in `mobile/components/AchievementsPanel.tsx:20-60`, swallowing every error.
- **Backend:** `services/api/routers/achievements.py:44-54` exposes **only GET** `/achievements/`; `list_achievements` invokes server `sync_user_achievements`. Server definitions and database-derived checks are in `services/api/services/achievement_sync.py:42-136`. There is no create request schema or POST route.
- **Proof:** The mobile POST cannot succeed against this backend (405 Method Not Allowed) and the empty catch hides it. Backend explicitly owns evaluation.
- **Smallest safe unit:** Remove the mobile POST effect and render only server-returned earned achievements, optionally retaining local locked-progress display.
- **Validation:** `cd mobile && npm run typecheck`; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_achievement_sync.py -q`; mobile network test asserting the screen performs GET only.

### 10.10 Scorecards and sharing — section 4.22

- **Verification:** **Confirmed**.
- **Web evidence:** `Scorecards` query/refresh/share lifecycle in `src/pages/Scorecards.jsx:54-76`; rollout route in `src/App.jsx:153`; public page `src/pages/PublicScorecard.jsx`.
- **Mobile evidence:** scorecard query/refresh and image-only sharing in `mobile/app/scorecards.tsx:45-135`; unconditional route in `mobile/app/_layout.tsx:69-72` and navigation in `mobile/lib/navigation.ts:16-20`.
- **Web API:** `GET /scorecards/` -> `ScorecardOut[]`; `POST /scorecards/refresh` -> list; `POST /scorecards/{id}/share {expires_in_days,show_display_name,public_display_name}` -> `{id,share_url,expires_at,show_display_name}`; `DELETE /scorecards/{id}/share/{share_id}` -> `{revoked:true}`. The public token endpoint is backend-served.
- **Mobile API:** only GET list and POST refresh; native image sharing does not call the share APIs.
- **Backend:** `ScorecardOut`, `ShareCreate`, `ShareOut` in `services/api/routers/scorecards.py:33-74`; list/refresh/create/revoke routes at `:103-175`; server gates `ENGAGEMENT_SCORECARDS_ENABLED` and `SCORECARD_SHARE_ENABLED` (`:86-93`). `ShareCreate` requires a name when `show_display_name=true` and normalizes/control-character-checks text.
- **Proof:** Public-link state transitions and rollout guard are absent on mobile, while backend fully supports them.
- **Smallest safe unit:** Add mobile rollout gating first. Public link creation/revoke is a separate bounded feature because it needs clipboard/system-share UX.
- **Validation:** `cd mobile && npm run typecheck`; Android export; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_scorecards.py -q` and DB integration when available.

### 10.11 Billing, subscriptions, trials, cancellation and credits — section 4.23

- **Verification:** **Confirmed**, with checkout return behavior blocked by platform/product policy.
- **Web evidence:** all API helpers in `src/lib/billing.js:17-107`; trial/cancel flow in `src/pages/Pricing.jsx:17-123`; usage/purchases/buy entry in `src/pages/BillingUsage.jsx:25-115`.
- **Mobile evidence:** partial types/helpers in `mobile/lib/billing.ts:5-65`; `PricingScreen` in `mobile/app/pricing.tsx:9-39`; hard-coded plans in `mobile/components/UpgradeSection.tsx`; entitlements/usage only in `mobile/app/billing.tsx`.
- **Web API:** `GET /billing/pricing` -> `{default_interval,plans:{slug:{monthly_price_cents,annual_price_cents,annual_savings_cents,...}}}`; `POST /billing/checkout?plan&interval` -> `{checkout_url}`; `GET /billing/trial/eligibility` -> `{eligible,reason,signals}`; `POST /billing/trial/start` -> `{checkout_url}`; `POST /billing/subscription/cancel` -> `{canceled_at_period_end,current_period_end}`; `GET /billing/entitlements/me` -> full snapshot; `GET /credits/pricing`; `POST /billing/checkout/credits?quantity`; `GET /credits/usage`; `GET /credits/purchase-history`.
- **Mobile API:** `GET /billing/entitlements/me`, but its local type retains only `games_limit` from `features`; `GET /credits/usage`; `POST /billing/checkout?plan&interval=monthly` -> `{checkout_url}` opened with Linking. All other calls are absent; plan prices/labels are hard-coded.
- **Backend:** billing schemas in `services/api/schemas/billing.py:6-67`; pricing/entitlements/trial/cancel routes in `services/api/routers/billing.py:402-585`; checkout/credit checkout at `:643-730`; credit pricing/history/usage in `services/api/routers/credits.py:107-197`. Checkout success/cancel URLs currently point to the configured web `FRONTEND_URL` (`billing.py:672-679`, trial `:527-534`).
- **Proof:** Mobile cannot reflect server price/interval changes and omits supported state transitions. The backend currently returns web callback URLs, so native deep-link return cannot be silently invented.
- **Authority conflict:** Web intends full commerce; backend supports it but checkout callbacks are web URLs. Whether production mobile may open external Stripe checkout and return through web vs native deep link requires product/store-policy clarification.
- **Smallest safe unit:** Replace hard-coded mobile prices with read-only `GET /billing/pricing` rendering and expand the entitlement type. No checkout behavior change.
- **Validation:** `cd mobile && npm run typecheck`; backend `services/api/.venv/bin/pytest services/api/tests/unit/test_billing_entitlements_trial.py services/api/tests/unit/test_billing_subscription_lifecycle.py services/api/tests/unit/test_billing_credit_quantity.py services/api/tests/unit/test_credits_endpoints.py -q`; mocked pricing rendering tests.

### 10.12 Admin user management — section 4.26

- **Verification:** **Blocked by ambiguity** (feature absence confirmed; mobile product scope unknown).
- **Web evidence:** route `/users` is inside authenticated layout but not wrapped by a client role guard (`src/App.jsx:134-147`); sidebar visibility uses `user.role === 'admin'` (`src/components/layout/Sidebar.jsx:44-54`); `UserManagement` GET/create/role mutations in `src/pages/UserManagement.jsx:26-83`.
- **Mobile evidence:** no `mobile/app/users.tsx` route or admin navigation item; `User.role` is limited to admin/student in `mobile/store/authStore.ts:5-9`.
- **Web API:** `GET /users/` -> `UserPublic[]`; `POST /users/ {email,password,full_name,role}` -> `UserPublic`; `PATCH /users/{id} {role}` -> `UserPublic`.
- **Mobile API:** none.
- **Backend:** `list_users_admin`, `admin_create_user`, `admin_patch_user` in `services/api/routers/users.py:117-163`, all protected by `require_role('admin')`; request schemas `AdminCreateUserRequest`/`AdminPatchUserRole` in `services/api/schemas/user.py`.
- **Proof:** Absence is verifiable, but repository contains a separate `apps/admin/`, so consumer-mobile inclusion cannot be inferred. Web also relies primarily on backend authorization because the route itself lacks `RequireRole`.
- **Smallest safe unit:** Product decision only. If approved later, first add a role-guarded read-only user list; do not include create/role mutation in the same ticket.
- **Validation:** backend `services/api/.venv/bin/pytest services/api/tests/unit/test_role_enforcement.py services/api/tests/unit/test_admin.py -q`; mobile non-admin deep-link and admin list tests.

### 10.13 Feature flags and entitlement gates — section 4.27

- **Verification:** **Confirmed**.
- **Web evidence:** `RequireFeature` and guarded challenge routes in `src/App.jsx:101-157`; scorecard rollout at line 153; notification flag in `src/components/layout/AppLayout.jsx:16-20`; navigation filter in `src/components/layout/Sidebar.jsx:26-54`.
- **Mobile evidence:** unconditional challenge tab in `mobile/app/(tabs)/_layout.tsx:82-126`; unconditional items in `mobile/lib/navigation.ts:12-30`; incomplete `EntitlementsSnapshot.features` in `mobile/lib/billing.ts:5-15`.
- **Web/backend contract:** web consumes `GET /billing/entitlements/me.features.challenges` and `.study_group_creation`; backend schema exposes `create_book`, `create_flashcard_set`, `games`, `games_limit`, `challenges`, `study_group_creation`, `priority_processing`, `daily_review_limit`, `regeneration` (`services/api/schemas/billing.py:23-43`). Scorecards/notifications/nudges additionally use rollout environment flags.
- **Mobile behavior:** only `games_limit` is typed; challenge, challenge-board and scorecard routes/navigation are always visible. No mobile equivalents for notification/nudge/scorecard flags.
- **Proof:** The backend response already contains the decisions, but the mobile type and router ignore them. Server enforcement reduces unauthorized writes but not broken navigation/UX.
- **Smallest safe unit:** Expand the entitlement DTO and gate challenge tab/navigation and deep links. Do not combine environment-rollout infrastructure.
- **Validation:** `cd mobile && npm run typecheck`; Android export; mobile free/paid/deep-link route tests; backend entitlement tests.

### 10.14 Cache isolation and synchronization — section 4.29

- **Verification:** **Confirmed**.
- **Web evidence:** user-scoped cache activation/removal in `src/lib/coreDataCache.js:3-87`; logout calls `queryClientInstance.clear()` in `src/lib/AuthContext.jsx:94-103`; dashboard prefetches in `src/components/layout/AppLayout.jsx:27-62`.
- **Mobile evidence:** module-level QueryClient in `mobile/app/_layout.tsx:28-36,102-109`; logout does not access it (`mobile/hooks/useLogout.ts:7-19`); auth store clears only user/token (`mobile/store/authStore.ts:49-64`); offline queue key is global `pending-progress` (`mobile/lib/offlineStudy.ts:7,55-73`).
- **API behavior:** Both clients cache responses from books, sets, analytics, entitlements and quiz/study mutations. Mobile replay posts `{card_id,quality}` to `/study/progress` with no user identifier because identity is derived from the current bearer token.
- **Backend:** `post_study_progress` assigns the current authenticated user (`services/api/routers/study.py:37-59`).
- **Proof:** If user A queues offline progress, logs out, and user B logs in before reconnect, the unscoped queue can replay A's card IDs under B's bearer token; backend will reject or could apply if ownership happens to match. Query data also survives logout because the singleton QueryClient is never cleared.
- **Smallest safe unit:** Expose the root QueryClient through a small module, clear it on logout/auth failure, and namespace pending progress by authenticated user ID. Migration must preserve or safely discard the legacy global queue.
- **Validation:** `cd mobile && npm run typecheck`; tests for A→logout→B cache isolation and offline queue replay; Android export.

## 11. API contract matrix

| Domain | Web contract and handling | Mobile contract and handling | Backend route/schema | Evidence status |
|---|---|---|---|---|
| Authentication/login | `POST /auth/email/start {email}` -> challenge fields; `POST /auth/email/verify {challenge_id,code,remember_me}` or Google -> `{access_token,user}`; stores token then server-loads user | Same login endpoints; stores token and user in AsyncStorage-backed Zustand | `start_email_auth`, `verify_email_auth`, Google route; `EmailAuthStartRequest/Response`, `EmailAuthVerifyRequest`, `LoginResponse` in `schemas/auth.py` | Login largely aligned; persistence is not |
| Refresh/logout | Cookie `POST /auth/refresh` -> `{access_token}`; queued retries; logout clears caches | Same cookie call from native Axios; cookie availability unproven; logout leaves queries | `refresh_tokens` requires refresh cookie (`routers/auth.py:583-626`); `RefreshTokenResponse` | **Blocked** for transport design; cache gap confirmed |
| Onboarding | `POST /auth/onboarding {full_name|null}` -> `UserPublic`; refreshes user and restores prior path | Same payload/response; always routes tabs | `complete_onboarding`; `OnboardingRequest` | Contract aligned; navigation not |
| Engagement preferences | GET full preference object; PATCH selected engagement fields; saves `/users/me` settings concurrently | No engagement endpoint; only PATCH `/users/me {preferences:{settings}}` | `get_preferences`, `patch_preferences`; `EngagementPreferencesOut/Patch` | **Confirmed gap** |
| Book generation | POST `/flashcard-sets/generate` full `GenerateFlashcardsRequest`; handles `{reused,set_id,job_id}` | Same endpoint, title differs, response typed `{job_id}` and ignores reused set | `enqueue_generate_flashcards`; `GenerateFlashcardsRequest`; `JobEnqueueResponse` | **Confirmed partial handling** |
| Book deletion | DELETE `/books/{id}` -> 204; invalidates books/sets and navigates library | No call or flow | `delete_book`, ownership + `cascade_delete_book` | **Confirmed missing** |
| Study progress | POST `{card_id,quality}`; consumes SM-2 response/celebrations; invalidates scorecards | Same request; response discarded; any failure queued; replay response discarded | `post_study_progress`; `StudyProgressIn/Out` | **Confirmed behavioral mismatch** |
| Quiz-result persistence | POST `{set_id,score,total_questions,time_taken_seconds,extras}`; consumes celebration events, visible errors, four invalidations | Same required fields but reduced extras; fire-and-forget, log-only error, no response/invalidation | `create_quiz_result`; `QuizResultCreate/Out` | **Confirmed behavioral mismatch** |
| Daily review | GET filters incl. `book_ids`, `hard_only` client filtering; POST progress and invalidate scorecards/queue | GET queue and POST progress; invalidates queue only | `get_daily_review_queue` returns `DueFlashcardOut[]`; progress route above | **Confirmed cache mismatch** (Medium risk) |
| Achievements | Read/computed display; no create POST | GET then attempts unsupported POST create and swallows error | GET-only `list_achievements`, calls `sync_user_achievements`; no POST schema | **Confirmed contract violation** |
| Study groups | Mine/search/join/create/materials; UI gate from entitlements; full configurable create payload | Mine/join/create only; fixed create fields; no client gate/search/material mutation | `StudyGroupCreate/Join/MaterialIn`; backend create 402 gate | **Confirmed gaps**, backend protects writes |
| Scorecards | GET/refresh; create/revoke public share with expiry/name; rollout flag | GET/refresh and device image share only; unconditional route | `ScorecardOut`, `ShareCreate/Out`; list/refresh/share/revoke; backend flags | **Confirmed gap** |
| Billing pricing | GET server catalog, renders intervals/prices | Hard-coded monthly buttons; no pricing GET | `billing_pricing`; `BillingPricingResponse` | **Confirmed gap** |
| Subscription checkout | POST query `{plan,interval}` -> `{checkout_url}` | POST fixed monthly `{plan,interval:'monthly'}` -> opens URL | `create_checkout_session`; `CheckoutUrlResponse`; web success/cancel URL | Contract supported; native return **blocked** |
| Trials | GET eligibility; POST start; handles structured ineligible state | No calls/UI | `trial_eligibility`, `start_trial_checkout`; `TrialEligibilityResponse` | **Confirmed missing** |
| Cancellation | POST cancel; refetch entitlements; communicates period-end state | No call/UI | `cancel_subscription_at_period_end`; `SubscriptionCancelResponse` | **Confirmed missing** |
| Credits | GET pricing/usage/purchases; POST checkout quantity; buy flow | GET usage only | credits pricing/history/usage routes; billing credit checkout | **Confirmed missing** |

## 12. Ranked first implementation tickets

Only bounded, currently supported changes are included. Ambiguous native refresh transport, admin scope, and checkout-return policy are excluded.

### Ticket 1 — Remove unsupported mobile achievement creation

- **Inconsistency:** Mobile calls a nonexistent `POST /achievements/`; backend GET already performs authoritative synchronization.
- **Expected files:** `mobile/components/AchievementsPanel.tsx`; add a focused mobile test file only if a test harness is introduced.
- **Dependencies:** None.
- **Acceptance criteria:** Achievement screen performs only `GET /achievements/`; unlocked state comes from server records; locked-progress display may remain; no swallowed POST/405 traffic.
- **Tests:** `cd mobile && npm run typecheck`; `services/api/.venv/bin/pytest services/api/tests/unit/test_achievement_sync.py -q`; Android export.

### Ticket 2 — Clear mobile query data on logout

- **Inconsistency:** Zustand auth clears while singleton TanStack Query data survives into the next user session.
- **Expected files:** `mobile/app/_layout.tsx` or a new `mobile/lib/queryClient.ts`, `mobile/hooks/useLogout.ts`, `mobile/api/client.ts` for terminal refresh failure; narrowly scoped tests.
- **Dependencies:** None; do not change refresh transport.
- **Acceptance criteria:** Manual logout and terminal auth refresh failure clear all query cache before login navigation; no change to successful refresh behavior.
- **Tests:** `cd mobile && npm run typecheck`; cache isolation unit/integration test; Android export.

### Ticket 3 — Gate challenge UI with existing entitlements

- **Inconsistency:** Web and backend gate challenges; mobile always displays and routes to them.
- **Expected files:** `mobile/lib/billing.ts`, `mobile/app/(tabs)/_layout.tsx`, `mobile/lib/navigation.ts`, possibly a small native entitlement guard component.
- **Dependencies:** Existing `GET /billing/entitlements/me`; no backend change.
- **Acceptance criteria:** `features.challenges=false` hides challenge navigation and blocks direct route with upgrade messaging; true enables it; server remains final authority.
- **Tests:** `cd mobile && npm run typecheck`; mocked entitlement route tests; Android export; backend entitlement unit tests.

### Ticket 4 — Make mobile study-progress mutation authoritative

- **Inconsistency:** Mobile discards `StudyProgressOut`, queues permanent failures and leaves dependent caches stale.
- **Expected files:** `mobile/types/api.ts`, new or existing helper under `mobile/lib/`, `mobile/app/study/[id].tsx`, `mobile/app/daily-review.tsx`, `mobile/lib/offlineStudy.ts` only as required for error classification.
- **Dependencies:** Ticket 2 query-client access pattern.
- **Acceptance criteria:** 200 response is typed/returned; scorecards/analytics/achievements/daily queue invalidate appropriately; only offline/retryable failures queue; 403/404/422 display error and do not queue.
- **Tests:** `cd mobile && npm run typecheck`; new mocked 200/offline/403/404/422 tests; backend SM-2 and celebration tests; Android export.

### Ticket 5 — Render mobile pricing from backend catalog

- **Inconsistency:** Mobile hard-codes prices and monthly-only presentation while backend/web use a server catalog with a default interval.
- **Expected files:** `mobile/lib/billing.ts`, `mobile/app/pricing.tsx`, `mobile/components/UpgradeSection.tsx`, mobile pricing types/tests.
- **Dependencies:** None; checkout callback policy is explicitly out of scope.
- **Acceptance criteria:** Mobile GETs `/billing/pricing`, renders available plans/monthly and annual values/default interval, handles loading/error/partial configuration, and does not hard-code dollar amounts. Existing checkout action can remain monthly until a later ticket.
- **Tests:** `cd mobile && npm run typecheck`; mocked catalog tests; backend billing pricing/entitlement unit tests; Android export.
