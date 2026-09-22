# Quickstart: Sync Pomodoro Timers — Validation Guide

**Feature**: specs/003-sync-pomodoro-timers/spec.md | **Branch**: `003-sync-pomodoro-timers`

Automated: `npm test` (Vitest unit suites incl. the new connection-state and store-isolation
tests) and `npm run lint`. The scenarios below validate the end-to-end behavior manually.

## Prerequisites

- Desktop (macOS): `npm run desktop:dev` — see `docs/desktop-macos.md`. Wait for the tray
  item to appear.
- Web: `npm run dev` (webpack, port 3060) → open `http://localhost:3060/pomodoro`.
- Reference: `contracts/host-sync.md` (snapshot/control semantics),
  `data-model.md` (connection states), spec.md (acceptance scenarios).

## Scenario 1 — One shared clock (US1 / SC-001, SC-002)

1. Desktop app running, main window open on `/pomodoro`.
2. Start a pomodoro from the **tray menu** → the in-app page shows the same phase, the same
   remaining time, and the activity label of the running session (live; after a window
   refresh at worst).
3. Stop it **from the in-app page** → the tray title reverts to idle immediately.
4. Start from the in-app page, then **Stop** from the tray → the page converges (immediately;
   on refresh at worst).
5. At no point do the tray and the page show different remaining times (SC-002).

## Scenario 2 — Start pressed while the shared clock runs (US1-5 / FR-003)

1. Start a pomodoro from the tray. Immediately press **Start** on the (disabled while
   running, but verify semantics via) the page → no second countdown; both surfaces show the
   identical clock.

## Scenario 3 — Page waits for the desktop host (US1 / FR-009)

1. Quit the desktop app and relaunch; open the window while the host is still initializing.
2. The page shows the neutral "waiting for desktop host" placeholder — not a fabricated
   25:00 idle clock and not default durations.
3. Once the host snapshot arrives, the page shows the host's persisted settings and idle
   state. Reload the page mid-session (`Cmd+R`) → after load it re-syncs to the host state
   (eventual sync, FR-002).

## Scenario 4 — Shared settings (US2 / SC-003, SC-005)

1. Change Focus to 50 min in the in-app settings while idle → start from the tray: the tray
   counts down 50 minutes (SC-003).
2. While a focus phase is running, change Focus back to 25 → the current countdown runs to
   its original end; the next phase/session uses 25 (SC-005).
3. Quit and relaunch the app → both surfaces use the persisted settings (SC-004).

## Scenario 5 — Stores never merge (US3-3 / FR-004)

1. In a plain browser (`localhost:3060/pomodoro`), change Focus to 45 and run a timer.
2. Launch the desktop app → the menu bar and in-app page use the desktop store (defaults or
   desktop-persisted values), **not** the browser's 45/running state.
3. Reload the browser page → the browser's own state is intact (independent stores).

## Scenario 6 — Web-only consistency (US3 / SC-006)

1. In a plain browser, start a pomodoro, then reload the page → the countdown resumes from
   persisted state (wall-clock correct, FR-008), settings unchanged, no desktop host
   involved.
2. (Edge) Sleep the machine mid-countdown and wake → remaining time recomputed truthfully
   on the next tick/revisit.

## Scenario 7 — Resilience (FR-010, FR-011)

1. Corrupt the desktop store (`pomodoro.json` in the app's `userData` dir), relaunch → idle
   pomodoro with valid default settings; no crash.
2. Start a pomodoro from the tray, close the window (menu-bar-only mode) → the phase still
   completes and advances (tray shows the break); reopening the window shows the same phase
   and countdown.
