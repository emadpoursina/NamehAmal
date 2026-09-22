# Contract: Host Sync (Renderer ↔ Desktop Host)

**Feature**: specs/003-sync-pomodoro-timers/spec.md | **Date**: 2026-09-22

The IPC channel surface is **unchanged** from feature 002 — see
`specs/002-mac-menubar-pomodoro/contracts/ipc.md` for channel names, payload types, and the
`window.namehAmalDesktop` preload API. This document records the *behavioral* contract
feature 003 adds around that same surface. No new channels, no renamed payloads.

## 1. Snapshot semantics (extends `pomodoro:get-state` / `pomodoro:state-changed`)

- `pomodoro:get-state` resolves with a full `PomodoroSnapshot` once the host has hydrated.
  It **may resolve `null`** while the host is hydrating (`ipcMain.handle` returns
  `pomodoroHost?.getSnapshot() ?? null`). `null` is a first-class "host not connected yet"
  response, not an error.
- A renderer receiving `null` (or a rejected/failing fetch) MUST stay in the `waiting`
  state: render the idle placeholder, disable controls, never start a local engine, never
  touch `localStorage` (FR-009).
- The renderer reaches `connected` on the first valid snapshot from *any* of:
  the mount-time `get-state` fetch, a `pomodoro:state-changed` push, or the
  `did-finish-load` re-sync push. Late is acceptable (eventual sync); wrong is not
  (SC-002).

## 2. Control semantics (unchanged channels, shared-clock rule)

Every command (`pomodoro:start|stop|skip|update-settings`) applies to the host's single
clock and returns the resulting `PomodoroState`:
- `start` while the shared clock is running returns the unchanged running state (no second
  countdown, FR-003).
- `update-settings` during a running/non-idle phase changes only `settings`; the
  in-progress countdown keeps its original end (FR-007). Both views show the new value
  because they read the same host state (US2).
- The command result and the following broadcast are both valid sources for the view; last
  snapshot wins (existing rule).

## 3. Activity label (FR-012)

- The host is the source of the shared activity label: `PomodoroSnapshot.selectedActivity`
  (persisted, renderer-reported) + the host's `GET /api/tracker` poll produce the resolved
  name the tray displays.
- The renderer's in-app countdown displays the label from the host snapshot/report path; it
  MUST NOT run its own poller or persist a parallel label. Both surfaces may briefly lag the
  host's poll cycle (eventual sync), but always show the *same* host-derived value once
  converged.

## 4. Store isolation (FR-004; clarification "stores never merge")

- Desktop renderer path: zero `localStorage` reads/writes for pomodoro state or settings;
  all state flows over IPC from/to `userData/pomodoro.json`.
- Web mode: unchanged behavior — `localStorage` store, standalone engine, no desktop calls.
- No launch-time migration or merge in either direction.

## 5. Test hooks (for the contract tests)

- Connection-state helper: pure function mapping
  `{ hasDesktopApi, snapshotResult } → connection` and guarding "no local engine in desktop
  mode".
- Store-isolation test: with the desktop API present, stubbed `localStorage` must observe
  zero pomodoro-related access during mount, fetch-failure, and settings change.
