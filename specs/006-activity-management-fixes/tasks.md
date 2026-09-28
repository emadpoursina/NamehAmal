---
description: "Task list for Activity Management Fixes"
---

# Tasks: Activity Management Fixes

**Input**: Design documents from `specs/006-activity-management-fixes/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/sync-categories.md`

**Tests**: The plan calls for Android unit, Room migration/persistence, Compose UI, and host sync contract tests. Tests are scheduled before each story's implementation.

**Organization**: Tasks are grouped by user story in priority order. Existing Compose, Room, DataStore, and sync infrastructure are reused; no new dependencies or shared project scaffolding are required.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other tasks in the same phase because it touches different files and has no incomplete-task dependency.
- **[Story]**: User story this task belongs to.
- Every task names its target file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure.

No setup tasks: the existing Android, desktop sync, and test infrastructure already supports this feature, and the plan adds no runtime dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared prerequisites that must be complete before user stories.

No separate foundational tasks: changes are story-specific and use the existing app foundation.

---

## Phase 3: User Story 1 - Enter Activity Times with Pickers (Priority: P1) 🎯 MVP

**Goal**: Let Android users enter completed and running activity date-times with device-local pickers, including past completed records, without typing date/time values.

**Independent Test**: Seed an available category, create a completed activity using only date and time pickers, and start a running activity using a picked start date-time; verify saved values, cancellation behavior, local timezone interpretation, and existing validation.

### Tests for User Story 1

- [X] T001 [P] [US1] Add local-time, past-date, positive-duration, and future-running-start validation cases in `android/app/src/test/java/com/namehamal/tracker/domain/SimpleSessionRulesTest.kt`.
- [X] T002 [P] [US1] Add Compose UI checks for opening, confirming, and canceling date/time pickers without shifting the tracking layout in `android/app/src/androidTest/java/com/namehamal/tracker/ui/tracking/TrackingScreenTest.kt`; seed one active category in this test's isolated fixture so its create/start path does not depend on US2 or developer data.

### Implementation for User Story 1

- [X] T003 [US1] Replace editable start/end date-time inputs with Android `DatePickerDialog` and `TimePickerDialog` controls in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt`; update the existing local date-time state only after confirmation and retain title text input.

**Checkpoint**: Completed and running activities accept picker-selected device-local values; dismissing either picker preserves its previous value, and existing range/future-start validation still applies.

---

## Phase 4: User Story 2 - Categorize and Restart Activities (Priority: P1)

**Goal**: Load desktop-owned active categories through explicit sync, require a category for every new Android activity, persist it locally and in upload revisions, and preselect it on restart.

**Independent Test**: With an available category cached, create/start an activity and restart it; verify category persistence and preselection, verify a changed category affects only the new record, and verify missing or unavailable categories block new records.

### Tests for User Story 2

- [X] T004 [P] [US2] Add required-category, category-change, and restart-preselection tests in `android/app/src/test/java/com/namehamal/tracker/ui/tracking/TrackingCategoryTest.kt`.
- [X] T005 [P] [US2] Add Android sync tests for category and Activity metadata parsing/cache refresh, capability gating before upload, and offline cache preservation in `android/app/src/test/java/com/namehamal/tracker/data/sync/CategoryMetadataSyncTest.kt`.
- [X] T006 [P] [US2] Add a real Room v4-to-v5 migration and category-persistence test in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/CategoryMigrationTest.kt`.
- [X] T007 [P] [US2] Add sync-status category/Activity metadata and category-bearing upload/desktop-association contract tests in `tests/contract/sync/category-metadata.test.ts`.

### Implementation for User Story 2

- [X] T008 [P] [US2] Add the Room category snapshot entity and DAO for category ID, name, sort order, archive state, and received time in `android/app/src/main/java/com/namehamal/tracker/data/local/CategorySnapshotEntity.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/CategoryDao.kt`.
- [X] T009 [P] [US2] Add nullable `categoryId` to local session rows in `android/app/src/main/java/com/namehamal/tracker/data/local/TimeIntervalEntity.kt`; `EntryRevisionEntity.categoryId` already exists and is nullable, so keep that field and wire it to new revisions without adding a duplicate column.
- [X] T010 [US2] Register the category table/DAO and nullable session category in Room schema version 5, add the non-destructive v4-to-v5 migration, and export the v5 schema in `android/app/src/main/java/com/namehamal/tracker/data/local/TrackerDatabase.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/DatabaseMigrations.kt`, and `android/app/schemas/com.namehamal.tracker.data.local.TrackerDatabase/5.json`.
- [X] T011 [P] [US2] Extend the existing sync status response with category and Activity metadata capabilities and ordered desktop metadata in `app/api/sync/v1/status/route.ts` and `app/server/sync/prisma-store.ts`.
- [X] T012 [P] [US2] Validate uploaded category IDs against active desktop categories and persist the submitted category association on accepted sessions in `app/server/sync/exchange-service.ts` and `app/server/sync/prisma-store.ts`.
- [X] T013 [US2] Parse and validate status categories and Activities during explicit sync, require both metadata capabilities before upload, refresh both Room caches transactionally (including with no pending events), and preserve the last valid caches on failures in `android/app/src/main/java/com/namehamal/tracker/data/sync/SyncRepository.kt`.
- [X] T014 [US2] Extend the local session repository API to require an active cached category and validate/store an optional selected desktop Activity ID for new sessions in `android/app/src/main/java/com/namehamal/tracker/data/local/SessionRepository.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt`.
- [X] T015 [US2] Copy each new session's category and optional Activity ID into stable upload revisions and serialize them as `entry.categoryId` and `entry.activityId` without changing retry identity in `android/app/src/main/java/com/namehamal/tracker/data/sync/SyncRepository.kt`.
- [X] T016 [US2] Add saved Activity/recent-title selection and required-category validation to the tracking flow, preselect still-active source metadata on restart, keep Start again on logged records only, and leave the prior record unchanged in `TrackingViewModel.kt` and `TrackingScreen.kt`.

**Checkpoint**: A new or restarted record cannot be created without an active category; a selected desktop Activity ID also survives relaunch/upload. Custom titles remain supported, status sync is explicit, and the upload response remains acknowledgement-only.

---

## Phase 5: User Story 3 - Select and Clear Activity Records (Priority: P2)

**Goal**: Select individual or all local activity records, remove selected records, or separately clear all records with confirmation and no desktop deletion.

**Independent Test**: Select a subset, cancel and then confirm its removal; select all and clear selection; finally confirm Clear all while only some rows are selected. Verify cancellations preserve records, confirmed operations remove only their target local rows (including confirmed running rows), and category/settings data remains.

### Tests for User Story 3

- [X] T017 [P] [US3] Add view-model tests for individual selection, Select all, clear selection, confirmation/cancellation, and Clear all independence from selection in `android/app/src/test/java/com/namehamal/tracker/ui/tracking/SessionBulkRemovalTest.kt`.
- [X] T018 [P] [US3] Add Room instrumentation coverage for transactional deletion of selected/all sessions and their revisions, including running rows, while preserving category snapshots and the separately stored saved endpoint preference in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/SessionBulkRemovalTest.kt`.

### Implementation for User Story 3

- [X] T019 [US3] Add repository and DAO operations that transactionally delete specified local session IDs and their revision metadata without creating tombstones, network requests, or changing saved endpoint settings in `android/app/src/main/java/com/namehamal/tracker/data/local/SessionRepository.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/SyncDao.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt`.
- [X] T020 [US3] Add transient selected-ID state, per-row selection, Select all, clear selection, confirmed Remove selected, and separately confirmed Clear all actions targeting every local row in `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingViewModel.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt`.

**Checkpoint**: Selection changes are non-destructive; confirmed selected removal and Clear all are distinct local-only transactions, with running sessions removed only after confirmation.

---

## Phase 6: User Story 4 - Navigate Back from Settings (Priority: P2)

**Goal**: Keep Settings' back control visible below the app/system header without changing the main tracking page layout.

**Independent Test**: At supported screen sizes, open Settings and verify the back control is unobscured and navigates back; return to tracking and verify its existing header/content position is unchanged.

### Tests for User Story 4

- [X] T021 [P] [US4] Add Compose UI checks for Settings top-inset/back-control visibility at compact 360×800 dp and expanded 600×960 dp sizes, and unchanged tracking-screen positioning, in `android/app/src/androidTest/java/com/namehamal/tracker/ui/sync/SyncSettingsScreenTest.kt`; assert the back control is within the content area supplied by Settings' `Scaffold` insets.

### Implementation for User Story 4

- [X] T022 [US4] Wrap Settings content in a `Scaffold` and apply its supplied content padding to the Settings content only, leaving the tracking layout untouched in `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsScreen.kt`.

**Checkpoint**: Settings back navigation is usable below the header, and the main tracking page remains in its existing position.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Run the feature's documented Android, desktop sync, and manual acceptance checks.

- [X] T023 Run Android unit/build checks (`cd android && ./gradlew testDebugUnitTest assembleDebug`), desktop sync contract tests (`npm test`), and lint (`npm run lint`) as listed in `specs/006-activity-management-fixes/quickstart.md`.
- [ ] T024 Run Android Room migration and Compose instrumentation tests on an emulator/device, then execute the Settings at both supported sizes, picker, category/restart, bulk-removal, endpoint-preservation, and sync scenarios in `specs/006-activity-management-fixes/quickstart.md`; verify an uploaded desktop session remains after Android cleanup.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks; existing infrastructure is reused.
- **Foundational (Phase 2)**: No separate tasks; each user story builds on the current app stack.
- **User Stories (Phase 3+)**: Can begin without a shared foundation. Story 1's end-to-end picker check uses a preloaded category fixture because new activities require a category; Story 2 supplies the real category flow.
- **Polish (Phase 7)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Behavior can be implemented/tested independently with a seeded active category. Its end-to-end save/start path uses the required category flow delivered by US2.
- **User Story 2 (P1)**: Depends on its Room v5/category metadata groundwork within the story; it has no semantic dependency on US1. The category selector and picker UI share `TrackingScreen.kt`, so combine those UI edits serially rather than editing that file concurrently.
- **User Story 3 (P2)**: No semantic dependency on US1/US2, but it also extends shared `TrackingScreen.kt` and `TrackingViewModel.kt`; apply its UI changes serially after the earlier tracking-screen changes.
- **User Story 4 (P2)**: Independent of tracking stories; it changes only the Settings screen and its UI test.

### Within Each User Story

- Tests precede implementation.
- Room entities/DAO precede database registration/migration; the category cache precedes category-required session writes.
- Category-bearing session writes precede category revision serialization; repository APIs precede their tracking UI.
- Bulk persistence operations precede the selection/removal UI that invokes them.
- Each story should pass its independent test before moving to the next priority.

### Parallel Opportunities

- **US1**: T001 and T002 can run in parallel; T003 follows both.
- **US2**: T004–T007 can run in parallel. T008 and T009 can run in parallel; T010 follows them. T011 and T012 can run in parallel. T013/T014 follow the database and status work; T015 follows T013 and T014, and T016 follows T014. T015 and T016 can then proceed in parallel, provided edits to shared `TrackingViewModel.kt`/`TrackingScreen.kt` are not concurrent with other story edits.
- **US3**: T017 and T018 can run in parallel; T019 follows both, then T020.
- **US4**: T021 precedes T022.
- **Across stories**: US4 work can run independently of Android tracking work, but shared tracking UI files should be assigned serially to avoid merge conflicts.
- Changes to `TrackingScreen.kt`, `TrackingViewModel.kt`, and `SyncRepository.kt` are serial even when their task IDs are otherwise parallelizable: apply T003 before T016 before T020, and T013 before T015.

## Parallel Example: User Story 1

```bash
# Run domain and UI picker tests together:
Task: "Add local-time and range validation cases in android/app/src/test/java/com/namehamal/tracker/domain/SimpleSessionRulesTest.kt"
Task: "Add picker confirmation/cancellation checks in android/app/src/androidTest/java/com/namehamal/tracker/ui/tracking/TrackingScreenTest.kt"
```

## Parallel Example: User Story 2

```bash
# Start the independent category tests together:
Task: "Add required-category/restart tests in android/app/src/test/java/com/namehamal/tracker/ui/tracking/TrackingCategoryTest.kt"
Task: "Add category sync/cache tests in android/app/src/test/java/com/namehamal/tracker/data/sync/CategoryMetadataSyncTest.kt"
Task: "Add v4-to-v5 migration tests in android/app/src/androidTest/java/com/namehamal/tracker/data/local/CategoryMigrationTest.kt"
Task: "Add host sync contract tests in tests/contract/sync/category-metadata.test.ts"

# After tests, build independent Room model files in parallel:
Task: "Add category snapshot entity and DAO in android/app/src/main/java/com/namehamal/tracker/data/local/CategorySnapshotEntity.kt and CategoryDao.kt"
Task: "Add categoryId to local session and revision entities in android/app/src/main/java/com/namehamal/tracker/data/local/TimeIntervalEntity.kt and EntryRevisionEntity.kt"
```

## Parallel Example: User Story 3

```bash
# Run view-model behavior and Room transaction tests together:
Task: "Add selection/confirmation tests in android/app/src/test/java/com/namehamal/tracker/ui/tracking/SessionBulkRemovalTest.kt"
Task: "Add transactional local-delete tests in android/app/src/androidTest/java/com/namehamal/tracker/data/local/SessionBulkRemovalTest.kt"
```

## Parallel Example: User Story 4

No parallel tasks are available: T021 is the single independent Settings UI test and must precede T022's implementation.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete the picker/domain tests and the platform picker UI in Phase 3.
2. Validate picker confirmation/cancellation, device-local time, past completed records, and existing range/future-start rules with a seeded category.
3. Complete US2 before demonstrating the real create/start flow, because the accepted specification requires an available category for every new activity.

### Incremental Delivery

1. Deliver US1 picker-based date/time entry.
2. Add US2 category refresh, required assignment, restart preselection, and upload association.
3. Add US3 local-only selected removal and Clear all.
4. Add US4 Settings inset correction without moving the main tracking screen.
5. Run the automated and manual checks in `quickstart.md`.

### Parallel Team Strategy

1. Run a story's independent tests in parallel where marked `[P]`.
2. In US2, split Room model/migration work from host status/exchange contract work, then integrate Android sync/repository and tracking UI.
3. Assign tracking-screen and tracking-view-model edits serially across US1–US3; Settings work can proceed separately.

## Notes

- `[P]` tasks touch separate files and have no dependency on unfinished tasks.
- Every user-story task is labeled `[US1]` through `[US4]` and names its target file path.
- Room migration must preserve existing records and endpoint settings; category metadata remains separate from desktop session downloads.
- Android record removal is physical/local-only and must not enqueue a deletion, tombstone, or host request.
