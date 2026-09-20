---

description: "Task list for macOS Menu Bar Pomodoro feature"
---

# Tasks: macOS Menu Bar Pomodoro

**Input**: Design documents from `/specs/002-mac-menubar-pomodoro/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ (ipc.md, tray.md) ✅, quickstart.md ✅

**Tests**: Included. The plan (Constitution IV) mandates Vitest unit coverage for new main-process pure logic (`tests/electron/*`), and quickstart.md requires `npm test` to pass. Electron Tray/Notification end-to-end behavior is validated manually per quickstart.md scenarios.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- Electron main process: `electron/` (compiled via `tsconfig.electron.json` → `.electron-dist/`)
- Renderer pomodoro library: `app/lib/pomodoro/`
- Unit tests for main-process modules: `tests/electron/` (existing pattern)
- Feature docs/validation: `specs/002-mac-menubar-pomodoro/`

**Key contracts** (implementers MUST follow):
- `specs/002-mac-menubar-pomodoro/contracts/ipc.md` — renderer ↔ main IPC channels and payloads
- `specs/002-mac-menubar-pomodoro/contracts/tray.md` — tray appearance + dropdown menu structure
- `specs/002-mac-menubar-pomodoro/data-model.md` — `DesktopRuntimeState` (pomodoro.json v1), `SelectedActivityRef`, `MenuBarDisplayState`, reminder rules
- `specs/002-mac-menubar-pomodoro/research.md` — D1–D10 decisions (no pause state; menu-bar Start binds selected activity; darwin-gated hide-to-tray; single state authority in main)

**Hard constraints** (from plan.md / constitution):
- No new npm dependencies; no Prisma in the Electron shell or renderer
- Menu-bar tracker start omits `timeZone` (server default timezone, Constitution III)
- Closing the window never finalizes or discards an in-progress timer (FR-013)
- Notifications are non-blocking banners, never modal dialogs
- Non-macOS and web/browser behavior unchanged

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build wiring and tray icon assets for all new main-process modules

- [X] T001 Verify Electron build scope: ensure `tsconfig.electron.json` includes the new `electron/*.ts` modules and `npm run desktop:compile` emits `.electron-dist/main.js` without type errors (extend `include`/`files` only if needed)
- [X] T002 [P] Add macOS template-image tray icons: idle glyph (`×`, FR-007) and running glyph as small (16×16 pt) template PNGs under `electron/assets/` (e.g., `tray-idle.png`, `tray-running.png`), loadable via `nativeImage` with `isTemplateImage` set so light/dark menu bars adapt

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Main-process state authority (engine host, persisted runtime state, IPC contract) that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create `electron/ipc-channels.ts` with channel name constants (`pomodoro:get-state`, `pomodoro:start`, `pomodoro:stop`, `pomodoro:skip`, `pomodoro:update-settings`, `desktop:report-selected-activity`, `desktop:set-reminder-enabled`, `pomodoro:state-changed`, `desktop:reminder-changed`) and shared payload types (`PomodoroSnapshot`, `SelectedActivityRef`) exactly per `contracts/ipc.md`
- [X] T004 [P] Implement `electron/desktop-state.ts`: load/validate/save `app.getPath("userData")/pomodoro.json` (schema v1: `run` snapshot via existing `parsePomodoroRun`, `settings` via existing `parsePomodoroSettings`, `selectedActivity` (`categoryId` non-empty, `title` string|null, `reportedAt`), `reminderEnabled` default `true`); any corrupt/missing/mismatched-version file → defaults without crashing; debounced writes ≤1 Hz for run snapshots per `data-model.md` §4
- [X] T005 [P] Add `tests/electron/desktop-state.test.ts`: valid-file parse round-trip, unknown `version` → defaults, corrupt JSON → defaults, missing fields → per-field fallbacks, `reminderEnabled` defaults to `true`, invalid `selectedActivity` → `null` (per Constitution IV, real temp files — no mocks)
- [X] T006 Implement `electron/pomodoro-host.ts`: main-process host over the existing pure engine (`app/lib/pomodoro/engine.ts` — no new timer engine, D1) providing `start/stop/skip/updateSettings`, wall-clock hydration from the persisted run snapshot (`phaseEndsAtMs`-based reconcile), a 1 Hz tick that advances the engine, state persistence through `desktop-state.ts`, and ≤1 Hz `pomodoro:state-changed` broadcast to existing non-destroyed windows (immediate push on action-originated change + once after a window finishes loading) per `contracts/ipc.md`
- [X] T007 Add `tests/electron/pomodoro-host.test.ts` (pure logic, no Electron mocks): hydration reconciles an expired `phaseEndsAtMs` (phase advances/completes) vs a future one (resumes remaining), tick ordering, resume-vs-start semantics (engine `start()` on non-idle non-running = resume, D4), broadcast-at-most-1 Hz gating, persistence writes on state change
- [X] T008 Create `electron/preload.ts`: sandbox-compatible `contextBridge` API exposing typed `window.namehAmalDesktop` (only `ipcRenderer` + `contextBridge` imported; `contextIsolation: true`/`sandbox: true`/`nodeIntegration: false` unchanged) implementing every invoke/event channel from `contracts/ipc.md`, and register it as `preload` in the `BrowserWindow` `webPreferences` in `electron/main.ts`

**Checkpoint**: Foundation ready — main process owns pomodoro state, persists it, and exposes the IPC contract; user story implementation can now begin

---

## Phase 3: User Story 1 - Menu Bar Presence & Persistence (Priority: P1) 🎯 MVP

**Goal**: The app lives in the macOS menu bar; closing the window hides the Dock icon without quitting; Open App / Quit App work from the menu bar.

**Independent Test**: Launch on macOS, close the main window → app keeps running with no Dock icon and a menu bar item; Open App reopens the window; Quit App fully exits (quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T009 [US1] Create `electron/tray.ts`: darwin-only `Tray` creation with the idle template icon and empty title (FR-007), a base dropdown menu containing **Open App** and **Quit App** (per `contracts/tray.md` structure, control items added in US3), and `destroy()` teardown on quit
- [X] T010 [US1] Modify `electron/main.ts` (darwin-gated, D5): intercept window `close` → `preventDefault()` + `mainWindow.hide()` (window stays alive), `app.dock.hide()` while closed and `app.dock.show()` when reopened, `window-all-closed` becomes a no-op on macOS (non-macOS keeps quit-on-close), and route Quit through the existing `isQuitting`/`before-quit` shutdown path (tray destroyed, server process stopped, no orphaned background activity — FR-004/SC-006)
- [X] T011 [US1] Wire the foundation into `electron/main.ts` startup: create `desktop-state`, hydrate the `pomodoro-host` from it, start the 1 Hz tick, create the tray, and flush/persist state on `before-quit` (FR-012 groundwork: countdown continues with the window closed)
- [ ] T012 [US1] Manually verify quickstart.md Scenario 1 on macOS: tray visible at launch, window close → app survives with no Dock icon, Open App restores (no reload flash), Quit App exits cleanly (`ps aux | grep next` shows no leftover)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently (app is menu-bar-resident; SC-001, FR-001..FR-004)

---

## Phase 4: User Story 2 - Live Timer Status in the Menu Bar (Priority: P2)

**Goal**: The menu bar item shows the live MM:SS countdown plus the recorded activity name while a pomodoro runs, and the idle `×` display when not — consistent with the in-app timer.

**Independent Test**: Start a pomodoro (in app or via the host) and verify the menu bar ticks every second; stop it and verify the item reverts to the idle `×` display (quickstart.md Scenario 2).

### Implementation for User Story 2

- [X] T013 [P] [US2] Implement `MenuBarDisplayState` pure helpers in `electron/tray-label.ts`: `mode` (`"running"` iff `isRunning && phase !== "idle"`, else `"idle"`), title `""` when idle / `"{MM:SS} {activityName}"` when running using the existing `formatPomodoroCountdown`, activity-name resolution (draft `title` → `category.name` → `"—"` fallback) and truncation at 24 chars (23 + `…`) per `data-model.md` §5 and `contracts/tray.md`
- [X] T014 [P] [US2] Add `tests/electron/tray.test.ts`: label formatting (MM:SS + name), truncation of long names, `"—"` fallback with no draft, idle → empty title + idle glyph / running → title + running glyph, and repaint-gating decision (update only when mode or formatted title changes) — per Constitution IV, pure functions over real state objects
- [X] T015 [US2] Extend `electron/tray.ts` to render the display state: swap idle/running template icons, set the formatted title, gate `setTitle`/`setImage` on change (≤1 effective repaint, D9), and rebuild the menu from the current `MenuBarDisplayState` on every state change
- [X] T016 [US2] Implement activity-name sourcing in `electron/pomodoro-host.ts`: poll `GET /api/tracker` (existing route handler over local HTTP, D2) for the active draft's `title`/`category.name`, refreshed on state changes/ticks with graceful failure (error → fallback `"—"`, never crashes the host)
- [X] T017 [US2] Create `app/lib/pomodoro/desktop-transport.ts`: renderer adapter over `window.namehAmalDesktop` — `pomodoro:get-state` on mount, `pomodoro:state-changed` subscription (last snapshot wins), and `start/stop/skip/updateSettings` forwarded as invokes per `contracts/ipc.md` (no localStorage access)
- [X] T018 [US2] Modify `app/lib/pomodoro/use-pomodoro.ts` to select the transport at hydration: `window.namehAmalDesktop` present → desktop IPC transport; absent → existing localStorage implementation byte-for-byte unchanged (D6)
- [ ] T019 [US2] Manually verify quickstart.md Scenario 2: idle shows `×` with no countdown; running shows MM:SS ticking every second plus activity name; countdown continues with the window closed (FR-012); stop reverts to idle; in-app display and tray never diverge (FR-009/SC-003)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently (live menu bar status; FR-005..FR-007, FR-009, FR-012)

---

## Phase 5: User Story 3 - Pomodoro Controls from the Menu Bar (Priority: P3)

**Goal**: Start/Resume and Stop work from the menu bar dropdown; a menu-bar start records the app's currently selected activity (bound session) without any picker; menu bar and app window stay consistent.

**Independent Test**: With the window closed, run Start → Stop entirely from the menu bar and verify the countdown lifecycle and the finalized session appear in the dashboard when reopened (quickstart.md Scenario 3, SC-002).

### Implementation for User Story 3

- [X] T020 [US3] Extend the menu model in `electron/tray.ts` with control items per `contracts/tray.md`: **Start Pomodoro** (disabled while running) / **Resume** (shown instead of Start for a non-idle non-running phase, disabled while running) and **Stop** (disabled when idle) — both dispatch through the exact same host state functions as IPC (no separate code path); no activity picker/submenu and no timer-length options anywhere (FR-006)
- [X] T021 [US3] Implement tracker binding in `electron/pomodoro-host.ts` (D3): menu-bar start reads the persisted `SelectedActivityRef`; if no tracker draft is active and a `categoryId` exists, `POST /api/tracker {action:"start", categoryId, title}` omitting `timeZone` (server default timezone, Constitution III) and record the bound draft id; menu-bar stop additionally `POST`s `{action:"stop"}` for the *bound* draft only (finalize into `Session`, FR-013); unknown category (404)/conflict (409) → degrade to countdown-only; also handle `desktop:report-selected-activity` invokes (validate + persist) so the renderer's selection feeds menu-bar Start
- [X] T022 [P] [US3] Extend `tests/electron/pomodoro-host.test.ts` with binding semantics: start with a persisted selected activity → tracker start issued with no `timeZone`, stop finalizes only the bound draft, independent in-app tracker sessions untouched, invalid/missing selected activity → countdown-only start with fallback label (fetch stubbed at the HTTP boundary — the only acceptable seam per D10)
- [X] T023 [US3] Wire selected-activity reporting in the renderer tracker UI (`app/` tracker card/selection component): on every tracker selection change, call `window.namehAmalDesktop?.reportSelectedActivity({ categoryId, title })` (no-op on web/browser) so menu-bar Start records the app's currently selected activity (FR-008)
- [ ] T024 [US3] Manually verify quickstart.md Scenario 3: menu-bar-only Start → activity draft starts for the previously selected activity; Stop → Start/Resume cycle per `contracts/tray.md`; in-app view matches the tray mid-run; full start→stop from the menu bar with the window closed finalizes a visible `Session` (SC-002)

**Checkpoint**: At this point, User Stories 1, 2 AND 3 should all work independently (full menu-bar control; FR-008, SC-002)

---

## Phase 6: User Story 4 - Idle Reminders (Priority: P4)

**Goal**: Every 5 idle minutes (no running timer, reminder setting on) a dismissible macOS notification banner reminds the user to start a pomodoro; running timers suppress reminders; the on/off toggle persists.

**Independent Test**: Leave the app idle ≥5 minutes with reminders on → banner appears; start a timer → reminders stop; toggle off → zero reminders, persisted across relaunch (quickstart.md Scenario 4).

### Implementation for User Story 4

- [X] T025 [P] [US4] Implement `electron/reminder-cycle.ts`: pure decision `shouldRemind({ reminderEnabled, isPomodoroRunning })` (remind iff enabled && !running — paused/absent ⇒ idle, D4) plus a thin shell with a single `setInterval(5 * 60_000)`, `reset()` so starting any pomodoro re-arms from the new idle onset (FR-011, never stacks notifications), and delivery via Electron `Notification` banner guarded by `Notification.isSupported()` (blocked/unsupported → silent no-op; never a modal dialog)
- [X] T026 [P] [US4] Add `tests/electron/reminder-cycle.test.ts`: full decision matrix (enabled/disabled × running/idle), interval reset on timer start so the next reminder lands exactly 5 idle minutes later, repeat-while-idle behavior, and no-reminder-while-disabled (pure functions, no fake-timer Electron mocks — D10)
- [X] T027 [US4] Wire the reminder cycle into `electron/pomodoro-host.ts` / `electron/main.ts`: start the cycle at launch, reset on every start action, re-arm when the engine transitions to idle, and handle `desktop:set-reminder-enabled` invokes (persist via `desktop-state.ts`, re-arm from now when turned on mid-idle, broadcast `desktop:reminder-changed`) per `contracts/ipc.md`
- [X] T028 [US4] Add the checkable **"✓ Remind me to start a pomodoro"** item to the tray menu in `electron/tray.ts` (own section between the controls and Open App/Quit App per `contracts/tray.md`), reflecting `reminderEnabled` from `MenuBarDisplayState` and persisted across relaunch (FR-014)
- [ ] T029 [US4] Manually verify quickstart.md Scenario 4: banner appears after 5 idle minutes and repeats every 5 minutes while idle (never stacked), zero reminders while running (SC-005), toggle off ⇒ zero reminders and stays off after quit + relaunch, quit mid-timer ⇒ abandoned draft not finalized silently and countdown re-hydrates from `phaseEndsAtMs` on relaunch

**Checkpoint**: All user stories should now be independently functional (idle reminders; FR-010, FR-011, FR-014, SC-004, SC-005)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T030 [P] Update documentation: README desktop section (menu bar presence, hide-to-tray on macOS, reminder toggle, `userData/pomodoro.json` runtime state) and note the web/self-hosted behavior is unchanged
- [X] T031 Run `npm test` and `npm run lint`; fix any regressions and confirm all existing suites (`app/lib/pomodoro/*` engine/format/storage/notifications, `tests/electron/runtime-config`, `tests/electron/server-process`, data-layer suites) still pass unchanged
- [X] T032 Non-macOS and web regression check: run the web app (`npm run dev`) and confirm the pomodoro still uses the localStorage path with zero IPC references; confirm the Electron shell on non-darwin keeps quit-on-window-close and creates no tray
- [ ] T033 Execute full `specs/002-mac-menubar-pomodoro/quickstart.md` end-to-end (Scenarios 1–4 + automated checks) and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 → US2 → US3 → US4 is the recommended sequential order (each builds on the tray/host from the previous), but US3 and US4 can proceed in parallel once US2 is done (different modules: menu model/binding vs reminder-cycle)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Requires Foundational (host, desktop-state, preload). Creates the tray and window lifecycle. No dependencies on other stories.
- **User Story 2 (P2)**: Requires US1's tray. Adds display state, activity-name sourcing, and renderer IPC transport. No dependency on US3/US4.
- **User Story 3 (P3)**: Requires US2's tray display and host actions. Adds control menu items and tracker binding. Independent of US4.
- **User Story 4 (P4)**: Requires US1's tray (for the toggle item) and the host's running-state predicate. The reminder module itself (`reminder-cycle.ts` + tests) is independent and can be built any time after Foundational.

### Within Each User Story

- Pure functions + their tests before shell wiring (Constitution IV)
- Models/helpers before services, services before UI/menu integration
- Core implementation before manual quickstart verification
- Story complete before moving to the next priority

### Parallel Opportunities

- Phase 1: T002 parallel with T001
- Phase 2: T004+T005 (desktop-state + its tests) parallel with T003; T007 after T006
- US2: T013+T014 (label helpers + tests) parallel with T016/T017 (host polling, renderer transport)
- US3: T022 (binding tests) parallel with T023 (renderer reporting)
- US4: T025+T026 (module + tests) fully parallel with US3 work; T028 (menu toggle) parallel with T027 (host wiring)
- Different user stories can be worked on in parallel by different developers once their predecessors' trays/hosts exist

---

## Parallel Example: User Story 2

```bash
# Launch independent US2 work together:
Task: "MenuBarDisplayState pure helpers in electron/tray-label.ts" (T013)
Task: "Activity-name sourcing in electron/pomodoro-host.ts" (T016)
Task: "Renderer adapter app/lib/pomodoro/desktop-transport.ts" (T017)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart.md Scenario 1 on macOS
5. The app is now menu-bar-resident with window-close persistence

### Incremental Delivery

1. Setup + Foundational → state authority in main, IPC contract ready
2. Add US1 → menu bar presence (MVP)
3. Add US2 → live countdown display, renderer sync
4. Add US3 → full menu-bar control with bound sessions (SC-002)
5. Add US4 → idle reminders with persisted toggle
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US2 (tray/display track)
   - Developer B: US4 reminder module (pure logic, no tray dependency)
3. US3 lands after US2; polish phase is shared

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All new logic is pure-function-first (D10): Electron-bound modules are thin shells
- No new npm dependencies, no Prisma in the shell/renderer, `timeZone` omitted on tracker start
- Verify quickstart.md scenarios manually on a macOS host; `npm test` must stay green throughout
- Commit after each task or logical group (Conventional commits)
- Avoid: vague tasks, same-file conflicts between parallel tasks, cross-story dependencies that break independence

---

## Phase 8: Convergence

- [X] T034 Restrict tracker draft binding so only menu-bar Start (not renderer IPC `pomodoro:start`) posts `/api/tracker` and records a bound draft per plan: D3 (contradicts)
- [X] T035 Include `electron/assets/tray-idle.png` and `tray-running.png` in the packaged desktop app (`electron-builder.yml` files/extraResources) and load them when `app.isPackaged` so the idle `×` / running glyphs appear outside `desktop:dev` per FR-007 (partial)
