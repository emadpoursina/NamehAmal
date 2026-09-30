---

description: "Task list for Android Notification Reminder Settings"
---

# Tasks: Android Notification Reminder Settings

**Input**: Design documents from `/specs/007-android-notification-settings/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included. The feature plan (Testing section) and research decision 9 explicitly define a test strategy, and constitution Principle IV (Test-First with Real Dependencies) requires coverage of the schedule algorithm, the settings store, the ViewModel, the WorkManager chain, and the Compose screens. Write the listed tests first and confirm they fail before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- All paths are relative to the repository root; the Android module root is `android/`.

## Path Conventions

- Single existing Android app module: `android/app/src/main/java/com/namehamal/tracker/`
- Unit tests: `android/app/src/test/java/com/namehamal/tracker/`
- Instrumentation tests: `android/app/src/androidTest/java/com/namehamal/tracker/`
- No desktop, Prisma, or Next.js path is touched by this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare the Android module for the new packages and confirm the existing toolchain covers the feature.

- [X] T001 Create the new package directories for this feature: `android/app/src/main/java/com/namehamal/tracker/data/settings/`, `android/app/src/main/java/com/namehamal/tracker/ui/settings/`, plus the matching `data/settings/`, `ui/settings/`, and `notifications/` directories under `android/app/src/test/java/com/namehamal/tracker/` and `android/app/src/androidTest/java/com/namehamal/tracker/`
- [X] T002 [P] Confirm no new Gradle dependency is required: verify `android/app/build.gradle.kts` already declares DataStore, WorkManager (`work-runtime-ktx`), `work-testing`, and coroutines-test, and check `android/gradle/libs.versions.toml` for their entries
- [X] T003 [P] Baseline the Android unit suite before changes with `cd android && ./gradlew testDebugUnitTest` and record the current pass state

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, the pure scheduling math, the shared notification/permission helpers, and retirement of the session-bound reminder path. No user story can be implemented until this phase is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Add `ReminderCycle` presets (`MINUTES_15`, `MINUTES_30`, `HOUR_1` default, `HOURS_2`, `HOURS_3`) and the `ReminderSettings` value type with defaults (`enabled=false`, `intervalMinutes=60`, `windowStartMinutes=540`, `windowEndMinutes=1380`) and preset/range validation in `android/app/src/main/java/com/namehamal/tracker/data/settings/ReminderSettings.kt`
- [X] T005 [P] Implement `ReminderSettingsStore` backed by `preferencesDataStore("reminder_settings")` with keys `enabled`, `interval_minutes`, `window_start_minutes`, `window_end_minutes`, a `Flow<ReminderSettings>`, suspend save methods, and fallback-to-default on invalid stored values in `android/app/src/main/java/com/namehamal/tracker/data/settings/ReminderSettingsStore.kt`
- [X] T006 [P] Implement the pure `ReminderSchedule` object: given `now: ZonedDateTime`, window start/end minutes, and interval, return the next trigger `Instant?` using the `[start, end)` local-time window, cycle anchored at the window opening (`open + interval`), overnight wrap, empty window (`start == end`) yielding no trigger, and a window shorter than one interval yielding nothing, in `android/app/src/main/java/com/namehamal/tracker/notifications/ReminderSchedule.kt`
- [X] T007 [P] Implement `ReminderNotification` with the `reminders` channel, neutral title `Time check-in`, neutral body that names no tracked activity, exactly one `Open app` action launching `MainActivity`, and a `canNotify`/post entry point reused by both the cycle worker and the test trigger, in `android/app/src/main/java/com/namehamal/tracker/notifications/ReminderNotification.kt`
- [X] T008 [P] Implement `ReminderPermission` with a three-way state (granted / requestable / blocked), the `POST_NOTIFICATIONS` check for API 33+ plus `areNotificationsEnabled()`, and a helper that builds the `Settings.ACTION_APP_NOTIFICATION_SETTINGS` intent for the app, in `android/app/src/main/java/com/namehamal/tracker/notifications/ReminderPermission.kt`
- [X] T009 Retire the session reminder live path: remove the `SessionCheckInScheduler` property and its start/cancel wiring from `android/app/src/main/java/com/namehamal/tracker/TrackerApplication.kt`, and remove the `onSessionStarted`/`onSessionStopped` callbacks and their plumbing from `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingViewModel.kt`
- [X] T010 Delete the now-unused `SessionCheckInScheduler.kt` and `SessionCheckInWorker.kt` from `android/app/src/main/java/com/namehamal/tracker/notifications/` and remove their retired tests `android/app/src/test/java/com/namehamal/tracker/notifications/SessionCheckInSchedulerTest.kt`, `android/app/src/test/java/com/namehamal/tracker/ui/tracking/SessionCheckInWiringTest.kt`, and `android/app/src/androidTest/java/com/namehamal/tracker/notifications/SessionCheckInIntegrationTest.kt`
- [X] T011 Remove the session-named copy (`sessionBody`, `ACTION_STILL_WORKING`) and the session rendering path from `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInNotification.kt`, keeping the legacy workday `show(...)` path and `CheckInActionReceiver` compiling; update `android/app/src/test/java/com/namehamal/tracker/notifications/CheckInNotificationTest.kt` to drop the retired session assertions

**Checkpoint**: Foundation ready - `ReminderSettings`, the store, the pure schedule, the neutral notification, and the permission helper exist; the session reminder path is gone and the app still builds. User story implementation can now begin.

---

## Phase 3: User Story 1 - Configure the Reminder Cycle and Active Hours (Priority: P1) 🎯 MVP

**Goal**: An always-on, session-independent reminder that fires on the configured preset cycle, only inside the configured device-local daily window, restarting its cycle at the window opening.

**Independent Test**: Unit-test the schedule algorithm, the settings store, and the ViewModel, and instrumentation-test the WorkManager chain with `WorkManagerTestInitHelper`; assert normal, overnight, empty, and boundary windows, cycle restart at open, defaults/round-trip/validation, and enqueue/cancel/re-enqueue behavior.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Unit test `ReminderSchedule` for normal windows (09:00–23:00, 1h → 10:00 … 22:00), overnight windows (22:00–06:00), empty windows (`start == end`), window shorter than one interval, pre-open/post-close, and exact-boundary cases in `android/app/src/test/java/com/namehamal/tracker/notifications/ReminderScheduleTest.kt`
- [X] T013 [P] [US1] Unit test `ReminderSettingsStore` for documented defaults, save/read round-trip, interval preset validation, window-minute range validation, and fallback-to-default on invalid stored values in `android/app/src/test/java/com/namehamal/tracker/data/settings/ReminderSettingsStoreTest.kt`
- [X] T014 [P] [US1] Instrumentation test `ReminderScheduler` with `WorkManagerTestInitHelper` for enable (enqueue), disable (cancel + nothing scheduled), and cycle/window change (cancel + re-enqueue unique work named/tagged `reminder-cycle`) in `android/app/src/androidTest/java/com/namehamal/tracker/notifications/ReminderSchedulerIntegrationTest.kt`
- [X] T015 [P] [US1] Unit test `ReminderSettingsViewModel` for persisting the enabled state/cycle/window and for triggering a reschedule on each change (no app restart) in `android/app/src/test/java/com/namehamal/tracker/ui/settings/ReminderSettingsViewModelTest.kt`

### Implementation for User Story 1

- [X] T016 [US1] Implement `ReminderScheduler` as a unique one-time work chain (`enqueueUniqueWork` with name/tag `reminder-cycle`) with `scheduleNext` (initial delay from the next trigger), `cancelAll`, and cancel-then-re-enqueue on config change, in `android/app/src/main/java/com/namehamal/tracker/notifications/ReminderScheduler.kt`
- [X] T017 [US1] Implement `ReminderWorker` (`CoroutineWorker`): read `ReminderSettingsStore`, do nothing when disabled, skip posting when outside the window/empty window or notifications are not permitted, post via `ReminderNotification` when inside the window and permitted, then enqueue the next trigger computed from the current local zone, in `android/app/src/main/java/com/namehamal/tracker/notifications/ReminderWorker.kt`
- [X] T018 [US1] Implement `ReminderSettingsViewModel` exposing `ReminderSettings` UI state, edit/persist actions for enabled state, cycle preset, and window start/end, and a reschedule hook that calls `ReminderScheduler` on every change, in `android/app/src/main/java/com/namehamal/tracker/ui/settings/ReminderSettingsViewModel.kt`
- [X] T019 [US1] Build the reminder configuration UI - reminders enabled toggle, cycle picker offering exactly the five presets with 1 hour default, and window start/end pickers - with the contract test tags, in `android/app/src/main/java/com/namehamal/tracker/ui/settings/ReminderSettingsSection.kt`
- [X] T020 [US1] Wire `TrackerApplication` to own `ReminderSettingsStore` and `ReminderScheduler`, add `reminderSettingsViewModel()`, and on startup re-enqueue from persisted settings when enabled (cancelling otherwise) so reminders resume after process death or reboot, in `android/app/src/main/java/com/namehamal/tracker/TrackerApplication.kt`

**Checkpoint**: The reminder chain is fully functional and independently testable; US2 composes the section into the Settings screen.

---

## Phase 4: User Story 2 - Reach All Configuration from One Settings Page (Priority: P1)

**Goal**: One Settings screen holds the relocated desktop connection/sync configuration (including the Sync action) and the reminder configuration; the main screen keeps only tracking actions plus a Settings entry.

**Independent Test**: Compose-test that Settings renders both the reminder section and the desktop connection/sync section with the contract test tags and that Back returns to the main screen, and that the main screen no longer shows inline sync/status/permission controls while offering a Settings entry.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T021 [P] [US2] Rename `android/app/src/androidTest/java/com/namehamal/tracker/ui/sync/SyncSettingsScreenTest.kt` to `android/app/src/androidTest/java/com/namehamal/tracker/ui/settings/SettingsScreenTest.kt` and expand it to assert the reminder section, the desktop connection/sync section (address/port fields, Save/Forget, saved endpoint, Sync action), the content root, and the Back control, using the contract test tags
- [X] T022 [P] [US2] Update `android/app/src/androidTest/java/com/namehamal/tracker/ui/tracking/TrackingScreenTest.kt` to assert the main screen has no inline sync fields, Sync action, sync status, or permission card, and that a Settings entry control is present

### Implementation for User Story 2

- [X] T023 [US2] Refactor `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsScreen.kt` into an embeddable sync section composable that reuses `SyncSettingsViewModel` (host/port fields, Save/Forget, saved endpoint display, Sync action and status) unchanged in behavior
- [X] T024 [US2] Create `SettingsScreen` composing the reminder section (US1) and the sync section (T023) with a Back control, the `settings-content` root tag, and the required test tags, in `android/app/src/main/java/com/namehamal/tracker/ui/settings/SettingsScreen.kt`
- [X] T025 [US2] Update `android/app/src/main/java/com/namehamal/tracker/MainActivity.kt` to render `SettingsScreen` for the settings destination and add `ReminderSettingsViewModel` to the `TrackerViewModelFactory`
- [X] T026 [US2] Update `android/app/src/main/java/com/namehamal/tracker/ui/tracking/TrackingScreen.kt` to remove the inline Sync button/status, the "Connection settings" button, and the inline `NotificationPermissionCard`, and add a single clear Settings entry control with a stable test tag while retaining all tracking actions

**Checkpoint**: User Stories 1 and 2 both work independently; all configuration lives on Settings.

---

## Phase 5: User Story 3 - Test the Reminder Notification On Demand (Priority: P2)

**Goal**: A test control on Settings immediately shows a sample reminder when notifications are permitted, explains and offers the request/deep-link affordance when they are not, and never mutates settings or scheduled work.

**Independent Test**: Unit-test the test-trigger rendering and the permission-state decision, and Compose-test the test button and permission affordance, asserting a sample is posted immediately when permitted and that settings/schedule are unchanged.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T027 [P] [US3] Unit test the `ReminderNotification` test trigger for neutral copy that names no activity, exactly one `Open app` action, immediate posting when permitted, and no mutation of enabled state/cycle/window/scheduled work, in `android/app/src/test/java/com/namehamal/tracker/notifications/ReminderNotificationTest.kt`
- [X] T028 [US3] Extend `android/app/src/androidTest/java/com/namehamal/tracker/ui/settings/SettingsScreenTest.kt` (same file as T021, sequential after US2) with the test-reminder button and the permission-affordance scenarios: sample shown when permitted; explanation plus in-app request when requestable; system-settings deep link when blocked

### Implementation for User Story 3

- [X] T029 [US3] Rework `android/app/src/main/java/com/namehamal/tracker/ui/checkin/NotificationPermissionCard.kt` into the reminder section's permission affordance that shows the `ReminderPermission` state, requests `POST_NOTIFICATIONS` in-app when requestable, and deep-links to system notification settings when blocked
- [X] T030 [US3] Add the test reminder button and permission-state affordance to `android/app/src/main/java/com/namehamal/tracker/ui/settings/ReminderSettingsSection.kt`, wired to the ViewModel so a tap posts the sample via `ReminderNotification` without touching settings or scheduled work
- [X] T031 [US3] Add the test-reminder and permission actions to `android/app/src/main/java/com/namehamal/tracker/ui/settings/ReminderSettingsViewModel.kt`, including the "explain permission required" path when notifications are not permitted

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and end-to-end validation that spans the stories.

- [X] T032 [P] Verify no remaining references to `CheckInActionReceiver` and, if the legacy workday `show(...)` path no longer uses it, remove `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInActionReceiver.kt` and its `<receiver>` entry in `android/app/src/main/AndroidManifest.xml`
- [X] T033 [P] Confirm scope boundaries: `TrackerDatabase` is still schema version 5 with no migration, no desktop/Prisma/Next.js file changed, and no new Android permission or Gradle dependency was added
- [X] T034 [P] Update code doc comments in the touched Android files to describe the retired session reminder and the new always-on fixed-cycle reminder
- [X] T035 Run the full Android validation from `android/`: `./gradlew testDebugUnitTest`, then `./gradlew assembleDebug`, and, with a device/emulator, `./gradlew connectedDebugAndroidTest`; walk `specs/007-android-notification-settings/quickstart.md` scenarios 1-10

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately.
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories. The retirement tasks (T009-T011) must land before any new reminder wiring so only one reminder path exists.
- **User Stories (Phase 3+)**: All depend on Foundational completion. US2 and US3 compose or extend UI created in US1, so the practical order is US1 → US2 → US3.
- **Polish (Phase 6)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational. No dependency on other stories. Independently testable via the schedule/store/ViewModel unit tests and the scheduler instrumentation test.
- **User Story 2 (P1)**: Starts after Foundational. Reuses the US1 reminder section inside the new Settings screen; its Compose test verifies the composed screen. Its ViewModel/state come from US1.
- **User Story 3 (P2)**: Starts after Foundational. Adds the test control and permission affordance to the US1 section and the US2 screen; the unit test proves the trigger independently.

### Within Each User Story

- Tests are written and must FAIL before implementation.
- Models/types before services; services before UI; UI before navigation wiring.
- Complete a story before moving to the next priority.

### Parallel Opportunities

- T002 and T003 run in parallel.
- Foundational type/helper tasks T004-T008 touch different files and run in parallel; T009-T011 (retirement) are sequential because they share wiring.
- US1 tests T012-T015 run in parallel; US1 implementation T016-T019 touch different files and can run in parallel after the tests exist, with T020 wiring last.
- US2 tests T021 and T022 run in parallel; T023-T026 are sequential (section → screen → navigation → main screen).
- US3 test T027 runs in parallel with other US3 prep; T028 is sequential after US2's T021 (same file).

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together (must fail first):
Task: "ReminderSchedule unit tests in android/app/src/test/java/com/namehamal/tracker/notifications/ReminderScheduleTest.kt"
Task: "ReminderSettingsStore unit tests in android/app/src/test/java/com/namehamal/tracker/data/settings/ReminderSettingsStoreTest.kt"
Task: "ReminderScheduler WorkManager instrumentation test in android/app/src/androidTest/java/com/namehamal/tracker/notifications/ReminderSchedulerIntegrationTest.kt"
Task: "ReminderSettingsViewModel unit tests in android/app/src/test/java/com/namehamal/tracker/ui/settings/ReminderSettingsViewModelTest.kt"

# Then launch the independent implementation files together:
Task: "Implement ReminderScheduler in .../notifications/ReminderScheduler.kt"
Task: "Implement ReminderWorker in .../notifications/ReminderWorker.kt"
Task: "Implement ReminderSettingsViewModel in .../ui/settings/ReminderSettingsViewModel.kt"
Task: "Build ReminderSettingsSection in .../ui/settings/ReminderSettingsSection.kt"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories), including retiring the session reminder path.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Run the schedule/store/ViewModel unit tests and the scheduler instrumentation test; confirm the window/cycle/restart-at-open rules.
5. The reminder chain is deployable once US2 exposes it on the Settings screen.

### Incremental Delivery

1. Setup + Foundational → foundation ready, single reminder path.
2. Add US1 → validate the schedule and chain → reminder engine done (MVP core).
3. Add US2 → validate the single Settings page and the demoted main screen.
4. Add US3 → validate the test trigger and permission flow.
5. Polish → full `./gradlew` validation and quickstart walkthrough.

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. Once Foundational is done: Developer A takes US1 (engine), Developer B prepares the US2 screen shell against the US1 section contract, Developer C prepares the US3 permission/test UI against `ReminderPermission`/`ReminderNotification`.
3. Integrate and validate each story at its checkpoint.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] labels map tasks to user stories for traceability.
- No task touches desktop, Prisma, the sync transport, or the Room schema (v5 unchanged).
- Cycle presets only (15/30/60/120/180 minutes, 60 default); window default 09:00–23:00, start inclusive, end exclusive, evaluated in the device's local zone.
- Reminders are disabled by default and are opted into from Settings.
- Commit after each task or logical group using conventional commit messages.
