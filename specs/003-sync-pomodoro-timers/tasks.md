---

description: "Task list for feature 003 — Sync Pomodoro Timers"
---

# Tasks: Sync Pomodoro Timers

**Input**: Design documents from `/specs/003-sync-pomodoro-timers/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/host-sync.md

**Tests**: Included. The constitution (Principle IV: Test-First with Real Dependencies) and plan.md's Testing section explicitly require new Vitest unit tests for the host-connection state machine and store isolation. Test tasks are written to FAIL before their implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single-project repository (Next.js App Router monolith + Electron shell at repo root):

- Electron main process: `electron/`
- Renderer/lib code: `app/lib/pomodoro/`, `app/pomodoro/`
- Existing suites: `tests/electron/`, `app/lib/pomodoro/*.test.ts`

Source of truth for what changes (plan.md): only `app/lib/pomodoro/PomodoroProvider.tsx`,
`app/lib/pomodoro/desktop-transport.ts` (types), `app/pomodoro/PomodoroView.tsx` are modified;
new pure helper + tests in `app/lib/pomodoro/desktop-connection.ts` /
`app/lib/pomodoro/desktop-connection.test.ts`. **No changes to `electron/pomodoro-host.ts`,
`electron/ipc-channels.ts`, `electron/main.ts`, or `app/lib/pomodoro/storage.ts`.**

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline verification — the codebase already contains the host clock (feature 002); nothing is scaffolded from scratch.

- [x] T001 Verify branch `sync-timers` is checked out and read the files this feature touches: `electron/pomodoro-host.ts`, `electron/ipc-channels.ts`, `electron/desktop-state.ts`, `app/lib/pomodoro/PomodoroProvider.tsx`, `app/lib/pomodoro/desktop-transport.ts`, `app/lib/pomodoro/types.ts`, `app/lib/pomodoro/storage.ts`, `app/pomodoro/PomodoroView.tsx`
- [x] T002 [P] Run `npm test` and `npm run lint` on the untouched tree and record the baseline as green (existing suites: `tests/electron/pomodoro-host.test.ts`, `app/lib/pomodoro/*.test.ts`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The connection-state type and its pure decision helper — every user story's view behavior depends on them (data-model.md §4, contracts/host-sync.md §5).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Define the `PomodoroConnection` type (`"local" | "waiting" | "connected"`) and the snapshot/connection result types shared with the view in `app/lib/pomodoro/desktop-transport.ts`
- [x] T004 [P] Write failing unit tests for the pure connection-state helper in `app/lib/pomodoro/desktop-connection.test.ts`: `{ hasDesktopApi: false }` → `"local"`; `{ hasDesktopApi: true, snapshotResult: null | pending | rejected }` → `"waiting"`; `{ hasDesktopApi: true, snapshotResult: valid snapshot }` → `"connected"` (source: contracts/host-sync.md §1, §5)
- [x] T005 Implement the pure helper `resolvePomodoroConnection()` in a new `app/lib/pomodoro/desktop-connection.ts` — no Electron imports, plain-input function (research.md D3/D4); make T004 pass

**Checkpoint**: Foundation ready — the connection contract is typed and testable; user story implementation can now begin

---

## Phase 3: User Story 1 — One Shared Clock Across Menu Bar and App (Priority: P1) 🎯 MVP

**Goal**: The desktop pomodoro page becomes an explicit view/controller of the Electron host clock: it waits for the host when needed, never starts a local engine or touches `localStorage` in desktop mode, and shows the same phase, remaining time, and activity label as the menu bar (spec.md US1, FR-001/002/003/009/012).

**Independent Test**: Start a pomodoro from the menu bar, open/refresh the app's pomodoro page and verify identical remaining time, phase, and activity label; stop it from the app page and verify the menu bar reverts to idle (after refresh, if required). Quickstart Scenarios 1–3.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [P] [US1] Write failing provider-level unit tests for the desktop connection gating in `app/lib/pomodoro/desktop-connection.test.ts`: desktop mode starts at `"waiting"` and stays `"waiting"` when `pomodoro:get-state` resolves `null` or rejects; reaches `"connected"` on the first valid snapshot from the mount fetch, a `pomodoro:state-changed` push, or the `did-finish-load` re-sync push; no timeout fallback to a local engine (contracts/host-sync.md §1, research.md D3)

### Implementation for User Story 1

- [x] T007 [US1] Implement the host-connection state machine in `app/lib/pomodoro/PomodoroProvider.tsx` using `resolvePomodoroConnection()`: expose `connection` on `PomodoroContextValue`; in desktop mode mount at `"waiting"`, keep controls inert, and never start the local tick interval or read/write `localStorage` (FR-003, FR-009; research.md D3)
- [x] T008 [US1] Render the waiting placeholder in `app/pomodoro/PomodoroView.tsx`: when `connection === "waiting"` show a neutral idle placeholder card ("Waiting for desktop host…") with disabled controls — no fabricated 25:00 countdown and no default durations (US1 scenario 1, SC-002, research.md D4)
- [x] T009 [US1] Expose the shared activity label: store `selectedActivity` from `PomodoroSnapshot` as `activityName` on `PomodoroContextValue` in `app/lib/pomodoro/PomodoroProvider.tsx` (host-resolved value only — the renderer MUST NOT run its own `/api/tracker` poller; contracts/host-sync.md §3, research.md D5)
- [x] T010 [US1] Render the activity label next to the in-app countdown in `app/pomodoro/PomodoroView.tsx` when `connection === "connected"`, with the neutral fallback for `null`/`"—"` identical to the tray's (FR-012)
- [x] T011 [US1] Verify web mode (`connection === "local"`) is untouched by the provider changes: standalone engine + `app/lib/pomodoro/storage.ts` persistence paths still used when `window.namehAmalDesktop` is absent (US3 precondition; research.md D6) — make T006 and existing `app/lib/pomodoro/*.test.ts` suites pass

**Checkpoint**: User Story 1 is fully functional and independently testable — run Quickstart Scenarios 1–3 (shared clock, start-while-running is a no-op, page waits for the host)

---

## Phase 4: User Story 2 — Shared Pomodoro Settings (Priority: P2)

**Goal**: Both surfaces always honor the same settings from the host's single store; a mid-countdown duration change applies only from the next phase (spec.md US2, FR-004/005/007, INV-2 in data-model.md).

**Independent Test**: Change the focus duration from the in-app settings, start from the tray, and verify the tray counts down the new duration; change it again mid-countdown and verify the current countdown runs to its original end. Quickstart Scenario 4.

### Tests for User Story 2 ⚠️

- [x] T012 [P] [US2] Verify existing coverage in `app/lib/pomodoro/engine.test.ts` and `tests/electron/pomodoro-host.test.ts` for mid-countdown `updateSettings` (running/non-idle → only `settings` changes, countdown end preserved; idle → remaining resets to new focus length — FR-007, research.md D7); add a failing host-level test first ONLY if this case is not already covered

### Implementation for User Story 2

- [x] T013 [US2] Confirm the in-app settings path in `app/lib/pomodoro/PomodoroProvider.tsx` in desktop mode reads settings exclusively from the host snapshot and writes exclusively via `pomodoro:update-settings` (both surfaces mutate the same host state — INV-2, data-model.md §2); no code change expected if already true, in which case record the verification
  > ✅ Verified 2026-09-22: settings read from `snapshot.state` (host broadcast + `get-state` result); writes go only through `api.updatePomodoroSettings` (`handleUpdateSettings`, gated on `connection === "connected"`); pinned by the T015/T016 isolation test (`api.updatePomodoroSettings` called with the partial, resulting state applied, zero localStorage access).
- [x] T014 [US2] Verify settings persistence across restarts via `userData/pomodoro.json` (`electron/desktop-state.ts`, `DebouncedWriter` — FR-005) by keeping `tests/electron/pomodoro-host.test.ts` green; no host code changes

**Checkpoint**: User Stories 1 AND 2 both work — run Quickstart Scenario 4 (shared settings, mid-countdown change, restart persistence)

---

## Phase 5: User Story 3 — Consistent Behavior Without the Desktop Host (Priority: P3)

**Goal**: Plain-browser mode keeps its single standalone clock with `localStorage` persistence and wall-clock hydration, and the two settings stores are provably never merged (spec.md US3, FR-004/008/010, INV-1).

**Independent Test**: Open the app in a plain browser, run a pomodoro, reload, and verify timer and settings resume from persisted state with no desktop host; then verify the desktop app uses its own store, ignoring browser-local values. Quickstart Scenarios 5–6.

### Tests for User Story 3 ⚠️

- [x] T015 [P] [US3] Write the store-isolation test (contracts/host-sync.md §5, research.md D6): with the desktop API present, a stubbed `localStorage` must observe ZERO pomodoro-related reads/writes during provider mount, during a `get-state` failure/`null`, and during a settings change — add to `app/lib/pomodoro/desktop-connection.test.ts`; write FIRST, expect FAIL until T016 wires the guard

### Implementation for User Story 3

- [x] T016 [US3] Enforce/assert store isolation in `app/lib/pomodoro/PomodoroProvider.tsx`: persistence effects and any `localStorage` access are skipped when the desktop API is present, and desktop hydration ignores stored web values (FR-004, INV-1); make T015 pass
- [x] T017 [US3] Web-mode regression: verify `app/lib/pomodoro/storage.ts` + provider `local` mode still hydrate run state from wall-clock `phaseEndsAtMs` after reload/sleep-wake and fall back to idle + valid settings on corrupt data (FR-008, FR-010; research.md D8/D9) — existing `app/lib/pomodoro/*.test.ts` suites must pass unchanged; add a hydration-fallback test only if missing

**Checkpoint**: All user stories independently functional — run Quickstart Scenarios 5–6 (stores never merge; web-only consistency)

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and end-to-end manual validation

- [x] T018 Run the full Vitest suite: `npm test` (new `desktop-connection` tests + existing `tests/electron/*` and `app/lib/pomodoro/*` suites, all green)
- [x] T019 [P] Run `npm run lint` and fix any issues in the touched files (`PomodoroProvider.tsx`, `PomodoroView.tsx`, `desktop-transport.ts`, `desktop-connection.ts`)
- [x] T020 [P] If the waiting placeholder or activity label changes user-facing desktop behavior documentation, update `docs/desktop-macos.md` accordingly (skip if nothing user-visible changed beyond the placeholder)
- [ ] T021 Execute the complete `specs/003-sync-pomodoro-timers/quickstart.md` validation (Scenarios 1–7, including resilience FR-010/FR-011) against `npm run desktop:dev` and `npm run dev`
  > ⚠️ NOT executed by the implement worker: Scenarios 1–7 require interactive macOS GUI + tray validation (`npm run desktop:dev`) that cannot be performed headlessly. Automated coverage of the same behaviors: `npm test` (130 passing incl. new connection-gating/store-isolation/host-settings tests). Manual run still required.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (T003–T005 define the connection contract every story consumes)
- **US1 (Phase 3)**: Depends on Phase 2 — core MVP
- **US2 (Phase 4)**: Depends on Phase 2; builds on US1's provider work (T007) since it verifies the same IPC-driven settings path — do after US1
- **US3 (Phase 5)**: Depends on Phase 2; its isolation tests exercise the desktop path hardened in US1 — do after US1
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational; practically sequenced after US1 because it validates settings flowing through the same connection-gated provider
- **User Story 3 (P3)**: Can start after Foundational; its store-isolation test (T015) targets the desktop path from US1

### Within Each User Story

- Tests written and FAILING before the implementation that satisfies them (Constitution IV)
- Provider state machine (T007) before view rendering (T008, T010)
- Pure helpers and types (T003/T005) before provider integration
- Story complete at its checkpoint before moving to the next priority

### Parallel Opportunities

- T002 (baseline) and T003 (types) can run in parallel with T001 reading
- T004 (helper tests) and T003 (types) touch different files — parallel
- T006 and T012 are [P] test-writing tasks in different files
- T015 (store-isolation test) is independent of T012 — parallel
- T019 and T020 are independent polish tasks

## Parallel Example: Phase 2 / US1

```bash
# Launch independent test-writing tasks together:
Task: "Connection-state helper tests in app/lib/pomodoro/desktop-connection.test.ts" (T004)
Task: "Connection types in app/lib/pomodoro/desktop-transport.ts" (T003)

# After T007 (provider), the view tasks touch the same file — run sequentially:
Task: "Waiting placeholder in app/pomodoro/PomodoroView.tsx" (T008)
Task: "Activity label in app/pomodoro/PomodoroView.tsx" (T010)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline green)
2. Complete Phase 2: Foundational (connection types + helper — CRITICAL, blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Quickstart Scenarios 1–3 pass
5. Demo if ready — the shared-clock guarantee (the reason this feature exists) is delivered

### Incremental Delivery

1. Setup + Foundational → connection contract ready
2. Add US1 → validate (Quickstart 1–3) → **MVP: one shared clock**
3. Add US2 → validate (Quickstart 4) → settings stay in lockstep
4. Add US3 → validate (Quickstart 5–6) → web mode proven unregressed and stores provably independent
5. Polish → full `npm test` + `npm run lint` + Quickstart 1–7

### Notes

- Per research.md D2, NO menu-bar refresh button and NO new sync mechanism are added — the existing broadcast stack already exceeds the eventual-sync requirement
- Per plan.md constraints: no new npm dependencies, no new IPC channels, no renderer Prisma, and `electron/*` host files are intentionally unchanged
- [P] tasks = different files, no dependencies
- Commit after each task or logical group (Conventional Commits, e.g. `feat(pomodoro): ...`)
- Avoid: touching `app/lib/pomodoro/storage.ts` or `electron/pomodoro-host.ts` — both are explicitly out of scope

---

## Phase 7: Convergence

- [x] T022 Deliver the host-resolved activity label (`getActivityName()` / broadcast `activityName`) on the existing `pomodoro:state-changed` / `get-state` snapshot path so the in-app countdown shows the same string as the tray when `selectedActivity.title` is null but the tracker draft has a category name, per FR-012 (partial)
  > ✅ Implemented 2026-09-22: `PomodoroSnapshot` gained optional `activityName` (electron/ipc-channels.ts); `PomodoroHost.getSnapshot()` now includes `getActivityName()` so both `pomodoro:get-state` and the `pomodoro:state-changed` broadcast carry the tray's exact label; renderer `snapshotToActivityName()` prefers the host-resolved field and falls back to the legacy `selectedActivity.title` path when absent. Test-first: 5 new Vitest tests (helper + provider-level divergence/fallback cases in `app/lib/pomodoro/desktop-connection.test.ts`, host get-snapshot-vs-broadcast consistency in `tests/electron/pomodoro-host.test.ts`) failed before implementation. `npm test` 136 passed (14 files), `npm run lint` clean, `tsc --noEmit` clean.
