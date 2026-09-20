# Phase 1 Data Model: macOS Menu Bar Pomodoro

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20

**No database changes.** The Prisma schema, `ActiveTimer` draft, finalized `Session`, and
`Category` entities are untouched; the menu bar consumes them read/write through the existing
`/api/tracker` route handler. This document describes the **runtime state model** owned by the
Electron main process for the desktop build. Existing Prisma entities are listed only where the
feature reads them.

---

## 1. `PomodoroState` (existing type — authority moves to main process)

Source: `app/lib/pomodoro/types.ts`. Reused verbatim by the main process (`pomodoro-host.ts`).

| Field | Type | Rules |
|---|---|---|
| `phase` | `"idle" \| "focus" \| "short_rest" \| "long_rest"` | Discriminates countdown phase; menu bar runs only when `phase !== "idle"` **and** `isRunning` |
| `remainingSeconds` | positive integer | `1..phaseDurationSeconds`; `0` transiently at zero-crossing |
| `phaseEndsAtMs` | `number \| null` | Wall-clock epoch ms when the phase ends; `null` ⇔ not running. Drives relaunch re-hydration (wall-clock based, timezone-independent) |
| `isRunning` | `boolean` | Countdown active. Reminder predicate uses this directly (D4/D8) |
| `completedFocusSessions` | non-negative integer | Cadence counter for long-rest interval |
| `settings` | `PomodoroSettings` | see below |

**State transitions** (existing `engine.ts` semantics, unchanged):

```
idle ──start()──▶ focus (running) ──tick to 0──▶ short_rest|long_rest (paused, isRunning=false)
                                                        │
                          start() ──────────────────────┘ (resume: re-arms remaining)
any non-idle ──stop()──▶ idle (isRunning=false, remaining=focusSeconds)
non-idle ──skip()──▶ next phase (isRunning=false)
```

- **No pause state exists** (D4). "Running" ⇔ `isRunning === true`; everything else counts as
  idle for the reminder cycle (FR-010, clarified).
- Menu-bar Start on a non-idle non-running state = **Resume** (engine `start()` re-arms
  remaining seconds).

## 2. `PomodoroSettings` (existing type)

| Field | Type | Validation (existing `parsePomodoroSettings`) |
|---|---|---|
| `focusSeconds` | positive int | fallback to default `1500` |
| `shortRestSeconds` | positive int | fallback `300` |
| `longRestSeconds` | positive int | fallback `900` |
| `longRestInterval` | positive int | fallback `4` |
| `notifyOnPhaseComplete` | boolean | fallback `false` (in-app feature, untouched) |

Settings changes may arrive from the renderer (IPC) or — in the future — the tray; applied via
existing `updateSettings` (takes effect next phase while idle; merged while running).

## 3. `SelectedActivityRef` (NEW, desktop runtime, persisted)

The app's "currently selected activity", as last reported by the renderer. Feeds menu-bar Start
(D3). Not a DB entity.

| Field | Type | Rules |
|---|---|---|
| `categoryId` | non-empty string | Must reference an existing `Category` at use time; server rejects unknown ids (404) → menu bar degrades to countdown-only |
| `title` | `string \| null` | Optional activity title; used for the menu-bar label fallback ordering (D2) |
| `reportedAt` | epoch ms | Freshness/diagnostic only |

- Renderer reports on every tracker selection change (`desktop:report-selected-activity`).
- Persisted in `pomodoro.json` so menu-bar Start works with the window closed.
- Corrupt/missing → `null` → menu-bar start skips the tracker (fallback label shown).

## 4. `DesktopRuntimeState` (NEW, persisted as `userData/pomodoro.json`, version 1)

| Field | Type | Rules |
|---|---|---|
| `version` | `1` | Schema version; unknown version → treat file as corrupt, use defaults |
| `run` | `PomodoroRunSnapshot` | `Pick<PomodoroState, "phase" \| "remainingSeconds" \| "isRunning" \| "completedFocusSessions" \| "phaseEndsAtMs">`; validated by existing `parsePomodoroRun` |
| `settings` | `PomodoroSettings` | validated by existing `parsePomodoroSettings` |
| `selectedActivity` | `SelectedActivityRef \| null` | validated: `categoryId` non-empty string, `title` string or null |
| `reminderEnabled` | boolean | default `true` (FR-014 default on) |

**Persistence rules**: written on every state change, debounced to ≤1 Hz for run snapshots;
read at main-process startup; any read/parse failure → defaults (never crashes the app).
**No secret or session data lives here** — sessions remain solely in SQLite.

## 5. `MenuBarDisplayState` (NEW, derived — never persisted)

Computed by a pure function from `PomodoroState` + active tracker activity name:

| Derived | Values | Source FR |
|---|---|---|
| `mode` | `"idle" \| "running"` | `isRunning && phase !== "idle"` → running; else idle |
| `icon` | idle glyph (`×`) vs running glyph | FR-007 / FR-005 |
| `title` | `""` when idle; `"{MM:SS} {activityName}"` when running | FR-005, FR-006, FR-007 |
| `activityName` | draft `title` → `category.name` → `"—"` fallback; truncated to 24 chars + `…` | FR-006, spec edge cases |
| `menuModel` | enabled/disabled flags per item | contracts/tray.md |

Update cadence: recomputed on every engine tick; applied to the Tray only when the formatted
title string or mode changes (repaint gating, D9).

## 6. `ReminderCycle` (NEW, runtime only — explicitly not persisted per spec Key Entities)

| Aspect | Rule |
|---|---|
| Interval | `setInterval(5 * 60_000)` in main process |
| Tick decision | pure `shouldRemind({ reminderEnabled, isPomodoroRunning })` → remind iff `reminderEnabled && !isPomodoroRunning` (paused/absent ⇒ idle, D4) |
| Reset | starting any pomodoro clears + restarts the interval so the next reminder lands exactly 5 idle minutes after the new idle onset (FR-011) |
| Delivery | `Notification` banner (non-blocking, dismissible); guarded by `Notification.isSupported()`; blocked/unsupported → silent no-op (spec edge case) |
| Repeat | interval fires every 5 min while idle; never stacks notifications (single instance shown per tick) |

## 7. Existing Prisma entities (read-only references)

- **`ActiveTimer`** (draft): the in-progress tracker session — its `title` / `category.name`
  supply the menu-bar activity name (D2); created by menu-bar Start via `POST /api/tracker`
  (omitting `timeZone` → server default timezone per Constitution III); finalized to a
  `Session` only on stop (FR-013).
- **`Session`** (`kind: TIMER`): produced by the existing finalize-on-stop transaction. Window
  close never touches it.
- **`Category`**: referenced by `SelectedActivityRef.categoryId`.

**Validation rules summary** (from spec requirements):
- `MM:SS` format via existing `formatPomodoroCountdown`; ticks every second (FR-005).
- Activity name display-only: never selectable from the tray (FR-006, clarified).
- Idle display: `×` icon, empty title (FR-007).
- Bound-session stop = finalize into `Session`, delete draft (existing transaction; FR-013).
- Reminder default on; off ⇒ zero notifications (FR-014, SC-005).
