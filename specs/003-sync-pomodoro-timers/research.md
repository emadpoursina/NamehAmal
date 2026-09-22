# Research: Sync Pomodoro Timers

**Feature**: specs/003-sync-pomodoro-timers/spec.md | **Branch**: `003-sync-pomodoro-timers` | **Date**: 2026-09-22

All NEEDS CLARIFICATION markers from the plan template's Technical Context were resolved
against the existing codebase; the spec's three clarifications (shared clock, desktop page
waits for host, independent settings stores) are encoded below as decisions.

## D1 — Where does the "one authoritative clock" live? (FR-001, FR-003)

**Decision**: Keep the Electron main-process `PomodoroHost` (`electron/pomodoro-host.ts`) as
the single authoritative clock for the desktop build; it already re-hosts the pure engine
(`app/lib/pomodoro/engine.ts`) and persists to `userData/pomodoro.json`. The in-app page in
desktop mode stays a view/controller over IPC. **No new engine is written.**

**Rationale**: Feature 002 already established this ownership (`PomodoroHost` hydrates from
disk, ticks at 1 Hz, broadcasts snapshots to every `BrowserWindow` and the tray). The spec's
assumption ("the desktop host remains the authoritative owner") matches the shipped design.
`engine.start()` is a no-op while `isRunning`, so a start pressed in either surface while the
shared clock runs cannot spawn a second countdown (FR-003).

**Alternatives considered**:
- Renderer-owned clock mirrored to the tray: rejected — the window can be hidden/closed
  (menu-bar-only mode) while the clock must keep running (FR-006, FR-011).
- HTTP/SSE from the Next server as the clock owner: rejected — the host must run when no
  window is open and the clock is not a concern of the tracker data layer.

## D2 — Eventual sync semantics (FR-002; clarification "sync is eventual")

**Decision**: Keep the existing propagation stack, which already exceeds the required
eventual convergence:
1. **Immediate broadcast** on every transition (`start`/`stop`/`skip`/`updateSettings`/
   reminder toggle call `broadcastNow()`).
2. **Per-second tick broadcast** (`BROADCAST_MIN_INTERVAL_MS = 950`) — a superset of the
   "not live 1-second mirroring" clarification; the clarification makes eventual *sufficient*,
   it does not forbid the already-shipped live push.
3. **Full re-sync on revisit/refresh**: `mainWindow.webContents.on("did-finish-load")` pushes
   a fresh snapshot after any reload/navigation, and the renderer also fetches
   `pomodoro:get-state` once on mount ("subscribe first, then fetch").

The clarification's menu-bar refresh button is therefore **not required** and will not be
added: the tray already converges live because it consumes the same host broadcast.

**Rationale**: Removing the 1 Hz broadcast would regress today's live convergence for no FR
benefit; adding a refresh control would duplicate an existing mechanism (Spec Kit simplicity
gate).

**Alternatives considered**: throttle broadcasts to transition-only and add a tray
"Refresh Pomodoro" item — rejected as strictly worse (more code, weaker UX, same FRs met).

## D3 — Desktop-mode detection and the "never starts a local engine" guarantee (FR-009; clarification "wait until host connects")

**Decision**: `window.namehAmalDesktop` (installed synchronously by the sandboxed preload
**before any page script runs**) is the desktop-mode marker, exactly as today
(`isDesktopRuntime()`). The renderer hardens the desktop path:
- On mount with the desktop API present, the provider sets a connection state
  `waiting` → `connected` (first snapshot received) or stays `waiting` when
  `pomodoro:get-state` resolves `null` (host still hydrating — `ipcMain.handle` returns
  `pomodoroHost?.getSnapshot() ?? null`). While `waiting`, the view renders an explicit
  idle/placeholder ("Waiting for desktop host…") instead of pretending a 25:00 idle clock.
- While the desktop API is present, the provider **never** touches `localStorage`
  (already true) and **never** starts the local tick interval (already true); the
  connection-state machine makes this explicit and testable instead of implicit.
- If the snapshot fetch fails or resolves `null`, the provider keeps waiting and relies on
  the subscription/`did-finish-load` push for convergence — no timeout-based fallback to a
  local engine (the clarification forbids it).

**Rationale**: In Electron the preload script is guaranteed to run before renderer scripts
in the same window, so a missing bridge genuinely means "not the desktop build". The residual
risk (preload bridge broken) was fixed in commit b826ac3 and is covered by
`tests/electron/*`; if the bridge were absent, the page is by definition not desktop mode.

**Alternatives considered**:
- A `?desktop=1` query marker set by `loadURL`: rejected — brittle across navigations/reloads
  and duplicates the preload marker.
- A timeout that falls back to localStorage after N seconds: rejected — violates FR-009
  ("MUST NOT start a local engine in desktop mode") and FR-004 (stores never merge).

## D4 — Waiting-state surface (US1 scenario 1, edge case "host not yet ready")

**Decision**: Extend `PomodoroContextValue` with a `connection` field:
`"local" | "waiting" | "connected"`.
- `"local"`: web mode — own engine + localStorage (US3, unchanged).
- `"waiting"`: desktop mode, host snapshot not yet received — view shows the idle placeholder
  and disables controls.
- `"connected"`: desktop mode, snapshot from host — normal view.

`PomodoroView` shows a neutral placeholder card while `waiting`; no countdown digits that
could be mistaken for a real clock (SC-002 forbids two disagreeing countdowns being
observable).

**Rationale**: Today the provider silently renders default `createInitialState()` while the
first IPC round-trip is in flight — that can briefly show a fabricated 25:00 idle clock and
durations instead of the host's persisted values. An explicit connection state removes the
ambiguity and gives the tests a handle.

**Alternatives considered**: skeleton spinner with no state machine — rejected; the state
field is what makes "never a local engine" provable and lets the view distinguish waiting
from idle.

## D5 — Activity label in both surfaces (FR-012)

**Decision**: The host already resolves the activity label
(`resolveActivityName`: draft title → category name → `"—"`) for the tray from
`GET /api/tracker` polling and persists `selectedActivity` in the snapshot. Extend the
renderer: `PomodoroProvider` stores the `selectedActivity` from `PomodoroSnapshot` in its
context value, and `PomodoroView` renders the label next to the countdown when connected.
The tray keeps its own resolved-label path (poll-driven) — the *name shown* converges because
both derive from the same host snapshot/poll result.

**Rationale**: FR-012 requires the label to be consistent; today only the tray shows it.
No new HTTP surface: the label comes from the host snapshot the renderer already receives.

**Alternatives considered**: in-app page polls `/api/tracker` itself — rejected as a second
poller racing the host and diverging from the menu-bar label.

## D6 — Settings-store independence (FR-004, FR-005; clarification "never merge")

**Decision**: Keep the two stores exactly as shipped and pin the independence with tests:
- Web mode: `localStorage` keys `nameh-amal:pomodoro:settings` / `nameh-amal:pomodoro:run`
  (`app/lib/pomodoro/storage.ts`); provider effects skip persistence when the desktop API is
  present.
- Desktop: `userData/pomodoro.json` via `DebouncedWriter`; renderer never persists.
- No launch-time migration/merge in either direction — verified by a new unit test asserting
  the desktop path performs zero `localStorage` reads/writes and that hydration in desktop
  mode ignores any stored web values.

**Rationale**: The clarification forbids convergence; the shipped code already satisfies it.
Tests make the constraint a contract instead of a comment.

**Alternatives considered**: merging web settings into the desktop store on first desktop
launch — explicitly rejected by the spec.

## D7 — Mid-countdown settings change (FR-007, US2 scenario 3)

**Decision**: Existing `engine.updateSettings` already preserves the in-progress countdown
(running/non-idle → only `settings` changes; idle → resets `remainingSeconds` to the new
focus length) and the host broadcasts immediately, so both views show the new value for the
next phase. No change; covered by existing `engine.test.ts` + a host-level test if needed.

## D8 — Sleep/wake truthfulness (FR-008, edge case)

**Decision**: No new code. Both engines derive `remainingSeconds` from
`phaseEndsAtMs - now` on every tick/hydration, so after a system wake the next tick
(host) or load/revisit (web `hydratePomodoroState`) recomputes truthfully from wall-clock
elapsed time. Verified in quickstart.

## D9 — Corrupt/missing persisted state (FR-010, edge case)

**Decision**: Existing parsers handle it: `parseDesktopState` returns defaults for a bad
`pomodoro.json`; `parsePomodoroRun`/`parsePomodoroSettings` fall back to idle + valid
settings in web mode. No change; quickstart covers it.

## D10 — Web-mode two-tab behavior (edge case "page open on two views")

**Decision**: Keep the existing single-engine-per-tab + `storage` event sync (last write
wins, both tabs converge to the same persisted state). Desktop mode is unaffected (one host,
`did-finish-load` re-sync). No cross-tab leader election — the spec scopes "exactly one
clock per running app instance" (FR-001), and the desktop instance has exactly one host.

## D11 — Testing strategy (Constitution IV)

**Decision**: Vitest, following existing patterns:
- New pure helper(s) for the connection-state machine in
  `app/lib/pomodoro/desktop-connection.test.ts` (no Electron imports — the decision function
  takes plain inputs).
- Store-isolation test asserting the desktop path never touches `localStorage`.
- Existing suites (`tests/electron/pomodoro-host.test.ts`, `app/lib/pomodoro/*`) keep
  passing; host/tray behavior is intentionally unchanged.

**Alternatives considered**: Playwright/E2E — not present in this repo; the constitution's
test-first principle is served by unit tests + the manual quickstart script.
