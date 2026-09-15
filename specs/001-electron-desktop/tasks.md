---

description: "Dependency-ordered implementation tasks for the Electron macOS desktop conversion"
---

# Tasks: Electron Desktop App

**Input**: Design documents from `/specs/001-electron-desktop/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Scope**: Package the existing Next.js application inside Electron for supported macOS systems. Keep the existing `app/` pages, route handlers, Prisma schema, migrations, and JSON backup behavior as the product surface unless a packaged-runtime defect requires a focused compatibility fix.

**Test approach**: Add focused Electron/runtime and packaged-app tests requested by the plan, then run the existing Vitest, lint, and production-build checks plus the manual macOS acceptance sequence in `quickstart.md`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the desktop toolchain and build structure without changing application behavior.

- [X] T001 [P] Pin Electron and electron-builder dependencies, add `desktop:dev`, `desktop:prepare`, `desktop:dist`, and Electron compilation scripts, and align package metadata in `package.json` and `package-lock.json`
- [X] T002 [P] Create the emitted Electron TypeScript configuration in `tsconfig.electron.json` with strict checking, Node types, and a dedicated output directory that does not affect the existing Next.js `tsconfig.json`
- [X] T003 [P] Configure architecture-specific DMG/ZIP targets, stable application identity, packaged resources, ASAR/native-module handling, and artifact names in `electron-builder.yml`
- [X] T004 [P] Add the macOS entitlements baseline for unsigned, ad-hoc, signed, and notarized builds in `build/entitlements.mac.plist`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the runtime boundary that every user story depends on.

**⚠️ CRITICAL**: No user-story packaging or acceptance work can begin until this phase is complete.

- [X] T005 Implement deterministic desktop runtime paths and environment construction in `electron/runtime-config.ts`, including `127.0.0.1`, port `3060`, Electron `userData`, `nameh-amal.db`, migration paths, standalone paths, and a test-only profile override
- [X] T006 Implement migration-before-server startup, loopback child-process launch, `/api/settings` readiness polling, bounded startup timeout, child-log capture, crash detection, and bounded shutdown in `electron/server-process.ts`
- [X] T007 Implement the Electron main-process lifecycle in `electron/main.ts`, including the single-instance lock, focus/reactivation behavior, secure `BrowserWindow` options, exact-origin navigation restrictions, denied new windows, actionable native startup errors, and cleanup on `before-quit`
- [X] T008 Implement local development launch and standalone-runtime staging in `scripts/desktop-dev.mjs` and `scripts/prepare-desktop-runtime.mjs`, including the Next production build, `public/`, `.next/static/`, `server.js`, Prisma migrations/config, and required native/runtime-file checks
- [X] T009 [P] Add runtime path and environment tests in `tests/electron/runtime-config.test.ts` covering development versus packaged paths, absolute database URLs, loopback settings, and profile overrides
- [X] T010 [P] Add server lifecycle tests in `tests/electron/server-process.test.ts` covering migration ordering, readiness success, timeout, port conflict, child crash, migration failure, log placement, and normal/forced shutdown
- [X] T011 Add an explicit packaged-runtime error contract in `electron/server-process.ts` and `electron/main.ts` so unreadable/unwritable storage, migration failures, port conflicts, server crashes, and readiness timeouts expose the database path or recovery action and never report the app as ready
- [X] T012 Verify the existing Prisma schema and migration history remain authoritative in `prisma/schema.prisma`, `prisma.config.ts`, and `prisma/migrations/`; do not add `db push`, reset, copied app-bundle databases, or undocumented schema changes

**Checkpoint**: The host can deterministically prepare a per-user database, start the standalone server on loopback, load only the trusted origin, and stop without orphaning the server.

---

## Phase 3: User Story 1 - Install and open the desktop app (Priority: P1) 🎯 MVP

**Goal**: A user can install a macOS package, open the Dashboard without a terminal/browser/server setup, retain local data, and use core workflows offline.

**Independent Test**: Build an architecture-specific unpacked/package artifact, launch it with a clean profile, confirm the Dashboard appears only after migration and readiness succeed, restart it with the same profile, and repeat with network access disabled.

### Tests for User Story 1

- [X] T013 [P] [US1] Add packaged-app smoke coverage in `tests/electron/packaged-app.test.ts` for standalone `server.js`, static/public assets, Prisma migration creation, native `better-sqlite3` loading, loopback readiness, and Dashboard launch
- [X] T014 [US1] Extend `tests/electron/packaged-app.test.ts` to verify a clean profile opens without a browser or separate service, reuses the same database across relaunches, rejects an occupied port, and does not connect to an unrelated process

### Implementation for User Story 1

- [X] T015 [US1] Wire `desktop:prepare` and Electron compilation into the architecture-specific `desktop:dist` flow in `package.json` and `scripts/prepare-desktop-runtime.mjs`, failing the build when `server.js`, static assets, Prisma migrations, or required native files are missing
- [X] T016 [US1] Complete macOS DMG/ZIP resource wiring and architecture-labelled output in `electron-builder.yml`, including Prisma schema/migrations/engines and native SQLite files outside ASAR when required
- [X] T017 [US1] Document supported macOS versions, `arm64`/`x64` artifacts, installation, data location, first-launch migration, existing-profile export/import migration, unsigned/ad-hoc limitations, and signing/notarization prerequisites in `docs/desktop-macos.md`
- [X] T018 [US1] Update `README.md` with desktop prerequisites, development launch, local artifact commands, and a link to `docs/desktop-macos.md` while preserving the existing web/Docker instructions

**Checkpoint**: A clean supported Mac can install and open the packaged app in under two minutes, and a relaunch preserves local records without internet access.

---

## Phase 4: User Story 2 - Continue daily time tracking (Priority: P1)

**Goal**: Manual sessions, one live timer, timer recovery, and session actions continue to work through the packaged application.

**Independent Test**: In a fresh packaged profile with one category, create a manual session, start a backdated live timer, close/reopen, stop it once, and verify both finalized records and their durations.

### Tests for User Story 2

- [X] T019 [P] [US2] Extend `tests/electron/packaged-app.test.ts` to exercise manual-session creation, live-timer start/stop, optional metadata, elapsed duration, and finalized-session persistence through the existing `/api/sessions` and `/api/tracker` routes
- [X] T020 [P] [US2] Add restart and duplicate-prevention coverage in `tests/electron/packaged-app.test.ts` for an active timer, including exactly one finalized session after stop and rejection of a second concurrent timer

### Implementation for User Story 2

- [X] T021 [US2] Verify the packaged server preserves the existing session and tracker contracts in `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/api/tracker/route.ts`, and `app/server/db.ts`; make only focused fixes for desktop database-path, shutdown, or error-propagation regressions
- [X] T022 [US2] Verify Dashboard session workflows remain wired to the unchanged APIs in `app/page.tsx`, `app/dashboard/TrackerCard.tsx`, `app/dashboard/EditSessionDialog.tsx`, and `app/dashboard/SessionsTable.tsx`, including edit, delete, and Record again behavior
- [ ] T023 [US2] Run the manual timer recovery and session-action sequence from `specs/001-electron-desktop/quickstart.md` against the packaged app and record any required expected-result clarifications in that file

**Checkpoint**: Closing and reopening during a live timer does not lose or duplicate the authoritative SQLite draft, and stopping it creates one finalized session.

---

## Phase 5: User Story 3 - Organize and review recorded time (Priority: P1)

**Goal**: Dashboard filters, Stats, categories, activity presets, timezone handling, and historical review remain trustworthy in the desktop profile.

**Independent Test**: Create sessions across dates and categories, navigate adjacent days, inspect Stats ranges and weekly targets, archive/delete categories appropriately, and manage activity presets while confirming historical records remain readable.

### Tests for User Story 3

- [X] T024 [P] [US3] Extend `tests/electron/packaged-app.test.ts` with API-level packaged-profile coverage for category filters, adjacent-day session ranges, Stats totals/percentages, custom ranges, and weekly targets
- [X] T025 [P] [US3] Add packaged-profile checks in `tests/electron/packaged-app.test.ts` for category archive/delete rules, activity preset search/order/archive/restore behavior, and historical-session preservation
- [X] T026 [P] [US3] Add timezone and daylight-saving boundary coverage in `tests/electron/packaged-app.test.ts` using the configured default timezone and per-session IANA timezone fields

### Implementation for User Story 3

- [X] T027 [US3] Verify the unchanged category, activity, session, settings, and Stats route contracts in `app/api/categories/route.ts`, `app/api/categories/[id]/route.ts`, `app/api/activities/route.ts`, `app/api/activities/[id]/route.ts`, `app/api/sessions/route.ts`, `app/api/sessions/[id]/route.ts`, `app/api/settings/route.ts`, and `app/api/stats/categories/route.ts` against `specs/001-electron-desktop/contracts/http-api.md`
- [X] T028 [US3] Verify the Dashboard, Stats, Settings, category, activity, and timezone UI paths in `app/page.tsx`, `app/stats/page.tsx`, `app/stats/StatsFilters.tsx`, `app/settings/page.tsx`, `app/settings/ActivityManager.tsx`, `app/components/ActivityCombobox.tsx`, and `app/dashboard/DashboardFilters.tsx` still use relative same-origin requests and do not depend on an external network
- [ ] T029 [US3] Execute the filtering, weekly-target, archive/restore, preset, timezone, and DST acceptance sequence from `specs/001-electron-desktop/quickstart.md` against a packaged clean profile

**Checkpoint**: Historical records remain visible and correctly attributed while archived records leave new-entry choices, date boundaries honor the configured timezone, and Stats totals match the selected range.

---

## Phase 6: User Story 4 - Protect and move local data (Priority: P2)

**Goal**: Users can export a versioned backup, merge it into another profile, and receive safe errors without partial writes.

**Independent Test**: Export a populated profile, import it into an empty packaged profile, compare categories/targets/sessions, then try malformed, unsupported, unreadable, duplicate, and partially invalid files.

### Tests for User Story 4

- [X] T030 [P] [US4] Extend `tests/electron/packaged-app.test.ts` for versioned JSON export, category-name merge, weekly-target updates, session creation, warning reporting, and duplicate-session compatibility
- [X] T031 [P] [US4] Add failure-path coverage in `tests/electron/packaged-app.test.ts` for malformed, unreadable, unsupported, partially invalid, and transaction-failing imports, asserting existing data is unchanged and no failed operation reports success
- [X] T032 [US4] Add a generated 1,000-session backup case to `tests/electron/packaged-app.test.ts` or the smallest existing test helper, verifying valid-record accounting and warning reporting without committing fixture secrets or oversized static data

### Implementation for User Story 4

- [X] T033 [US4] Verify export/import behavior remains compatible in `app/api/data/export/route.ts`, `app/api/data/import/route.ts`, and the existing import/export helpers, including version 1/version 2 parsing, transaction atomicity, and current duplicate-session behavior
- [X] T034 [US4] Document the supported lossless web/development-to-desktop migration path and the boundary that browser-local Pomodoro keys are not included in backup JSON in `docs/desktop-macos.md` and `specs/001-electron-desktop/quickstart.md`

**Checkpoint**: A valid backup transfers supported local records, while invalid or interrupted import/export work leaves local data consistent and reports an actionable failure.

---

## Phase 7: User Story 5 - Use the built-in focus timer (Priority: P2)

**Goal**: Pomodoro remains available on the fixed loopback origin with phase controls and supported local persistence.

**Independent Test**: Open Pomodoro in the packaged app, start/stop/skip phases, change focus/rest/interval settings, quit and reopen, and confirm settings and supported run state return.

### Tests for User Story 5

- [ ] T035 [P] [US5] Extend `tests/electron/packaged-app.test.ts` or the existing Pomodoro tests in `app/lib/pomodoro/` to verify the packaged `/pomodoro` page, phase controls, and fixed-origin local persistence
- [ ] T036 [P] [US5] Add a packaged restart check for `nameh-amal:pomodoro:settings` and `nameh-amal:pomodoro:run`, confirming the stable `http://127.0.0.1:3060` origin does not reset supported local state

### Implementation for User Story 5

- [X] T037 [US5] Verify `app/pomodoro/PomodoroView.tsx`, `app/lib/pomodoro/engine.ts`, `app/lib/pomodoro/storage.ts`, and `app/lib/pomodoro/phase-labels.ts` require no native bridge and retain start, stop, skip, phase-transition, and settings behavior in the packaged renderer
- [ ] T038 [US5] Run the Pomodoro acceptance sequence from `specs/001-electron-desktop/quickstart.md` on the packaged app with the network disabled and document any supported-state limitations

**Checkpoint**: Pomodoro controls work offline and saved settings/run state survive a desktop relaunch because the renderer origin remains stable.

---

## Phase 8: Polish, Compatibility, and Release Readiness

**Purpose**: Validate the complete conversion, update project history, and produce distributable artifacts.

- [X] T039 [P] Add explicit close/shutdown and in-progress-operation checks to `tests/electron/server-process.test.ts` and `tests/electron/packaged-app.test.ts`, confirming save/import/export either completes safely or reports incomplete work
- [X] T040 [P] Add the full local-storage, migration, port-conflict, server-crash, and readiness-timeout recovery instructions and expected errors to `docs/desktop-macos.md`
- [X] T041 Run `npm test`, `npm run lint`, `npm run build`, `npm run desktop:prepare`, and the focused Electron tests; fix only conversion-related failures in the touched files
- [ ] T042 Build an unpacked packaged app with a disposable profile and run the clean-install, migration, native SQLite, restart, active-timer, offline, failed-import, and ten-restart checks from `specs/001-electron-desktop/quickstart.md`
- [X] T043 Build and inspect both `arm64` and `x64` DMG/ZIP artifacts with `npm run desktop:dist -- --mac --arm64` and `npm run desktop:dist -- --mac --x64`, confirming architecture-labelled outputs in `release/`
- [X] T044 When release credentials are available, verify signed/notarized artifacts with `codesign`, `spctl`, and `xcrun stapler`; otherwise label local outputs unsigned/ad-hoc and do not commit credentials in `build/` or documentation
- [X] T045 Update `package.json` and `CHANGELOG.md` with the delivered semantic version and a real Electron desktop release entry covering packaging, persistence, migration, offline support, tests, and documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No implementation dependencies; T001–T004 can proceed in parallel.
- **Foundational (Phase 2)**: Depends on Setup; T005 precedes T006, T006 precedes T007, and T008 can proceed after T001–T003 while runtime modules are developed. T009–T010 depend on the modules they test. T011–T012 depend on the runtime design and existing Prisma configuration.
- **User Stories (Phases 3–7)**: Depend on the foundational checkpoint. US1 packaging must complete before packaged-app tests for the later stories. US2 and US3 can proceed in parallel after US1's packaged harness exists; US4 and US5 can then proceed independently.
- **Polish (Phase 8)**: Depends on the desired user stories and their checkpoints; T041–T044 are the final verification gate, and T045 records the delivered change set.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2; no other story dependency. This is the MVP scope.
- **US2 (P1)**: Depends on the US1 packaged launch harness and the Phase 2 server lifecycle.
- **US3 (P1)**: Depends on the US1 packaged launch harness and the existing HTTP API; it is independent of US2 data behavior beyond shared session persistence.
- **US4 (P2)**: Depends on the US1 packaged profile and the existing data routes; it is independent of US2/US3 UI work.
- **US5 (P2)**: Depends on the US1 fixed-origin BrowserWindow and packaged launch; it is independent of the database stories because Pomodoro state is renderer-local.

### Parallel Opportunities

- T001–T004 can run in parallel during Setup.
- T009 and T010 can run in parallel after T005–T007 are available.
- T013–T014 can run in parallel once the packaged runtime can be built.
- T019–T020, T024–T026, T030–T032, and T035–T036 can each run in parallel when they touch separate test sections or helpers; coordinate edits to the shared `tests/electron/packaged-app.test.ts`.
- After US1, US2, US3, US4, and US5 can be assigned to separate workers because their acceptance surfaces are distinct.
- T039–T040 can run in parallel with final story acceptance, while T041–T044 must run after implementation is integrated.

## Parallel Example: User Story 1

```text
Worker A: T013 packaged-app smoke coverage in tests/electron/packaged-app.test.ts
Worker B: T015 desktop:dist wiring in package.json and scripts/prepare-desktop-runtime.mjs
Worker C: T017 macOS installation and migration documentation in docs/desktop-macos.md
```

## Parallel Example: User Stories 2–5

```text
Worker A: US2 timer/session packaged checks and API compatibility
Worker B: US3 filters, Stats, category, activity, and timezone checks
Worker C: US4 backup/import/export and 1,000-session checks
Worker D: US5 Pomodoro fixed-origin persistence checks
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 Setup.
2. Complete Phase 2 Foundational runtime and security work.
3. Complete Phase 3 US1 packaging, clean-profile smoke checks, and macOS documentation.
4. Stop and validate installation, launch, persistence, and offline Dashboard access using the exact packaged artifact.
5. Only distribute after the unpacked smoke test and architecture-specific package checks pass.

### Incremental Delivery

1. Add US2 and validate manual/live tracking plus active-timer recovery.
2. Add US3 and validate review, organization, timezone, and Stats behavior.
3. Add US4 and validate backup/restore, failure safety, and the 1,000-session case.
4. Add US5 and validate Pomodoro controls and stable-origin persistence.
5. Run Phase 8 as the release gate and update the changelog only for the real delivered version.

## Verification Criteria

- Every task has the required `- [ ]` checkbox, sequential `T###` ID, `[P]` marker only where parallel work is safe, and `[US#]` label on user-story tasks.
- Every implementation and test task names an exact repository path.
- Each user story has a goal, independent test, implementation/compatibility work, and a checkpoint.
- The dependency graph preserves the plan's E0 → E1 → E2 runtime order, allows independent packaging work, and reserves final packaged verification for the end.
- The MVP is independently installable and usable without a terminal, browser, separate service, account, cloud sync, or internet connection.
- Runtime failures never present a stale or falsely successful application, and local data remains outside the installed app bundle.

---

## Phase 9: Convergence

**Purpose**: Close remaining automatable packaged-runtime gaps found against the spec and plan. Do not rewrite existing open tasks. Manual packaged UI sequences in T023, T029, T038, and T042 stay as human acceptance.

- [X] T046 [P] [US1] Extend `tests/electron/packaged-app.test.ts` so a clean profile is migrated once, stopped, and relaunched against the same `nameh-amal.db`, and so an occupied loopback port fails closed instead of attaching to an unrelated process per US1/AC2
- [X] T047 [P] [US2] Extend `tests/electron/packaged-app.test.ts` to recover one active TIMER after a staged-server restart, reject a second concurrent start, and create exactly one finalized session on stop per US2/AC4 and FR-006
- [X] T048 [P] [US3] Extend `tests/electron/packaged-app.test.ts` with adjacent-day session ranges, Monday-through-Sunday weekly-target comparison inputs, and historical sessions remaining readable after category archive per US3/AC1, US3/AC3, and US3/AC4
- [X] T049 [P] [US4] Extend `tests/electron/packaged-app.test.ts` to import a versioned backup that merges categories by name, updates included weekly targets, creates sessions, reports warnings, and retains duplicate-session compatibility on a second import per US4/AC2 and FR-012
- [X] T050 [P] [US4] Extend `tests/electron/packaged-app.test.ts` with malformed, unreadable, partially invalid, and transaction-failing import bodies that leave existing rows unchanged and never report success per US4/AC3 and FR-015
- [X] T051 Extend `tests/electron/server-process.test.ts` and `tests/electron/packaged-app.test.ts` so an in-progress save/import/export either finishes inside the Prisma transaction or surfaces an incomplete/failed result instead of success per spec edge case close-during-operation and plan Phase 2 close/shutdown

