# Audit Fixes — June 2026

Full audit and implementation of 8 product issues across Web and Mobile.

## 1. Keep Me Signed In

**Root cause:** No UI or API flag; web always issued 30-day refresh cookies; mobile always persisted auth to AsyncStorage.

**Changes:**
- `services/api/schemas/auth.py` — `remember_me` on login/OAuth requests
- `services/api/routers/auth.py` — cookie `max_age` tied to `remember_me` (30d vs 12h session)
- `services/api/config.py` — `SESSION_REFRESH_EXPIRE_HOURS`
- `src/pages/Login.jsx` — checkbox
- `src/api/client.js` — localStorage vs sessionStorage by preference
- `src/lib/AuthContext.jsx` — passes `remember_me`; skips refresh when unchecked
- `mobile/app/(auth)/login.tsx` — checkbox
- `mobile/store/authStore.ts` — conditional persist via `keepSignedIn`

## 2. Games / Tug of War — Continue Button

**Root cause:** Web `handleGameComplete` blocked navigation on failed API POST; Tug of War called `onRoundComplete` twice; mobile required Alert second tap.

**Changes:**
- `src/components/games/TugOfWarGame.jsx` — Continue-only completion callback
- `src/pages/StudySession.jsx` — try/catch/finally always returns to game menu
- `src/lib/analytics.js` — `trackClientEvent` → `POST /study/events`
- `services/api/routers/study.py` — `POST /study/events` endpoint
- `mobile/app/games/[setId]/[slug].tsx` — direct navigation + quiz save + event log

## 3. Collections — Multiple File Selection

**Root cause:** Web collections already used checkboxes; Study Groups used single Select; mobile collections lacked item management.

**Changes:**
- `src/components/folders/FolderDetailDialog.jsx` — select all / deselect all + count
- `src/pages/StudyGroups.jsx` — multi-book checkboxes on create
- `services/api/routers/study_groups.py` — `book_ids[]` on create
- Mobile collections: `mobile/app/folders.tsx` — manage items modal with checkboxes, select all, count

## 4. Study Theme Not Applying

**Root cause:** Theme saved in profile JSONB but flashcards used hardcoded colors.

**Changes:**
- `src/lib/studyTheme.js` — shared theme tokens
- `src/components/study/FlashCard.jsx` — `themeId` prop
- `src/pages/StudySession.jsx`, `DailyReview.jsx` — pass user theme
- `mobile/lib/studyTheme.ts` — mobile color map
- `mobile/components/FlashCard.tsx` — applies user study theme

## 5. Learning Preferences

**Root cause:** `learning_pace` stored but never consumed by backend.

**Changes:**
- `services/api/services/learning_pace.py` — pace multipliers
- `services/api/routers/study.py` — adjusts due-card limits and review intervals
- `src/pages/Settings.jsx` — updated descriptions
- `mobile/app/settings.tsx` — learning pace UI + descriptions
- `services/api/tests/unit/test_learning_pace.py`

## 6. Book Deletion Cascade

**Root cause:** User `DELETE /books/{id}` only deleted the book row; `flashcard_sets.book_id` uses `ON DELETE SET NULL`, so sets survived. Older deletes may have already orphaned sets (`book_id = null`).

**Changes:**
- `services/api/services/book_deletion.py` — robust cascade (linked sets, AI job `resource_id`, job markers, title match)
- `services/api/routers/books.py`, `admin.py` — use shared cascade helper
- `src/pages/BookDetail.jsx` — invalidate `flashcard-sets` + `books` queries after delete

**If sets remain from a prior delete:** delete them manually from **My Flashcards** (orphaned). **Restart the API** so new cascade code is active.

## 7. Flashcard Self-Rating UX

**Root cause:** Optional behavior with mandatory-looking UI; API call blocked UI update.

**Decision:** Daily Review = required; Study Cards = optional with "Skip for now".

**Changes:**
- `src/components/study/SpacedRepetitionBar.jsx` — optimistic highlight, optional/required modes
- `src/pages/StudySession.jsx` — optimistic map update + skip button
- `src/pages/DailyReview.jsx` — required rating; next disabled until rated
- `mobile/app/daily-review.tsx` — required flow + instant button highlight
- `mobile/app/study/[id].tsx` — optimistic rating (non-blocking API)

## 8. Mobile Feature Parity

**Root cause:** Study Groups and Challenge Board routes/nav missing on mobile.

**Changes:**
- `mobile/lib/navigation.ts` — nav entries
- `mobile/app/_layout.tsx` — stack screens
- `mobile/app/study-groups.tsx` — list, join, create
- `mobile/app/study-groups/[id].tsx` — group detail
- `mobile/app/challenge-leaderboard.tsx` — overall/content/badges tabs

## Test plan

```bash
cd services/api && pytest tests/unit/test_learning_pace.py -q
```

Manual QA:
- [ ] Login with/without Keep Me Signed In (web + mobile)
- [ ] Complete Tug of War → Continue returns to game menu
- [ ] Collections: select multiple items; Study Groups: multi-book create
- [ ] Change study theme → flashcard headers update
- [ ] Change learning pace → daily review queue size behavior shifts
- [ ] Delete book → flashcard sets removed
- [ ] Daily review requires rating; study cards allow skip
- [ ] Mobile: Study Groups + Challenge Board in More menu
