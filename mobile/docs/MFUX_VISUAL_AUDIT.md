# MindFlip Mobile — Premium Visual Redesign Audit

**Status:** Proposal. No code changed. Awaiting approval of visual direction.
**Scope:** `mobile/` only. UI/product design pass — no business logic touched.
**Slogan (canonical):** Study smarter, remember more.

---

## 1. Current Visual Problems

Verified by reading the actual implementation, not assumed.

### Startup — `app/_layout.tsx`
- Brand gate renders `MindFlipLogoMark` = **a rotated indigo rounded square containing the letter "M"** ([MindFlipBrand.tsx:35-64](mobile/components/brand/MindFlipBrand.tsx#L35-L64)). It is a placeholder, not a logo. The real assets (`mindflip-logo.png`, `mindflip-logo-wordmark.png`) exist and are unused on the splash.
- Splash subtitle is **"Learn. Remember. Grow."** ([_layout.tsx:223](mobile/app/_layout.tsx#L223)) — the wrong slogan.
- A bare `ActivityIndicator` is pinned to the bottom of the branded screen ([_layout.tsx:229](mobile/app/_layout.tsx#L229)) — exactly the "generic spinner" the brief rejects.
- `RootLayout` returns `null` while storage hydrates ([_layout.tsx:274-276](mobile/app/_layout.tsx#L274-L276)). Nothing is painted; the app depends entirely on the native splash still being up.
- Composition is centred logo + two text lines with no depth, no motif, no ground.

### Login — `app/(auth)/login.tsx`
- Reads as a SaaS admin form: mark, wordmark text, then a bordered `AppCard` containing Google button / "or" divider / email field / submit / checkbox.
- Tagline is **"Learn smarter. Remember longer."** ([login.tsx:174](mobile/app/(auth)/login.tsx#L174)) — a third, different slogan. Three slogans ship today.
- No benefit copy, no illustration, no visual composition. Nothing communicates what MindFlip does.

### Home — `app/(tabs)/index.tsx`
This is the weakest screen relative to its importance.
- Header is an "HOME" eyebrow + "Welcome back, Alim". Generic; no contextual learning copy.
- The Daily Review hero is `backgroundColor: colors.surface` + `borderWidth: 1` ([index.tsx:216](mobile/app/(tabs)/index.tsx#L216)) — **an off-white bordered rectangle**. It is visually indistinguishable from the list rows below it. The dominant surface of the app has zero emphasis.
- "Your study sets" are `borderBottomWidth: hairline` rows — literal database rows.
- Learning Journey / metrics **do not exist**. `summaryQuery` fetches the analytics summary and only `streak_days` is used; cards-reviewed, achievements, XP are all discarded.
- "More progress" is a muted box with two 52dp rows. Reads as a settings group.
- Total decorative treatment on the screen: none. No gradient, no illustration, no progress ring, no elevation.

### Library — `app/(tabs)/library.tsx`
- Books and sets are 82dp horizontal rows: small tinted icon square, title, meta line, chevron. This is a CRUD list.
- No cover treatment, no card-stack imagery, no topic colour, no progress.
- Filter chips are correct in structure but flat (`surface` + 1px border).
- Creation modal is a `Modal` containing raw `TextInput`s and a bordered file button ([library.tsx:198-200](mobile/app/(tabs)/library.tsx#L198-L200)) — a form dumped in a sheet, as the brief predicted.
- The entire render body is written as single-line JSX, which is why it has drifted visually.

### Study — `app/study/[id].tsx` + `components/FlashCard.tsx`
- The flashcard is `borderRadius: 24, borderWidth: 1` on `cardFront` (#ffffff light / #1e293b dark) — **a plain bordered rectangle**, exactly what the brief forbids.
- Reveal is a cross-fade of the text only; the card itself never changes state visually beyond a background swap to `cardBack`.
- Mode switching is a 4-up `TabButton` row with a 2px bottom border ("Study / Summary / Scenarios / Games") — web-tab language, not native.
- Two identical icon buttons sit in the header: `chevron-back` and `close`, both calling `router.back()` ([\[id\].tsx:314-338](mobile/app/study/[id].tsx#L314-L338)). Redundant and confusing.
- `RecallRatingBar` renders each option as a `30%`-wide bordered box showing **the raw SM-2 quality number (1/2/4/5) next to the label** ([RecallRatingBar.tsx:56](mobile/components/study/RecallRatingBar.tsx#L56)). Internal scoring leaked into the UI. Not tactile, no selected animation, no per-rating colour.
- Empty/complete states use emoji as icons (`icon="🎉"`, `icon="🎮"`, `icon="⚠️"`).

### Daily Review — `app/daily-review.tsx` (650 lines)
- Uses the themed `useScreenHeader` so it looks *different* from the Study screen, which uses a custom header row. The two halves of the core learning loop do not read as one product family.
- No supporting hierarchy copy ("Strengthen what you're close to forgetting").

### Games — `components/games/GameSelector.tsx`
- 8 games rendered as 92dp rows: identical `primarySoft` icon chip, title, badge, description, chevron. **All eight look the same.** No per-game accent, no illustration, no grid.
- This is the Settings-rows failure named in the brief.
- There is also **no game hub screen** — games are only reachable per-set.

### More — `app/(tabs)/more.tsx`
- The one genuinely designed element in the app: the upgrade card with glow orb, shadow, and gradient-ish `primaryPressed` fill.
- But it is **hardcoded `#fff`, `#ffffffbf`, `#ec489944`, `#6437d7`, `#5b21b6`** ([more.tsx:118-122](mobile/app/(tabs)/more.tsx#L118-L122)) — outside the token system.
- Everything below it collapses into unstyled `NavMenuRow` lists.
- Footer literally reads **"MindFlip mobile"** — the parity/platform language the brief bans.

### Profile / Settings / Billing / Scorecards
- **Profile** (505 lines): `PageHeader` + flat sections. No identity block, no avatar, no plan badge, everything equally weighted.
- **Settings** (675 lines): every group wrapped in its own bordered card (`styles.section`); the brief explicitly rejects this. The Appearance selector works functionally but is styled identically to the "Daily goal: 10m/20m/30m" chips — no visual weight for a top-level preference. `#fff` hardcoded on selected chips ([settings.tsx:362](mobile/app/settings.tsx#L362), [420](mobile/app/settings.tsx#L420)) — invisible-ish in some states.
- **Billing** (580 lines): no `PageHeader`; relies on the unthemed native header.
- **Scorecards** (902 lines): **20 hardcoded hex colours** — the largest token violation in the app.

### Cross-cutting
- **Emoji as UI icons** in 8 files (`⚠️ 🎮 🎉 🏆 📚 👥 📁 🎖️ 🔒`) via `EmptyState icon=`.
- **Text-glyph arrows** as controls: `→` in `flashcards.tsx:232,307`, `← Back` in `quiz-results/[id].tsx:83`, `▶ / ▼` in `book/[id].tsx:543`, `guide.tsx:102`.
- No press-scale anywhere; press feedback is `opacity: 0.65` only.
- No skeleton coverage on Games, Profile, Billing, Scorecards, Daily Review.

---

## 2. What Was Lost From The Previous UI

`MFUX-006` (c52f15e) cut Home from **1343 lines to 350**. It removed the architecture problems *and* the entire visual identity. Recovered from `git show c52f15e~1`:

| Lost element | What it was | Verdict |
|---|---|---|
| **Hero surface** | 224dp tall, `borderRadius: 28`, deep violet `#6437d7`, shadow `y:14 r:22 opacity .25` | **Recover.** This was the app's only real hero. Rebuild tokenized + gradient. |
| **Orb depth layer** | Two blurred circles — pink `#ec489944` top-right, blue `#2563eb44` bottom-left, `overflow: hidden` | **Recover.** Cheap, distinctive, no dependency. Becomes a MindFlip signature motif. |
| **Streak pill in hero** | `#ffffff20` translucent pill on the hero itself | **Recover** as a glass chip on the gradient. |
| **White-on-brand CTA** | White button, `#5b21b6` label, `fontWeight: 900` | **Recover.** Far stronger than today's flat `primary` button. |
| **Stats grid** | Multi-metric grid (streak / accuracy / cards) | **Recover** as "Learning Journey", authoritative fields only. |
| **Split-row cards** | Two-column "Recent sets" + "Recent quizzes" with per-card empty states | **Improve, don't restore verbatim** — two columns is cramped on small Android. |
| **900-weight display type** | `fontSize: 26, fontWeight: "900"` greeting | **Recover.** Current `screenTitle` (24/800) is too timid for a consumer app. |

**Why it was cut, and what we must not repeat:** every one of those styles was hardcoded hex — the hero was `#6437d7` in both themes. The redesign recovers the *composition and confidence* while expressing them through tokens so dark mode works.

---

## 3. Dark Mode Failures

Ordered by severity. All are release blockers.

**F1 — Native stack headers are not themed (worst).**
There is **no `ThemeProvider` anywhere in the app** (`grep @react-navigation/native` → zero hits). `app/_layout.tsx` declares `headerShown: true` for ~15 routes with no `headerStyle`. React Navigation therefore falls back to its light `DefaultTheme`: **white header bar, dark text, above a dark screen body.**
Affected: `pricing`, `billing`, `scorecards`, `quiz-history`, `study-groups`, `challenge-leaderboard`, `onboarding`, `book/[id]`, `games/[setId]/index`, `feedback`.
(12 screens escape this only because they individually call `useScreenHeader`.)

**F2 — Theme override never reaches native chrome.**
Theme is stored in AsyncStorage per user and applied only in JS. `useColorScheme()` still returns the *system* value. So with System=Light, App=Dark: `Alert` dialogs, `Switch` thumbs, keyboard appearance, text-selection handles and the Android navigation bar all stay light.

**F3 — The dark palette is generic slate, not a designed dark product.**
`background #0f172a`, `surface #1e293b`, `surfaceElevated #334155`, and `surfaceMuted #1e293b` — **muted and surface are the same colour**, so tonal grouping silently collapses. `#334155` as an elevated card is the "muddy gray card" the brief rejects.

**F4 — `onPrimary` is `#0f172a` in dark mode.**
Every primary button in dark mode renders dark-navy text on a `#818cf8` lavender fill. It reads washed-out, not premium.

**F5 — Hardcoded colours that ignore theme entirely.**
`scorecards.tsx` (20), `more.tsx` upgrade card (6, incl. `#fff` on a fixed violet), `settings.tsx` selected chips (`#fff`), `guide.tsx` (11), `ScenarioView` (12), `book/[id]` (8), Hangman/Bricks (6 each), `MindFlipLogoMark` (`#4f46e5` / `#ffffff`).

**F6 — `cardBack: #312e81` (indigo-900) in dark mode.**
The revealed flashcard becomes a saturated indigo block; body text contrast drops noticeably versus the question state.

**F7 — Modal backdrops.**
12 components render bare `<Modal>` with `colors.overlay`; sheets use `surfaceElevated` (`#334155`) which in dark mode is *lighter* than intended and reads as a floating gray slab.

**F8 — Tab bar** uses `surfaceElevated` (`#334155`) against `background` (`#0f172a`) — a 3-step jump; it looks detached rather than elevated.

---

## 4. Startup Failures

1. **Native splash background is system-driven only.** `values/colors.xml → splashscreen_background #ffffff`, `values-night → #0f172a`. A user whose system is Light but who chose Dark in-app gets **white native splash → dark app**. Guaranteed white flash.
2. **`AppTheme` hardcodes `android:statusBarColor #ffffff`** ([styles.xml](mobile/android/app/src/main/res/values/styles.xml)) and sets no `windowBackground` — the post-splash window can paint white before React mounts.
3. **`RootLayout` renders `null`** during storage hydration — no branded frame of our own.
4. **The splash mark is a letter "M" in a box**, not the MindFlip logo.
5. **Wrong slogan** ("Learn. Remember. Grow.").
6. **Generic `ActivityIndicator`** on the branded screen.
7. `splash-icon.png` is a byte-identical copy of `icon.png` (21,024 B) — the app icon reused as a splash mark at 144dp.

---

## 5. Missing / Hidden Product Routes

| Destination | Route exists | Reachable in UI? |
|---|---|---|
| **Pricing** | `/pricing` ✅ | **Conditionally hidden.** Absent from `MORE_NAV_SECTIONS` entirely. Only surfaces via the More upgrade card **when `subscriptionsEnabled() && plan === free`**. A paying user cannot reach it to compare or change plans. |
| **Billing & Credits** | `/billing` ✅ | Only via the same single upgrade card. Not listed under Account. |
| **Notifications** | — | **`EngagementCenter.tsx` (731 lines) is mounted nowhere.** Dead code; the notification centre is unreachable. |
| **Games hub** | — | **No hub exists.** Games are per-set only: `study/[id]` → Games tab, or a "Play games →" link that appears on a set card only when `card_count >= 4`. Section 12 of the brief has no screen to redesign — one must be created. |
| **Challenges** | `/(tabs)/challenges` ✅ | `href: null` in the tab layout, so More-only — and hidden whenever the entitlements query errors. A network blip silently deletes the feature. |
| Daily Review · Achievements · Scorecards · Leaderboard · Quiz Results · Analytics · Collections · Study Groups · Challenge Board · Profile · Settings · Feedback · User Guide | ✅ | Reachable via More. |

**Additional flag risk:** `.env.example` ships `EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED=false` while local `.env` has `true`. Any build from the example makes Pricing a dead-end reading "Subscriptions unavailable". Recommend deciding this explicitly rather than by env drift.

---

## 6. New MindFlip Visual Direction

**Concept: "Focused Depth."**

Three ideas carry the identity, used consistently and sparingly:

1. **The Violet Field** — the brand gradient (indigo → violet) appears on exactly four things: the Home hero, the primary CTA, the active learning surface, and celebration moments. Everywhere else is calm neutral. Scarcity is what makes it read as premium rather than as a purple app.
2. **Orbital depth** — soft off-canvas colour orbs behind brand surfaces (recovered from pre-MFUX Home, now tokenized). This is MindFlip's signature texture, and it works in both themes because the orbs are theme-aware translucent brand colours, not fixed hex.
3. **The Card as hero object** — MindFlip is a flashcard product. The card gets real presence: layered stack edges behind it, generous padding, a distinct answer state, and it is the largest object on its screen.

Tone: **calm canvas, confident accents.** Duolingo's tactility without its cartoon; Linear's restraint without its coldness.

### Light Palette

| Token | Value | Use |
|---|---|---|
| `background` | `#F6F5FC` | App canvas — cool lavender-tinted off-white (replaces pure `#ffffff`) |
| `surface` | `#FCFCFE` | Primary surface |
| `surfaceElevated` | `#FFFFFF` | True white + soft shadow |
| `surfaceMuted` | `#EDEBF7` | Tonal grouping (replaces borders) |
| `surfaceBrand` | `#E9E5FF` | Brand-tinted surface |
| `border` | `#E6E3F2` | Hairline, used sparingly |
| `borderStrong` | `#CFCBE4` | Inputs, focus |
| `textPrimary` | `#16142B` | 15.6:1 on background |
| `textSecondary` | `#4A4766` | 8.1:1 |
| `textMuted` | `#75718F` | 4.7:1 |
| `primary` | `#4F46E5` | Kept — existing brand indigo |
| `primaryStrong` | `#4338CA` | Pressed |
| `accentViolet` | `#7C3AED` | Gradient terminus, highlights |
| `gradientBrand` | `#4F46E5 → #7C3AED` | Hero, CTA, celebration |
| `xp` | `#B45309` text / `#FDF0D5` surface | XP |
| `streak` | `#EA580C` text / `#FFE9DC` surface | Streak |
| `success` | `#047857` / `#D9F2E6` | Genuine success |
| `danger` | `#B91C1C` / `#FCE4E4` | Destructive |
| `info` | `#0369A1` / `#DDEEFA` | Neutral info |
| `overlay` | `rgba(22,20,43,0.45)` | Modal scrim |
| `orbWarm` / `orbCool` | `rgba(236,72,153,0.22)` / `rgba(37,99,235,0.20)` | Hero depth |

### Dark Palette

Deliberately designed — deep blue-black with a violet bias, four distinct elevation steps.

| Token | Value | Use |
|---|---|---|
| `background` | `#0B0A15` | Deep slate-indigo, **not** pure black |
| `surface` | `#14131F` | Primary surface (step 1) |
| `surfaceElevated` | `#1D1B2C` | Elevated card (step 2) — distinct, not gray |
| `surfaceMuted` | `#191825` | Cool grouping (step 3) — **no longer equal to `surface`** |
| `surfaceBrand` | `#241E4B` | Brand-tinted surface |
| `border` | `#2A2839` | Hairline |
| `borderStrong` | `#3B3852` | Inputs |
| `textPrimary` | `#F3F2FA` | 16.9:1 |
| `textSecondary` | `#C4C1D8` | 10.4:1 |
| `textMuted` | `#918DAE` | 5.9:1 |
| `primary` | `#A78BFA` | Lighter violet for dark |
| `primaryStrong` | `#8B5CF6` | |
| `primarySoft` | `#2A2350` | Tinted chip fill |
| `onPrimary` | `#120F26` | Near-black on lavender **(kept dark for contrast, but shifted violet)** |
| `gradientBrand` | `#4C3AE0 → #7C3AED` | Same identity, tuned luminance |
| `xp` `streak` `success` `danger` `info` | `#FBBF24` `#FB923C` `#34D399` `#F87171` `#38BDF8` | Semantic |
| `cardFront` / `cardBack` | `#1D1B2C` / `#221F3D` | **Replaces `#312e81`** — a subtle shift, not a saturated block |
| `overlay` | `rgba(5,4,12,0.72)` | Scrim |
| `orbWarm` / `orbCool` | `rgba(236,72,153,0.16)` / `rgba(99,102,241,0.20)` | Hero depth |

### Typography Direction

Keep the platform stack (SF Pro / Roboto) — native feel, zero asset weight — but push the scale for consumer confidence:

| Style | Now | Proposed |
|---|---|---|
| `heroDisplay` | — | **34 / 40 / 800 / -0.6** (new) |
| `display` | 32/38/800 | 30 / 36 / 800 / -0.5 |
| `screenTitle` | 24/30/800 | 26 / 32 / 800 / -0.4 |
| `sectionTitle` | 18/24/700 | 19 / 24 / 700 / -0.2 |
| `metric` | 28/34/800 | 32 / 36 / 800 / -0.5 + `fontVariant: ['tabular-nums']` |
| `eyebrow` | (caption + tracking) | 11 / 14 / 800 / **+1.4 tracking, uppercase** (formalized) |
| `cardBody` | 22/32/600 ad-hoc | **21 / 30 / 500** — study card reading weight, calmer |

Optional, needs your call: one display face (e.g. Sora or Bricolage) via `expo-font` for `heroDisplay` + `MINDFLIP` only. Adds ~2 font files. **Default recommendation: system stack**, revisit after the pass.

### Surface System

Four levels, expressed tonally rather than with borders. Borders drop to hairline and appear only on inputs and dividers.

```
L0 canvas      background          (no shadow)
L1 surface     surface             (no shadow, tonal separation only)
L2 elevated    surfaceElevated     + elevation.raised
L3 floating    surfaceElevated     + elevation.floating   (sheets, modals, FAB)
Lb brand       gradientBrand + orbs + elevation.brand     (hero, CTA, celebration)
```

New `elevation.brand`: `shadowColor: primary`, `y:12 r:24 opacity: 0.28 (light) / 0.45 (dark)`, `elevation: 10` — a coloured shadow, which is most of what makes the recovered hero feel expensive.

### Iconography

- **One family: Ionicons** (already installed, already dominant). No second library.
- **Remove every emoji used as a UI icon** — `EmptyState` gains an `icon: keyof Ionicons.glyphMap` prop plus an optional `illustration` slot. 8 files updated.
- **Remove every text-glyph arrow** (`→ ← ▶ ▼`) → `Ionicons` equivalents. 5 sites.
- **Keep emoji only where semantic**: 🔥 streak. (Icon `flame` remains valid too; pick per-surface, never both in one component.)
- Sizes standardize to 18 / 22 / 26; icon chips 40 / 46 / 56 with `radii.md`.

### Motion Language

| Band | Duration | Curve | Use |
|---|---|---|---|
| Micro | 120ms | `Easing.out(quad)` | press scale 0.98, chip select, icon state |
| Standard | 220ms | `Easing.out(cubic)` | card reveal, list enter, tab change |
| Navigation | 260ms | `Easing.inOut(cubic)` | screen/sheet transitions |
| Celebration | ≤480ms | spring `damping 15 / stiffness 140` | milestone bursts only |

Rules: opacity + translateY(≤8) + scale (0.96–1.0) only. No rotation, no bounce, no looping decoration. `useReducedMotion()` collapses everything to opacity at 80ms — already used correctly in `FlashCard` and the splash gate; extend to all new motion.

**Press feedback standard:** `scale 0.98` + tonal surface shift on every interactive surface. Haptics on: rating a card, starting a session, tab switch, destructive confirm, celebration. **Not** on ordinary navigation taps.

---

## 7. Screen-by-Screen Redesign Plan

Executed as 13 vertical slices; each ends with `npx tsc --noEmit`, an Android launch, and light+dark screenshots before the next begins.

**V1 · Startup.** Native splash background made theme-safe (add `windowBackground`, remove hardcoded white `statusBarColor`, brand-tint both `values` and `values-night`). Real MindFlip mark replaces the "M" box. React gate: mark scales 0.92→1 + fades over 320ms, then `MINDFLIP` / **Study smarter, remember more.** Spinner removed — if auth is still resolving, a subtle three-dot brand pulse holds. Total ~700ms when auth is warm.

**V2 · Login.** Orbital brand composition top third (SVG card-stack motif), headline "Study smarter, remember more.", one line of benefit copy, then Google → divider → email → keep-signed-in. Card border dropped in favour of a tonal panel. OTP screen: 6 large individual code cells, countdown as a thin brand progress line, restrained success check.

**V3 · Home.** The flagship.
- Greeting: time-aware "Good morning, Alim" + "Ready to make something stick?"; compact 🔥 streak chip (only when authoritative).
- **Daily Review hero** — L-brand: gradient, two orbs, translucent streak chip, `heroDisplay` "12 cards ready", progress ring, white-on-brand "Start review" CTA. Recovered composition, tokenized.
- **Continue studying** — horizontal snap carousel of set cards with generated cover tint (hashed from set id), card-stack edge, title, source, count, progress bar when authoritative.
- **Learning journey** — 3 metric tiles (🔥 streak · cards reviewed · achievements) reading from the *existing* analytics summary that is currently fetched and thrown away. Any field the API doesn't return is omitted, never faked.
- **Challenges** — compact secondary strip.

**V4 · Library.** Books get generated cover surfaces (deterministic brand-family tint + spine + title/author typography). Sets get card-stack tiles with topic accent. Search integrates into the header. Filters become a proper segmented control. Creation becomes a designed sheet with a drop-zone-style picker, grab handle, and paired fields.

**V5 · Study.** Card gets stack edges, `radii.xl`, brand-tinted top edge, `elevation.floating`, no hard border. Question→answer = 220ms fade + 6px rise with the eyebrow morphing QUESTION→ANSWER. Redundant back/close collapsed to one close. Mode row becomes a native segmented control. **`RecallRatingBar` rewritten**: large thumb-friendly tiles, per-rating colour (Again=rose, Hard=amber, Good=indigo, Easy=emerald), press-scale, selected fill, haptic — and **the raw quality digits are removed from the UI** while the exact quality values passed to the API are unchanged.

**V6 · Daily Review.** Shares the V5 card and rating components. Header "Daily Review" + "Strengthen what you're close to forgetting." Progress ring matching the Home hero. Completion reports only true numbers.

**V7 · Games.** New **Game Hub** (`/games` — a real route, reachable from More → Learning and from Home), 2-up grid, each game with its own accent + SVG motif + difficulty + availability. Per-set selector reuses the same cards. Correct/incorrect feedback standardized; Memory Match gets the most polish.

**V8 · More.** Upgrade card retokenized (gradient + orb, no hardcoded hex). Sections become tonal grouped lists, not per-row cards. "MindFlip mobile" footer removed. **Billing & Credits and Pricing added to Account.**

**V9 · Profile.** Identity block (avatar/initial, name, email, plan badge) on a brand-tinted panel; then Learning snapshot → Preferences → Billing → Account actions, weighted differently.

**V10 · Settings.** One tonal group per section, not one card per row. Appearance selector promoted to a real segmented control with a live preview swatch. Hardcoded `#fff` removed.

**V11 · Pricing.** Made discoverable for all plan states. "Choose how you want to learn", two strong plan cards, recommended plan marked tastefully, authoritative plan names/prices only, no Stripe vocabulary. Excellent dark mode.

**V12 · Billing.** Trustworthy hierarchy: Current plan → Credit balance → Usage → Recent activity → Actions. Less gamification. Conflict states stay visually serious. **No Stripe or credit logic touched.**

**V13 · Scorecards + Celebrations.** Scorecard becomes a share-worthy branded composition (large score, metric hierarchy, period, identity). All 20 hardcoded colours removed. Celebrations: small burst + scale/fade, richer only for genuine milestones; reduced-motion honoured. Partial score / formula / formula version stay absent.

**V0 (prerequisite, lands with V1):** token rewrite, `ThemeProvider` wired for navigation chrome, `useTheme` extended, new primitives (`BrandSurface`, `Segmented`, `MetricTile`, `ProgressRing`, `StatChip`), SVG motif set, `EmptyState` de-emojified, skeletons extended.

---

## 8. Exact Files Expected To Change

**Foundation (V0)**
```
theme/tokens.ts                       rewrite — new palettes, elevation.brand, type scale
hooks/useTheme.ts                     extend — gradients, orbs, navigation theme object
app/_layout.tsx                       add ThemeProvider (fixes 10 unthemed headers) + splash
hooks/useScreenHeader.tsx             align with ThemeProvider
components/ui/AppCard.tsx             surface levels, press-scale
components/ui/AppButton.tsx           brand gradient variant, press-scale
components/ui/AppScreen.tsx           canvas + optional orb backdrop
components/ui/AppBadge · AppProgressBar · AppListRow · AppTextInput · ScreenHeader · IconButton
components/EmptyState.tsx             Ionicons + illustration slot (removes emoji API)
```
**New files**
```
components/ui/BrandSurface.tsx        gradient + orbs + coloured shadow
components/ui/Segmented.tsx           premium segmented control
components/ui/MetricTile.tsx          learning-journey tiles
components/ui/ProgressRing.tsx        SVG ring
components/ui/StatChip.tsx            streak/XP chips
components/brand/motifs/*.tsx         SVG: CardStack, BrainNode, Orbit, Trophy, Empty*
components/skeletons/{Games,Profile,Billing,Scorecards,DailyReview}Skeleton.tsx
app/games/index.tsx                   NEW Game Hub route
```
**Screens**
```
app/(tabs)/index.tsx        Home (largest change)
app/(tabs)/library.tsx      Library — also de-minified
app/(tabs)/flashcards.tsx   Study list — arrows → icons
app/(tabs)/more.tsx         More — detokenized card fixed
app/(tabs)/_layout.tsx      tab bar surfaces
app/(auth)/login.tsx · verify-email.tsx · forgot-password.tsx · register.tsx
app/study/[id].tsx · app/daily-review.tsx
app/pricing.tsx · app/billing.tsx · app/profile.tsx · app/settings.tsx · app/scorecards.tsx
app/games/[setId]/index.tsx · app/achievements.tsx · app/leaderboard.tsx
app/analytics.tsx · app/quiz-history.tsx · app/quiz-results/[id].tsx
app/folders.tsx · app/challenge-leaderboard.tsx · app/study-groups*.tsx
app/book/[id].tsx · app/guide.tsx · app/onboarding.tsx · app/(tabs)/challenges.tsx
```
**Components**
```
components/FlashCard.tsx                        premium study card
components/study/RecallRatingBar.tsx            tactile ratings, digits removed
components/study/{StudyProgressHeader,StudySessionSummary,StudySetHeader,ScenarioView,SummaryCard}.tsx
components/games/GameSelector.tsx               grid + per-game identity
components/games/{GameShell,GameResult,McqOptions,MemoryMatchGame,HangmanGame,BricksGame,…}.tsx
components/celebrations/CelebrationBurst.tsx · components/CelebrationOverlay.tsx
components/{NavMenuRow,PageHeader,UpgradeSection,UpgradeLimitModal,WeakTopicsChips}.tsx
components/billing/BuyCreditsModal.tsx · components/scorecards/ShareScorecardModal.tsx
components/library/{TagEditModal,TocEditor}.tsx · components/studyGroups/*.tsx
components/brand/{MindFlipBrand,MindFlipLogo}.tsx   real mark, no letter-box placeholder
components/guide/*.tsx                          hardcoded colours → tokens
```
**Native / config**
```
mobile/app.json                                     splash colours per theme
android/app/src/main/res/values/colors.xml          brand splash background
android/app/src/main/res/values/styles.xml          remove hardcoded white statusBarColor, add windowBackground
android/app/src/main/res/values-night/colors.xml
lib/navigation.ts                                   Pricing, Billing, Game Hub, Notifications entries
```

**Two dependency decisions I need from you:**
1. **`expo-linear-gradient`** is not installed. It is the clean way to do the brand gradient and requires a native rebuild (you already run `expo run:android`). Alternative: layered `react-native-svg` `LinearGradient` (already installed, zero new deps, slightly more code). **My recommendation: `expo-linear-gradient`.**
2. **`EngagementCenter.tsx`** (731 lines, unmounted). Wire it up as a real Notifications destination, or delete it? I will not silently remove it.

---

## 9. Business Logic That Will Remain Protected

Untouched, verified before and after each vertical:

- SM-2 scheduling, ease factors, intervals, `next_review_date`, repetitions
- Recall quality mappings — Study submits `[1,2,4,5]`, Daily Review its own set; **the values sent to `/study/progress` do not change**, only their visual presentation
- `submitStudyProgress`, `queueProgressSync`, `flushPendingProgress`, offline cache in `lib/offlineStudy.ts`
- XP, streak, achievement authority, celebration trust gating (`lib/celebrations/trustedEvents.ts`)
- Challenge scoring, leaderboard ranking, challenge entitlement gating
- All Stripe flows, checkout attempts, credit accounting, entitlement snapshots, subscription conflict states
- Auth: token refresh, native refresh-token storage, `keepSignedIn`, bootstrap state machine
- Scorecard privacy, public link lifecycle, share permissions
- Query keys and invalidation graphs (`studyInvalidation`, `quizResultInvalidation`)

Feature flags keep their current semantics. If Pricing visibility should become an explicit product rule rather than an env-var side effect, that is a product decision for you — I will not change gating behaviour unilaterally.

---

## Approval Requested

1. Visual direction — "Focused Depth" (violet field · orbital depth · card as hero)?
2. Light + dark palettes as specified?
3. System typography, or add one display face?
4. `expo-linear-gradient` (recommended) or SVG gradients?
5. Pricing visible to all plan states, incl. paid users?
6. `EngagementCenter` — wire up as Notifications, or delete?
7. Proceed vertical-by-vertical V1→V13 with screenshot review after each?
