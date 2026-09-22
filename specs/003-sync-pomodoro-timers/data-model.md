# Data Model: Sync Pomodoro Timers

**Feature**: specs/003-sync-pomodoro-timers/spec.md | **Branch**: `003-sync-pomodoro-timers` | **Date**: 2026-09-22

No database schema changes. This feature unifies ownership and view behavior around the
existing pomodoro data. Entities below are the authoritative definitions for this feature;
unchanged entities are marked as such.

## 1. Shared Pomodoro Clock (existing, ownership unchanged)

One instance per running app. In desktop mode it lives in the Electron main process
(`PomodoroHost`); in web mode it lives in the page (`PomodoroProvider` + localStorage).

Fields (existing `PomodoroState`, `app/lib/pomodoro/types.ts`):

| Field | Type | Validation / Rules |
|---|---|---|
| `phase` | `"idle" \| "focus" \| "short_rest" \| "long_rest"` | must be one of the union; corrupt persisted value → idle fallback (FR-010) |
| `remainingSeconds` | positive int | recomputed from `phaseEndsAtMs − now` on every tick/hydration (FR-008) |
| `phaseEndsAtMs` | `number \| null` | `null` when not running; wall-clock target — never trust client-relative counters (FR-008) |
| `isRunning` | boolean | `start` while running is a no-op → exactly one active clock (FR-003) |
| `completedFocusSessions` | non-negative int | drives long-rest cadence (`% longRestInterval === 0`) |
| `settings` | `PomodoroSettings` | embedded copy; changed mid-countdown applies next phase (FR-007) |

### State transitions (single shared semantics, both surfaces)

- `idle → focus` on Start (any surface; duration = current settings, FR-002/US2-1).
- `running → paused` is expressed as phase + recomputed remaining time (pause = Stop→idle or
  phase end; the engine's Start on a non-idle paused phase resumes with the *original
  remaining seconds*, preserving the originally displayed end).
- Phase completion `focus → short_rest|long_rest`, rest → `focus` (cadence reset after
  long rest); advances while the window is closed (FR-011, host keeps ticking).
- Stop (any surface) → `idle` with settings-based remaining (FR-002 scenario 2/3).

## 2. Pomodoro Settings (existing, unchanged shape)

`PomodoroSettings { focusSeconds, shortRestSeconds, longRestSeconds, longRestInterval,
notifyOnPhaseComplete }` with `DEFAULT_POMODORO_SETTINGS`. All values positive ints
(`readPositiveInt` fallback to defaults). Persisted per mode:

- Desktop: `userData/pomodoro.json` → `settings` field, schema `version: 1`
  (`DESKTOP_STATE_VERSION`), written by `DebouncedWriter` (≤1 Hz).
- Web: `localStorage["nameh-amal:pomodoro:settings"]`.

**Invariants (FR-004)**:
- INV-1: The desktop store and the web store are never read, written, or merged by the other
  mode. Desktop renderer path performs zero `localStorage` access; web path never touches
  `pomodoro.json`.
- INV-2: Both desktop surfaces (menu bar, in-app page) always read settings from the same
  host state — a settings change in either surface mutates the host state, not a copy.

## 3. Persisted Clock/Settings Store (existing, unchanged shape)

`DesktopRuntimeState` (`electron/desktop-state.ts`): `{ version: 1, run, settings,
selectedActivity, reminderEnabled }`. Corrupt/missing/mismatched-version document →
`createDefaultDesktopState()` (idle + defaults, FR-010). Web equivalent: the two localStorage
keys with `parsePomodoroRun`/`parsePomodoroSettings` fallbacks.

## 4. NEW — Host Connection State (renderer-side, not persisted)

Derived, in-memory only; added to `PomodoroContextValue` as `connection`:

| Value | Meaning | View behavior |
|---|---|---|
| `"local"` | No desktop API — plain-browser mode (US3) | existing standalone engine UI, unchanged |
| `"waiting"` | Desktop API present; no host snapshot yet (`get-state` → `null`/pending/failure) | idle placeholder card ("Waiting for desktop host…"), controls disabled, **no local engine, no localStorage** |
| `"connected"` | Desktop API present; at least one host snapshot received | normal view driven purely by host pushes/IPC results |

Transitions: `local` is fixed per mount (preload presence is decided before page scripts run).
Desktop mount starts at `waiting` and moves to `connected` on the first valid snapshot —
whether from the mount-time fetch, the `pomodoro:state-changed` subscription, or the
`did-finish-load` push (any of which is the "refresh/revisit" convergence point, FR-002).
`waiting` is never left by a timeout fallback.

## 5. NEW (renderer field) — Shared Activity Label (FR-012)

`PomodoroContextValue.activityName: string | null` — the resolved label from the host
snapshot's `selectedActivity` path (host resolves draft title → category name → `"—"`, and
keeps polling `GET /api/tracker` while running). Rendered next to the in-app countdown when
`connection === "connected"`; `null`/`"—"` renders the neutral fallback identical to the
tray's. No new persistence; the tray's existing resolved-label path is unchanged.

## 6. Relationship to the tracker domain (unchanged)

`ActiveTimer` drafts and finalized `Session` rows are untouched: menu-bar starts bind a draft
(`bindTracker: true`, tray-only), menu-bar stop finalizes only the bound draft, and in-app
tracker drafts are managed by the existing UI. The pomodoro clock never writes to the
database directly.
