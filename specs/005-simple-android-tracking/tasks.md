---
description: "Task list for simplified Android tracking"
---

# Tasks: Simplified Android Tracking

**Input**: Design documents from `specs/005-simple-android-tracking/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/sync-api.md`

**Tests**: Included because the plan and project constitution require coverage of the Room migration, session lifecycle/time handling, and sync acknowledgement behavior. Write and run each story's tests before its implementation tasks.

**Organization**: Tasks are grouped by user story to support incremental implementation. The repository already has the Android module and sync host; no new module or runtime dependency is needed.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

The existing Android module, Compose/Room/DataStore dependencies, desktop sync routes, and test targets are already initialized. No setup task is required; the Room migration in Phase 2 is the shared prerequisite.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the shared Room fields and preserve existing installations before any story changes the event workflow.

- [X] T001 Add Room instrumentation coverage for v3-to-v4 migration, including legacy titles, open intervals, revision rows, and preserved timestamps, in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/DatabaseMigrationTest.kt`
- [X] T002 Add the event title and local sync-acknowledgement field to `TimeIntervalEntity` and persist revision titles in `android/app/src/main/java/com/namehamal/tracker/data/local/TimeIntervalEntity.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/EntryRevisionEntity.kt`
- [X] T003 Implement additive `MIGRATION_3_4`, backfill titles from activity snapshots (including Break/Unassigned fallbacks), and preserve existing sync and interval rows in `android/app/src/main/java/com/namehamal/tracker/data/local/DatabaseMigrations.kt`
- [X] T004 Set the Room schema version to 4 and register `MIGRATION_3_4` in `android/app/src/main/java/com/namehamal/tracker/data/local/TrackerDatabase.kt`

**Checkpoint**: Existing v3 Android data remains readable in v4, with a title and sync marker available for every event.

---

## Phase 3: User Story 1 - Record an Activity Simply (Priority: P1) 🎯 MVP

**Goal**: Let a user save a completed local session or start and stop one running session directly, with local-time inputs and no workday, break, or check-in workflow.

**Independent Test**: Save a titled completed event with past local start/end times, then start and stop a titled running event; verify valid times and titles persist, invalid/blank/future inputs are rejected, and an existing running event is never replaced.

### Tests for User Story 1

- [X] T005 [P] [US1] Add unit tests for blank titles, positive completed intervals, future running starts, and the one-running-session rule in `android/app/src/test/java/com/namehamal/tracker/domain/SimpleSessionRulesTest.kt`
- [X] T006 [P] [US1] Add Room persistence tests for completed and running sessions, device-local timezone metadata, and reopening the database in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/SimpleSessionPersistenceTest.kt`

### Implementation for User Story 1

- [X] T007 [US1] Implement title, interval, future-start, and local-time validation rules in `android/app/src/main/java/com/namehamal/tracker/domain/SessionRules.kt`
- [X] T008 [US1] Add transactional manual-create/start/stop operations for workday-independent events and a cross-workday active-session query in `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt`
- [X] T009 [US1] Add tracking state for local date/time inputs, running-session elapsed time, validation feedback, and repository actions in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingViewModel.kt`
- [X] T010 [US1] Build the direct completed-session form and running-session Start/Stop controls with actionable validation messages in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt`
- [X] T011 [US1] Launch the tracking screen instead of the Today/Timeline/check-in/split workflows, remove active `WorkdayController` wiring, and cancel legacy scheduled check-ins on startup in `android/app/src/main/java/com/namehamal/tracker/MainActivity.kt`, `android/app/src/main/java/com/namehamal/tracker/TrackerApplication.kt`, and `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInScheduler.kt`

**Checkpoint**: A user can create, start, stop, and reopen local events without a server or retired tracking flows.

---

## Phase 4: User Story 2 - Restart a Previous Activity and Review Events (Priority: P2)

**Goal**: Show one all-dates event feed newest first and let users restart a prior title without changing its earlier event.

**Independent Test**: Seed or record events on different dates, restart a prior title, and verify a new running event is created while the feed has deterministic descending start-time order and retains an open session after reopening.

### Tests for User Story 2

- [X] T012 [P] [US2] Add tests for newest-first ordering, stable equal-time ordering, title suggestions, and Start again creating a distinct event in `android/app/src/test/java/com/namehamal/tracker/domain/PreviousActivityAndFeedTest.kt`

### Implementation for User Story 2

- [X] T013 [US2] Derive distinct nonblank prior titles by most-recent use and order the all-events query by `startedAt DESC, entryId DESC` in `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt`
- [X] T014 [US2] Render the all-dates feed, recompute a running event's elapsed time from its persisted start, and add a Start again action that creates a new event in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingViewModel.kt`

**Checkpoint**: Users can find recent and past records in one stable feed and restart a prior title without editing history.

---

## Phase 5: User Story 3 - Remove Unwanted Sessions (Priority: P2)

**Goal**: Confirm before removing one local event or clearing locally stored events already marked synced; cancellation must leave local state unchanged.

**Independent Test**: Confirm removal of a selected event, cancel a second removal, remove a running event only after confirmation, then clear seeded synced events; verify pending events remain and all confirmed local removals persist after reopening.

### Tests for User Story 3

- [X] T015 [P] [US3] Add ViewModel tests proving cancel leaves completed/running events unchanged and confirmation invokes removal in `android/app/src/test/java/com/namehamal/tracker/ui/tracking/SessionRemovalTest.kt`
- [X] T016 [P] [US3] Add Room tests proving single removal deletes the local event and its revisions, while clear-synced removes only acknowledged events in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/SessionRemovalPersistenceTest.kt`

### Implementation for User Story 3

- [X] T017 [US3] Add transactional physical deletion of an event and its phone-side revisions plus a query that clears only rows with `syncedAt IS NOT NULL` in `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/SyncDao.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt`
- [X] T018 [US3] Add single-event and clear-synced confirmation dialogs; invoke local removal only on confirmation and keep a running event active on cancel in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingViewModel.kt`

**Checkpoint**: Confirmed removals affect Android storage only; canceling never changes an event, and pending events survive bulk cleanup.

---

## Phase 6: User Story 4 - Save Server Connection Information (Priority: P3)

**Goal**: Persist a valid host and port, keep local tracking available offline, and provide explicit upload-only sync that retains titles and acknowledges only successfully sent events.

**Independent Test**: Save and reopen valid endpoint settings, reject invalid edits without replacing them, manually upload a completed titled event to a compatible host, verify only accepted events are marked synced, retry without duplicates, and remove/clear locally without deleting the desktop copy.

### Tests for User Story 4

- [X] T019 [P] [US4] Extend host contract tests for advertised capabilities, upload-only acknowledgements, title projection, idempotent retry, and absence of download/deletion behavior in `tests/contract/sync/sync-api.test.ts`
- [X] T020 [P] [US4] Add endpoint tests for valid IP/hostname and port persistence, invalid-edit retention, and rejection of non-private resolved destinations in `android/app/src/test/java/com/namehamal/tracker/data/sync/EndpointAndRetryTest.kt`
- [X] T021 [P] [US4] Add Android sync tests for capability gating, upload-only title serialization, stable retries, partial acknowledgements, and preservation of unaccepted local events in `android/app/src/test/java/com/namehamal/tracker/data/sync/UploadOnlySyncTest.kt`

### Implementation for User Story 4

- [X] T022 [P] [US4] Allow offline saving of a non-empty IP address or hostname with a whole-number port from 1 through 65535, preserve the previous valid endpoint on invalid input, and enforce private-destination DNS resolution only when connecting in `android/app/src/main/java/com/namehamal/tracker/data/sync/SavedDesktopEndpoint.kt` and `android/app/src/main/java/com/namehamal/tracker/data/sync/AndroidSyncApi.kt`
- [X] T023 [P] [US4] Advertise `entry-title` and `upload-only` in the status response and validate the optional `UPLOAD_ONLY` mode and its required nonblank entry title without changing legacy requests in `app/api/sync/v1/status/route.ts` and `app/server/sync/validation.ts`
- [X] T024 [P] [US4] Require both host capabilities before upload, send only completed titled events in `UPLOAD_ONLY` mode, and atomically set `syncedAt` only for accepted revision IDs without applying downloaded rows in `android/app/src/main/java/com/namehamal/tracker/data/sync/SyncRepository.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/SyncDao.kt`
- [X] T025 [P] [US4] Preserve legacy bidirectional behavior when mode is omitted and return acknowledgements only (no host revisions, activities, conflicts, or resolutions) for `UPLOAD_ONLY` exchanges in `app/server/sync/exchange-service.ts`
- [X] T026 [P] [US4] Project a title-only Android event into the existing `Session.title` with its stable sync ID and Unassigned category fallback, preserving idempotence and making no schema change in `app/server/sync/prisma-store.ts`
- [X] T027 [US4] Connect saved endpoint settings and the explicit Sync action to the tracking surface, and show success/failure while keeping local events usable in `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsViewModel.kt`, `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsScreen.kt`, and `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt`

**Checkpoint**: A manual upload to a compatible trusted-LAN host preserves titles, marks only acknowledged records synced, and never propagates Android removal as a desktop deletion.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Align operator documentation and verify the end-to-end feature across Android and desktop host boundaries.

- [X] T028 Update the manual scenarios and expected screens/commands to match the implemented event feed, endpoint settings, upload-only cleanup, and migration in `specs/005-simple-android-tracking/quickstart.md`
- [ ] T029 Run the Android unit/build/instrumentation checks and root host test/lint commands listed in `specs/005-simple-android-tracking/quickstart.md`, using throwaway test databases

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Existing Android and host projects are initialized; no new setup work is required.
- **Foundational (Phase 2)**: Complete T001–T004 before any story; the Room migration preserves current installations and adds fields shared by all stories.
- **User Stories (Phase 3+)**: US1 follows the foundation. US2 and US3 follow US1 and can be implemented independently at the product level, though their edits to the tracking screen/repository should be serialized if handled by one developer. US4 follows US1 and US3 for the complete upload-and-local-cleanup scenario.
- **Polish (Phase 7)**: Depends on the desired stories and all their checks being complete.

### User Story Dependencies

- **US1 (P1)**: After Phase 2; no dependency on another story. MVP.
- **US2 (P2)**: After US1's event creation and tracking surface.
- **US3 (P2)**: After US1's event model and tracking surface. Its clear-synced behavior can be tested with seeded acknowledged rows before US4 is integrated.
- **US4 (P3)**: After Phase 2 and US1; complete end-to-end local cleanup verification after US3.

### Parallel Opportunities

- T005 and T006 can be authored/run in parallel after the foundation because they use separate unit and instrumentation test files.
- Once US1 is complete, T012 can be authored alongside US3's T015/T016 and US4's host contract test T019; these use separate files.
- T015 and T016 can run in parallel (ViewModel behavior versus Room persistence).
- T019, T020, and T021 can be developed in parallel (host contract, endpoint, and upload protocol test files).
- After T023, T025 and T026 can be implemented in parallel because exchange policy and Prisma session projection are in separate files.
- US2 and US3 can be split between contributors only if their shared tracking UI/repository edits are coordinated.

## Parallel Example: User Story 1

```text
Task: T005 Add title/time validation and one-running-session unit tests in SimpleSessionRulesTest.kt
Task: T006 Add Room persistence and timezone instrumentation tests in SimpleSessionPersistenceTest.kt

After both test tasks fail against the current implementation, complete T007 through T011 in dependency order.
```

## Parallel Example: User Story 2

```text
After US1, author/run T012 alongside T015/T016 and T019; each task uses a different test file.
Then complete T013 before T014 so feed/title queries are available to the UI.
```

## Parallel Example: User Story 3

```text
Task: T015 Add removal confirmation/cancel ViewModel tests in SessionRemovalTest.kt
Task: T016 Add local deletion and clear-synced Room tests in SessionRemovalPersistenceTest.kt

After both tests fail, complete T017 before T018.
```

## Parallel Example: User Story 4

```text
Task: T019 Add upload-only host contract tests in tests/contract/sync/sync-api.test.ts
Task: T020 Add endpoint validation/persistence tests in EndpointAndRetryTest.kt
Task: T021 Add upload-only client acknowledgement tests in UploadOnlySyncTest.kt

After the tests fail, implement T022 and T023 independently. After T023, T025 and T026 can proceed in parallel; complete T024 and T027 before end-to-end validation.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2 and verify the v3-to-v4 migration.
2. Complete Phase 3 (US1): direct manual entry and start/stop.
3. Validate offline creation, invalid-input handling, timezone behavior, and persistence independently.
4. Stop for review/demo; no sync setup is required for the MVP.

### Incremental Delivery

1. Add US2 for prior-title reuse and the all-events feed.
2. Add US3 for confirmed local removal and cleanup of seeded acknowledged events.
3. Add US4 for endpoint settings and explicit upload-only sync.
4. Run the quickstart scenarios and full Android/host checks after the selected stories.

## Notes

- Every task uses the required checkbox/ID format; story tasks carry their `[US#]` label and a concrete source, test, or documentation path.
- `[P]` is used only for tasks in separate files that can proceed without waiting on an incomplete task.
- Tests are listed before their story implementation tasks; verify they fail before implementing the corresponding behavior.
- Android user removal physically deletes local event/revision rows. It must never create or transmit a deletion revision or `deletedAt` tombstone.
