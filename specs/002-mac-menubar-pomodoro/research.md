# Phase 0 Research: macOS Menu Bar Pomodoro

**Branch**: `002-mac-menubar-pomodoro` | **Date**: 2026-09-20

Resolves the design unknowns left open by `specs/002-mac-menubar-pomodoro/spec.md` and its
clarifications (session 2026-09-20). Each decision below was made against the actual codebase.

---

## D1 — Which timer drives the menu bar countdown?

**Decision**: The existing pomodoro phase engine — `app/lib/pomodoro/engine.ts` — re-hosted in
the Electron main process for the desktop build. **No new timer engine is introduced.**

**Rationale**:
- The spec requires an `MM:SS` countdown that *ticks down and reaches zero* (FR-005, Story 2
  scenario 4 "timer finishes (reaches zero)"). The only countdown in the app is the pomodoro
  engine; the tracker (`ActiveTimer` → finalized `Session`) is a count-up recorder with no end
  time and cannot satisfy "reaches zero".
- The engine is pure TypeScript with zero DOM dependencies (verified: `engine.ts`, `types.ts`,
  `format.ts` import nothing platform-specific), so it runs unchanged in the Electron main
  process. Reusing it honors the spec assumption: "surfaces and controls it from the menu bar
  rather than introducing a second, parallel timer engine."
- Hosting in main is required by FR-012: the countdown must continue while the main window is
  closed, and a closed renderer cannot run `setInterval` or persist state.

**Alternatives considered**:
- *Renderer-owned engine with a hidden offscreen window kept alive*: rejected — fragile
  lifecycle, extra window to manage, fights macOS window management; still needs IPC to reach
  the tray.
- *Menu bar driven by the count-up tracker*: rejected — cannot produce MM:SS-remaining or a
  zero-crossing event.
- *New timer engine in main*: rejected — duplicates existing, already-tested logic.

**Consequence**: For the desktop build, the pomodoro state authority moves from renderer
localStorage (`PomodoroProvider`) to the Electron main process; the renderer becomes a
subscriber via IPC (see D6). The web/browser path is untouched.

---

## D2 — Where does the "activity being recorded" name come from?

**Decision**: The name shown next to the countdown is the **active tracker draft's activity**
— resolved by the main process polling `GET /api/tracker` (returns the `ActiveTimer` draft with
its `category` and optional `title`). Display logic:
- Active draft with `title` → show `title`.
- Active draft without `title` → show `category.name`.
- No active draft → show a sensible fallback ("—") when a pomodoro is running.

**Rationale**: "Recording an activity" in this app unambiguously means the tracker
(`ActiveTimer` draft; finalized on stop per Constitution III). FR-006 says the activity name is
display-only — polling an existing endpoint requires no new API and no renderer involvement,
and it keeps working while the window is closed (FR-012).

**Alternatives considered**:
- *Renderer reports its current selection over IPC*: rejected as the sole source — stale/absent
  when the window is closed; kept only as an input to menu-bar Start (D3).
- *New dedicated status endpoint*: rejected — `GET /api/tracker` already returns exactly the
  needed shape; Constitution V forbids speculative additions.

---

## D3 — What exactly does "start a pomodoro from the menu bar" do? (binding + selected activity)

**Decision**: Menu-bar **Start Pomodoro** performs, in order:
1. Read the persisted *selected activity reference* (last activity selection the renderer
   reported via IPC `desktop:report-selected-activity`, persisted in `userData/pomodoro.json`).
2. Start the pomodoro engine's focus phase (main process).
3. If no tracker timer is currently active and a selected activity (a `categoryId`) is known,
   `POST /api/tracker {action: "start", categoryId, title}` — **omitting `timeZone`** so the
   server applies the configured default timezone (Constitution III). The created draft's id is
   recorded in main as the *bound* session.
4. If no selected activity is known, start the countdown only; the activity name shows the
   fallback (per D2 / spec edge case "no name").

Menu-bar **Stop** stops the pomodoro; if a *bound* tracker draft exists (started by the menu
bar), it also `POST /api/tracker {action: "stop"}` — finalizing it into a `Session` per the
existing lifecycle (FR-013: finalize on stop, never on window close). A tracker timer started
independently in the app window is left alone.

**Rationale**: FR-008 mandates that a menu-bar start "records the app's currently selected
activity without offering a picker". Binding only menu-bar-initiated starts keeps in-app
behavior unchanged (the app's check-in flow records activities at phase completion via
`ActivityCheckInForm`) while satisfying the FR. `categoryId` comes from the renderer's tracker
selection (TrackerCard), reported opportunistically; the server validates it (404 on unknown id,
409 on conflict) — all error paths degrade gracefully (countdown still starts).

**Alternatives considered**:
- *Always stop any active tracker on menu-bar Stop*: rejected — would finalize sessions the
  user started independently in the app.
- *Menu-bar start requires an activity*: rejected — the user may have never selected one;
  the spec only forbids a picker, not a degraded start.
- *Auto-binding every in-app pomodoro start too*: rejected — changes existing check-in
  semantics; out of scope for this feature.

---

## D4 — Pause / resume capability in the menu bar

**Decision**: The menu bar exposes **Start/Resume** and **Stop** (plus Open App, Quit App, and
the reminder toggle). No Pause. FR-008 is satisfied because it scopes controls to "at minimum:
start a pomodoro; pause/stop and resume **where the underlying timer supports it**" — the
underlying engine (`engine.ts`) has `start`, `stop`, `skip` and **no pause**. "Resume" maps to
the engine's existing behavior: `start()` on a non-idle, non-running state re-arms the
remaining time of the current phase (e.g. after a focus phase completes into a rest phase, or
after a relaunch hydrates a persisted non-running phase).

**Consequence for reminders**: The spec's "a paused timer counts as idle" rule (FR-010/FR-011)
is trivially satisfied: reminders fire whenever `engine.isRunning === false`. When pause is
added to the engine in the future, the same predicate already covers it.

**Alternatives considered**: *Adding a pause state to the engine*: rejected — changes shared,
tested engine semantics used by the web app; not required by FR-008.

---

## D5 — Window close → menu-bar-only mode (macOS only)

**Decision**: In `electron/main.ts`, gated on `process.platform === "darwin"`:
- Intercept the main window `close` event: prevent default, `mainWindow.hide()`, and keep the
  `BrowserWindow` alive (hidden) so "Open App" only needs `show()`/`focus()` (state and the
  Next.js page stay warm).
- Call `app.dock.hide()` at startup so no Dock icon shows while the window is closed; when the
  window is re-opened the app becomes a regular (Dock-visible) accessory again via
  `app.dock.show()` — matching FR-002 ("icon removed from the Dock" while closed).
- Replace the current `window-all-closed` → `app.quit()` behavior on macOS: do nothing when not
  quitting (app lives in the tray). On non-macOS platforms the existing behavior
  (quit on window-all-closed) is unchanged, per the spec edge case.
- Quit happens only via the tray "Quit App" item or Cmd+Q — routed through the existing
  `isQuitting` / `before-quit` shutdown path, which also removes the tray item
  (`tray.destroy()` on quit) and stops the server process (FR-004, SC-006).

**Rationale**: Hiding (not destroying) the window preserves the loaded Next.js page and avoids
a reload on "Open App"; `app.dock.hide()` is the standard macOS "accessory app" mechanism and
does not affect `NSStatusItem` (Tray) visibility. Gating on darwin keeps the web/Windows/Linux
behavior unchanged.

**Alternatives considered**:
- *Destroy the window and recreate on "Open App"*: rejected — reload flash, loses filters/state.
- *`LSUIElement` in the bundle ( Info.plist)*: rejected — hides the Dock icon permanently,
  including while the main window is open (FR-002 wants it gone only when closed).
- *Apply hide-to-tray on all platforms*: rejected — spec says macOS-specific.

---

## D6 — How does the renderer stay in sync with the main-process engine? (FR-009)

**Decision**: A sandbox-compatible preload script (`electron/preload.ts`) exposes a typed
`window.namehAmalDesktop` API via `contextBridge` (only `ipcRenderer` + `contextBridge` are used
— both are available under `sandbox: true`). Channels and payloads are specified in
`contracts/ipc.md`. The renderer's `usePomodoro` hook selects its transport at hydration:
- `window.namehAmalDesktop` present (desktop build) → `desktop-transport.ts` adapter: invokes
  `pomodoro:get-state` on mount, listens to `pomodoro:state-changed` pushes, and forwards
  `start/stop/skip/updateSettings` as IPC invokes. No localStorage reads/writes.
- Absent (web/browser) → existing localStorage implementation, byte-for-byte unchanged.

The main process pushes state to all windows at most every second (only when a window exists),
and immediately on any action-originated change. The same state object drives the tray, so the
menu bar and the app window can never diverge (single authority, D1).

**Rationale**: FR-009 requires zero divergence; one authority plus evented subscribers is the
simplest correct shape. `contextBridge` keeps Constitution-grade security posture intact
(`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` are unchanged).

**Alternatives considered**:
- *Renderer keeps owning state and pushes to main*: rejected — dies with the window (FR-012)
  and creates two authorities.
- *Polling from the renderer*: rejected — laggy and wasteful vs. a 1 Hz push that already
  exists for the tray tick.

---

## D7 — Desktop runtime state persistence

**Decision**: Persist desktop runtime state as a single JSON file,
`app.getPath("userData")/pomodoro.json`, written on every state change (debounced where
frequent: run snapshots written at most once per second):

```jsonc
{
  "version": 1,
  "run": { "phase": "focus", "remainingSeconds": 1234, "isRunning": true,
           "phaseEndsAtMs": 1737400000000, "completedFocusSessions": 2 },
  "settings": { "focusSeconds": 1500, "shortRestSeconds": 300,
                "longRestSeconds": 900, "longRestInterval": 4,
                "notifyOnPhaseComplete": true },
  "selectedActivity": { "categoryId": "…", "title": "Deep work", "reportedAt": 1737399000000 },
  "reminderEnabled": true
}
```

Parsing/validation reuses the existing pure helpers (`parsePomodoroSettings`,
`parsePomodoroRun`) plus new validation for the selected-activity and reminder fields
(corrupt/missing file → defaults, same fallback philosophy as `storage.ts`). On app launch the
main process hydrates from this file and reconciles with the wall clock (`hydratePomodoroState`)
— so a timer running when the app quit either already-finished (advances/completes) or resumes
its remaining time.

**Rationale**: The engine already persists `phaseEndsAtMs` (wall-clock based), so re-hydration
after relaunch is exact and timezone-independent. Electron `userData` is the sanctioned
per-user location; no new dependency. Reminder preference must survive relaunch (FR-014).

**Alternatives considered**:
- *Reuse renderer localStorage*: impossible from main; also dies with the window profile only
  existing in the renderer partition.
- *SQLite via the app's Prisma DB*: rejected — couples the Electron shell to Prisma
  (Constitution II keeps generated-client access out of the shell) and adds schema for
  non-session runtime prefs.

---

## D8 — Idle reminder delivery and the 5-minute cycle (FR-010/FR-011/FR-014)

**Decision**:
- Delivery: Electron `Notification` from the main process (`new Notification({ title, body,
  silent: false }).show()`) → macOS system notification banner, dismissible, non-blocking. If
  notifications are unsupported/blocked, the cycle continues silently (spec edge case,
  accepted for v1) and `Notification.isSupported()` guards construction.
- Cycle: a single `setInterval(5 * 60 * 1000)` in the reminder module. On each tick, a **pure
  decision function** `shouldRemind({ reminderEnabled, isPomodoroRunning })` decides. First
  reminder lands on the first 5-minute boundary after the app launches or after the last
  timer stop (matching "first reminder 5 idle minutes after idle begins"); the interval
  repeats while idle (SC-004). When the pomodoro starts, the interval is reset so a reminder
  never fires while running and the next cycle re-arms from the new idle onset (FR-011).
- Toggle: a checkable item in the tray menu ("Remind me to start a pomodoro"), persisted in
  `pomodoro.json` (`reminderEnabled`, D7). No reminder is ever delivered while disabled.

**Rationale**: Electron's `Notification` is the platform-native, non-blocking, dismissible
mechanism — matches the clarified decision ("system notification banner — never a modal").
A pure decision function keeps the timing logic unit-testable without fake timers in Electron.
A tray-menu toggle satisfies FR-014 ("simple on/off setting") without touching the web app's
settings surface and works with the window closed.

**Alternatives considered**:
- *HTML5 `Notification` from the renderer*: rejected — dies with the window (FR-012).
- *Modal dialog / `dialog.showMessageBox`*: forbidden by the clarified decision.
- *In-app settings page toggle*: viable but window-dependent; the tray toggle is simpler and
  always reachable (may be mirrored into Settings later if desired).

---

## D9 — Tray visual contract (icon + title)

**Decision**: `Tray` with two template images (macOS template images auto-adapt to dark/light
menu bars): an idle glyph ("×" per FR-007) and a running glyph. While running, the tray title
shows `MM:SS` (from the existing `formatPomodoroCountdown`) followed by the activity name
truncated with an ellipsis (max ~24 chars) per the spec's truncation edge case. Idle state:
idle icon, empty title (no countdown). Label rebuilds only when the formatted string changes.

**Rationale**: `tray.setTitle` is the standard macOS menu-bar text; template images are the
platform idiom; change-gating avoids per-second repaint churn. Truncation constant is a single
pure function, unit-tested.

**Alternatives considered**:
- *Icon-only countdown rendered into a canvas image per second*: rejected — blurry, wasteful,
  worse accessibility than `setTitle`.

---

## D10 — Testing strategy for main-process code

**Decision**: Keep Electron-bound modules as thin shells over pure functions
(`reminder-cycle` decision fn, tray label/menu-model builders, `desktop-state` parsers,
`pomodoro-host` state reducer/persistence) and unit-test the pure functions with Vitest in
`tests/electron/` (same style as the existing `runtime-config.test.ts` /
`server-process.test.ts`). End-to-end tray/notification behavior is validated manually via
`quickstart.md` scenarios (Electron Tray/Notification are not unit-testable without a full
E2E harness, which the repo does not have).

**Rationale**: Constitution IV demands real-dependency coverage of critical logic; pure
functions over real state objects satisfy this without introducing Electron mocks or an E2E
framework. No Prisma or DB code is touched.

---

## Open items carried into Phase 1

None — all NEEDS CLARIFICATION items from the Technical Context are resolved above.
