# Quickstart: macOS Menu Bar Pomodoro — Validation Guide

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20

Runnable scenarios proving the feature end-to-end. Implementation details live in
`tasks.md`; state shapes in `data-model.md`; menus in `contracts/tray.md`; IPC in
`contracts/ipc.md`.

---

## Prerequisites

- macOS host (all tray scenarios are darwin-only; non-macOS behavior is unchanged).
- Dependencies installed: `bun install` (or `npm install`).
- Desktop runtime prepared once: `npm run desktop:prepare`.

## Run commands

| Purpose | Command |
|---|---|
| Desktop dev (Electron shell + Next dev server, webpack mode) | `npm run desktop:dev` |
| Unit tests (all suites incl. new `tests/electron/*`) | `npm test` |
| Lint | `npm run lint` |
| Packaged desktop build | `npm run desktop:dist` |

Expected on `desktop:dev`: the Next server boots on the desktop port, the main window opens,
**and a tray item appears in the macOS menu bar**.

## Scenario 1 — Menu bar presence & persistence (US1, P1)

1. Launch via `npm run desktop:dev`.
   ✅ Tray item visible; Dock icon visible (window open).
2. Close the main window (red button / Cmd+W).
   ✅ App does NOT quit; Dock icon disappears; tray item remains; timer keeps counting if one
   was running (see Scenario 2 with an active timer).
3. Tray → **Open App**.
   ✅ Window reopens, same page state, no reload flash; Dock icon returns.
4. Tray → **Quit App**.
   ✅ Process exits; tray item and Dock icon gone; embedded server process stopped
   (`ps aux | grep next` shows no leftover).

## Scenario 2 — Live timer status (US2, P2)

1. Idle app: tray shows the `×` icon, **no** countdown text. (FR-007)
2. In the app window, start the pomodoro.
   ✅ Tray title becomes `MM:SS` ticking **every second** plus the activity being recorded —
   an active tracker draft's title, else its category name, else `—`; truncated at 24 chars.
3. With the window closed, keep watching the tray for ≥1 minute.
   ✅ Countdown continues ticking while menu-bar-only (FR-012).
4. Stop the timer (tray → Stop, or in-app Stop).
   ✅ Tray reverts to `×` icon, empty title. If the timer was started from the menu bar, the
   bound tracker draft is finalized: the new `Session` appears in the app's dashboard list.
5. In-app display and tray always match (compare during a run): same phase/remaining
   (FR-009 / SC-003).

## Scenario 3 — Controls from the menu bar (US3, P3)

1. With the window closed, tray → **Start Pomodoro**.
   ✅ Countdown starts (tray ticks); if an activity was previously selected in the app, a
   tracker draft for that activity starts (visible by the activity name in the tray; verify in
   DB/dashboard after finalize). No picker/submenu ever appears (FR-006).
2. Tray → **Stop** → **Start/Resume** cycle.
   ✅ State transitions behave per `contracts/tray.md`; after stop→start from idle, a fresh
   focus phase begins.
3. Open the app window mid-run.
   ✅ In-app pomodoro view shows the same running phase/remaining as the tray (single
   authority over IPC).
4. From the menu bar alone (window closed the whole time): Start → wait → Stop.
   ✅ `SC-002`: full control without opening the app; the finalized session shows in the
   dashboard when reopened.

## Scenario 4 — Idle reminders (US4, P4)

1. App running, reminder toggle **on** (default), no timer running; wait 5 minutes.
   ✅ A macOS notification **banner** appears ("start a pomodoro…"), dismissible,
   non-blocking — never a modal dialog (clarified).
2. Do nothing; wait another 5 minutes.
   ✅ A new reminder appears (repeats every 5 min while idle; never stacked).
3. Start a pomodoro (menu bar or app).
   ✅ No reminders while running (SC-005); cycle re-arms on the next idle onset.
4. Tray → uncheck **Remind me to start a pomodoro**; go idle ≥5 min.
   ✅ Zero reminders (FR-014 / SC-005). Quit + relaunch ⇒ toggle stays off (persisted in
   `userData/pomodoro.json`).
5. Relaunch after a running timer was quit mid-flight.
   ✅ The abandoned draft is not finalized silently; countdown re-hydrates from the persisted
   `phaseEndsAtMs` (finished phases advance/complete per engine hydration rules).

## Automated checks

```bash
npm test        # must pass: existing suites + new pomodoro-host / reminder-cycle /
                # tray label & menu model / desktop-state parsing tests
npm run lint    # eslint clean
```

New pure-logic coverage (per Constitution IV): reminder decision matrix
(enabled/disabled × running/idle), tray title formatting + truncation + fallback,
persisted-state validation/corruption fallback, resume-vs-start semantics.
