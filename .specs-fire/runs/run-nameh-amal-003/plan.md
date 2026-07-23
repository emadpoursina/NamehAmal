---
run: run-nameh-amal-003
work_item: pomodoro-core-engine
intent: pomodoro-timer
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Pomodoro Core Engine

## Approach

Build a **pure, testable Pomodoro state machine** in `app/lib/pomodoro/` (no React/Next.js dependencies), then wrap it in a **React context provider** shared across the app. The engine manages phases (`idle` → `focus` → `short_rest` | `long_rest` → `focus` …), countdown timing, focus-session cadence toward long rest, and localStorage persistence for settings + widget visibility.

**State machine rules:**
- Defaults: focus 25m, short rest 5m, long rest 15m, long rest every 4 focus sessions.
- `start()`: from `idle` → begin `focus` countdown; from any other phase → resume countdown for current phase.
- `stop()`: cancel run → return to `idle`, stop timer, preserve settings and completed-focus count.
- `skip()`: end current phase early (same cadence as natural completion) → advance phase, stop timer, emit `onPhaseComplete`.
- No pause control.
- Settings updates apply on the **next** phase (not mid-running phase).
- Phase completion (natural or skip) emits a subscriber callback for future alert UI.
- Zero imports from session tracker, Prisma, or `active-timer-refresh-bus`.

**Timer tick:** React provider uses `setInterval` (1s) while `isRunning`, delegating tick logic to the pure engine.

## Files to Create

| File | Purpose |
|------|---------|
| `app/lib/pomodoro/types.ts` | `PomodoroPhase`, `PomodoroSettings`, `PomodoroState`, defaults |
| `app/lib/pomodoro/storage.ts` | localStorage read/write with `nameh-amal:pomodoro:*` keys |
| `app/lib/pomodoro/engine.ts` | Pure state machine: start/stop/skip/tick/updateSettings/advancePhase |
| `app/lib/pomodoro/engine.test.ts` | Unit tests for phase cycling, cadence, settings deferral |
| `app/lib/pomodoro/PomodoroProvider.tsx` | React context + interval tick + phase-complete subscribers |
| `app/lib/pomodoro/use-pomodoro.ts` | Consumer hook |

## Files to Modify

| File | Changes |
|------|---------|
| `package.json` | Add `vitest` devDependency + `test` script |
| `app/layout.tsx` | Wrap children in `<PomodoroProvider>` (enables future floating widget sync) |

## Tests

| Test File | Coverage |
|-----------|----------|
| `app/lib/pomodoro/engine.test.ts` | Defaults, focus→short rest cycle, long rest after N, start/stop/skip, settings apply next phase, no mid-phase duration change |

## Technical Details

- Durations stored in **seconds** internally; UI will display minutes.
- localStorage keys: `nameh-amal:pomodoro:settings`, `nameh-amal:pomodoro:widget-hidden`.
- `onPhaseComplete` exposed as `subscribePhaseComplete(fn)` on context (mirrors `active-timer-refresh-bus` pattern but separate).
- Vitest introduced per testing standards (first test suite in project).

---
*Plan approved and implemented.*

---

## Work Item: pomodoro-page

---
run: run-nameh-amal-003
work_item: pomodoro-page
intent: pomodoro-timer
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Pomodoro Page

## Approach

Add a dedicated `/pomodoro` route with a client-side timer UI and settings form, both wired to the existing `usePomodoro()` hook. Follow existing page patterns (header + bordered card sections) and settings form styling from `WeeklyTargetsCard`.

**Timer display:**
- Show current phase label (`Idle`, `Focus`, `Short rest`, `Long rest`)
- Large `MM:SS` countdown from `state.remainingSeconds`
- Show completed focus sessions / long-rest interval for context
- Start / Stop / Skip buttons (Stop disabled when idle; Start disabled when already running)

**Settings form (page only, not `/settings`):**
- Inputs for focus, short rest, long rest (minutes) and long-rest interval N (sessions)
- On submit, call `updateSettings()` converting minutes → seconds
- Defaults pre-filled from engine settings

**Navigation:**
- Add "Pomodoro" link in `app/layout.tsx` nav between Dashboard and Settings

## Files to Create

| File | Purpose |
|------|---------|
| `app/pomodoro/page.tsx` | Server page shell with title/description |
| `app/pomodoro/PomodoroView.tsx` | Client component: timer display + controls + settings form |
| `app/lib/pomodoro/format.ts` | `formatPomodoroCountdown(seconds)` → `MM:SS` |
| `app/lib/pomodoro/format.test.ts` | Unit test for countdown formatting |

## Files to Modify

| File | Changes |
|------|---------|
| `app/layout.tsx` | Add nav link to `/pomodoro` |

## Tests

| Test File | Coverage |
|-----------|----------|
| `app/lib/pomodoro/format.test.ts` | Countdown formatting edge cases |

---
*Plan pending approval at checkpoint.*
