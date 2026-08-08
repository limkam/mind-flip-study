# MindFlip Mobile Design System (MFUX-002)

This document specifies the design system foundation, token architecture, and UI primitives for the MindFlip mobile application.

---

## 1. Philosophy

The MindFlip mobile design language is **Focused + Intelligent + Encouraging + Modern + Native + Rewarding**.

Core design tenets:
- **Learning First:** The primary screen always presents the immediate next learning action within one tap.
- **Semantic Tokens:** Components consume semantic design tokens (`TOKENS`) instead of arbitrary hardcoded visual constants or hex colors.
- **Native Before Novel:** Standard iOS and Android interaction patterns are preferred over unexpected custom controls.
- **Touchability:** Interactive controls satisfy the minimum **44x44dp** touch target area.
- **Calm Defaults, Strong Moments:** Routine screens remain calm and readable; major learning achievements receive rich visual expression.

---

## 2. Token Architecture (`mobile/theme/tokens.ts`)

Centralized tokens are imported from `mobile/theme/tokens.ts` or via `const { colors, tokens } = useTheme()`.

### Semantic Color Scale
- **Brand:**
  - `primary`: `#4f46e5` (Indigo 600)
  - `primaryMuted`: `#818cf8` (Indigo 400)
  - `primaryPressed`: `#4338ca` (Indigo 700)
  - `primarySoft`: `#e0e7ff` (Indigo 100)
  - `accent`: `#ec4899` (Pink 500)
- **Surfaces & Backgrounds:**
  - `background`: `#ffffff` (Light) / `#0f172a` (Dark Slate 900)
  - `surface`: `#f8fafc` (Light) / `#1e293b` (Dark Slate 800)
  - `surfaceElevated`: `#ffffff` (Light) / `#334155` (Dark Slate 700)
  - `surfaceMuted`: `#f1f5f9` (Light) / `#1e293b` (Dark Slate 800)
- **Typography & Borders:**
  - `textPrimary`: `#0f172a` (Light) / `#f1f5f9` (Dark)
  - `textSecondary`: `#334155` (Light) / `#cbd5e1` (Dark)
  - `textMuted`: `#64748b` (Light) / `#94a3b8` (Dark)
  - `border`: `#e2e8f0` (Light) / `#334155` (Dark)
  - `borderStrong`: `#cbd5e1` (Light) / `#475569` (Dark)
- **Semantics & Gamification:**
  - `success`: `#047857` (Light) / `#34d399` (Dark)
  - `warning`: `#b45309` (Light) / `#fbbf24` (Dark)
  - `danger`: `#b91c1c` (Light) / `#f87171` (Dark)
  - `info`: `#0284c7` (Light) / `#38bdf8` (Dark)
  - `xp`: `#d97706` (Light) / `#fbbf24` (Dark)
  - `streak`: `#ea580c` (Light) / `#f97316` (Dark)

### Typography Roles
- `display` (32px / 38px / 800)
- `screenTitle` (24px / 30px / 800)
- `sectionTitle` (18px / 24px / 700)
- `cardTitle` (16px / 22px / 700)
- `body` (15px / 22px / 400)
- `bodyEmphasis` (15px / 22px / 600)
- `secondaryBody` (14px / 20px / 400)
- `label` (13px / 18px / 600)
- `caption` (12px / 16px / 500)
- `buttonLabel` (15px / 20px / 700)
- `metric` (28px / 34px / 800)
- `metricLabel` (12px / 16px / 600)

### Spacing & Radii Scale
- **Spacing:** `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `xxl: 32`, `xxxl: 40`
- **Radii:** `xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 24`, `pill: 9999`

---

## 3. Shared Component Primitives (`mobile/components/ui/`)

| Component | Responsibility | Primary Variants | Min Touch Target |
| :--- | :--- | :--- | :---: |
| `AppScreen` | Screen wrapper handling Safe Area, theme background, keyboard avoidance & scroll options. | `scrollable`, `keyboard`, `edges` | N/A |
| `ScreenHeader` | Top navigation header with title, subtitle, back action, and right actions. | Standard, Custom Back | 44dp |
| `AppButton` | Standardized button primitive with built-in haptics & loading state. | `primary`, `secondary`, `ghost`, `destructive` | 44dp (sm: 44, md: 48, lg: 52) |
| `IconButton` | Icon action button requiring mandatory `accessibilityLabel`. | `ghost`, `filled`, `outlined` | 44dp |
| `AppCard` | Surface container providing border radius, elevation, and pressed feedback. | `standard`, `elevated`, `interactive`, `outlined` | 44dp (interactive) |
| `AppListRow` | Native list row with leading icon, title, subtitle, trailing content, and chevron. | Standard, Active | 52dp |
| `AppTextInput` | Input primitive supporting labels, focus state, error states, and secure entry toggle. | Standard, Password | 48dp |
| `AppBadge` | Lightweight chip/badge primitive for XP, streaks, status, difficulty, tags & filters. | `primary`, `secondary`, `success`, `warning`, `danger`, `xp`, `streak`, `outline` | N/A |
| `AppProgressBar` | Accessible progress bar with `accessibilityValue` and customizable fill color. | Linear | N/A |
| `EmptyState` | Standardized empty state screen with title, message, and action button. | Standard | 44dp |
| `ErrorState` | Recoverable error presentation with retry button and user-friendly error copy. | Standard | 44dp |
| `OfflineBanner` | Visual banner communicating offline mode or sync status. | Standard | N/A |

---

## 4. Interaction, Motion & Haptic Policy

Haptics must be intentional and aligned with interaction meaning. Do not scatter direct Expo Haptics calls outside `mobile/lib/haptics.ts`.

- **Routine navigation / List-row press:** No haptic by default.
- **Deliberate selection / Toggle:** `hapticImpact("light")` where useful.
- **Flashcard rating / Important learning interaction:** `hapticImpact("light")`.
- **Successful meaningful completion:** `hapticSuccess()`.
- **Destructive confirmation:** `hapticWarning()`.
- **Genuine user-facing failure:** `hapticError()`.
- **Major achievement / Streak / XP celebration:** Defined in downstream celebration system.

---

## 5. Modal vs Sheet Guidelines

- **Bottom Sheet:** Appropriate for contextual actions, filter selection, quick set creation, tag editing, and item details.
- **Center Modal / Dialog:** Reserved exclusively for destructive confirmation dialogs (e.g. deleting a set) or blocking system warnings.
- **Fullscreen Flow:** Reserved for multi-step flows, interactive games, and daily review study sessions.

---

## 6. Backward Compatibility & Device QA Verification

No regressions were identified through source inspection, TypeScript validation, Android/iOS Expo exports, and representative shared-component migration.

The foundation requires physical runtime/device QA verification during later MFUX phases for:
- Extreme font scaling / Dynamic Type rendering.
- Physical iOS Dynamic Island/notch and Android status-bar safe areas.
- Small-screen keyboard avoidance behavior.
- Semantic color contrast combinations across non-standard displays.
- Tactile/haptic quality across diverse Android vibrator hardware.
- Motion/reduced-motion accessibility preferences.
- Wrapper behavior on screens not yet visually redesigned.

---

## 7. Anti-Patterns & Critical Rules

> **CRITICAL RULE:** New mobile components MUST NOT introduce raw brand/surface hex values (e.g., `#6366f1`, `#4f46e5`, `#111827`) when an appropriate semantic token exists in `useTheme()` or `TOKENS`.

---

## 8. Focused Study Conventions

- The flashcard is the primary surface; administrative metadata stays secondary.
- Question and answer content uses a flexible, bounded reading surface with internal scrolling only for long content.
- Reveal is always an explicit 44dp-or-larger action. Tapping or swiping is never the only way to continue.
- Recall preserves each workflow's established choices: Study uses `1, 2, 4, 5`; Daily Review uses `2, 3, 5`. The scheduler's wider accepted range does not by itself authorize exposing new choices.
- Rating components emit a quality value only. Scheduling, persistence, XP, and achievement authority remain outside visual components.
- Offline copy distinguishes confirmed server progress from locally queued progress.
- Card-content direction may be RTL independently of the surrounding navigation direction.
- Study motion uses fast opacity transitions and becomes immediate when reduced motion is enabled.
- `onPrimary` is the semantic foreground token for content placed on a primary-colored surface.
