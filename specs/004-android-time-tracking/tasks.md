---
description: "Dependency-ordered implementation tasks for Android Time Tracking Companion"
---

# Tasks: Android Time Tracking Companion

**Input**: Design documents in `specs/004-android-time-tracking/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/sync-api.md`, and `quickstart.md`).

**Organization**: Tasks are grouped by the four prioritized user stories. Tests are included because the specification provides mandatory independent test criteria and measurable success criteria, and the plan specifies unit, persistence, contract, integration, and device coverage.

**Implementation boundary**: Add one native Android app under `android/`; keep desktop data access in Next.js server code. The MVP sync exception follows Constitution v1.1.0: user-entered/saved Mac IP and port, Android-only manual full-data sync, and trusted private LAN only. Transport is plain HTTP without TLS; there is no QR pairing, HMAC, or per-device authentication. Keep the ordinary desktop listener on `127.0.0.1:3060`; expose only the allowlisted sync bridge (default port `3061`). No cloud, polling, automatic exchange, desktop-initiated sync, or inferred work.

## Phase 1: Setup

**Purpose**: Create the sibling Android project without changing the existing npm desktop workflow.

- [X] T001 Create the Android Gradle project and app module in `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle/libs.versions.toml`, `android/gradle.properties`, and `android/app/build.gradle.kts`, using Kotlin 2.x, one app module, and namespace/application ID `com.namehamal.tracker`.
- [X] T002 Add the Gradle wrapper files `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.properties`, and `android/gradle/wrapper/gradle-wrapper.jar` so the documented `./gradlew` commands work from `android/`.
- [X] T003 Create the app entry point and base manifest/theme in `android/app/src/main/java/com/namehamal/tracker/MainActivity.kt`, `android/app/src/main/AndroidManifest.xml`, and `android/app/src/main/res/values/themes.xml`; set minimum API 26 and target the current stable SDK (API 37 when Android 17 is stable).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared Android persistence and the isolated desktop integration-test harness before story implementation.

- [X] T004 Add Room 3.0, DataStore, WorkManager, coroutines, Compose/Material 3, Kotlin/JUnit/Android test dependencies, and the Android instrumentation runner configuration in `android/app/build.gradle.kts`.
- [X] T005 Create the Room database shell and explicit migration registry in `android/app/src/main/java/com/namehamal/tracker/data/local/TrackerDatabase.kt` and `android/app/src/main/java/com/namehamal/tracker/data/local/DatabaseMigrations.kt`.
- [X] T006 Add a throwaway SQLite fixture for desktop sync contract tests in `tests/contract/sync/test-database.ts`; ensure each test database is isolated and never opens `dev.db`.

**Checkpoint**: The Android app builds, Room migrations can be registered, and desktop sync tests have a disposable database.

---

## Phase 3: User Story 1 — Track a Workday Offline (Priority: P1) 🎯 MVP

**Goal**: Record and edit a complete, timezone-consistent work timeline locally while offline; only explicit user actions affect work state.

**Independent Test**: With the phone offline, start a workday, choose an available activity, change it, record a break, edit/split an interval, use Unassigned for an unavailable activity, end the day, restart the app, and verify every transition remains in order with no simultaneous active day and no break time counted as work.

### Tests for User Story 1

- [X] T007 [P] [US1] Add domain tests for single-active-workday enforcement, adjacent transition instants, break exclusion, interval edit/split/Unassigned behavior, UTC instant plus zone/offset handling across midnight/DST, and no tracking inference in `android/app/src/test/java/com/namehamal/tracker/domain/WorkdayTimelineTest.kt`.
- [X] T008 [P] [US1] Add Room instrumentation coverage proving an active workday and complete timeline survive process/app restart and remain writable with networking unavailable in `android/app/src/androidTest/java/com/namehamal/tracker/data/local/TimelinePersistenceTest.kt`.

### Implementation for User Story 1

- [X] T009 [US1] Define the Room `Workday`, `TimeInterval`, and cached desktop `ActivitySnapshot` entities and timeline DAO in `android/app/src/main/java/com/namehamal/tracker/data/local/WorkdayEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/TimeIntervalEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/ActivitySnapshotEntity.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineDao.kt`; include stable IDs, source, confirmation/update metadata, UTC instants, IANA zone and captured offset.
- [X] T010 [US1] Implement interval transition and validation rules in `android/app/src/main/java/com/namehamal/tracker/domain/IntervalRules.kt` and `android/app/src/main/java/com/namehamal/tracker/domain/WorkdayController.kt`; close/open adjacent intervals at the same instant, reject a second active workday, distinguish non-working breaks, and use only explicit user actions.
- [X] T011 [US1] Implement Room-transactional local timeline operations in `android/app/src/main/java/com/namehamal/tracker/data/local/TimelineRepository.kt`; commit start/end, activity changes, breaks, edits, and splits before reporting success, and keep tracking independent of network availability.
- [X] T012 [US1] Build the Today and Timeline Compose screens in `android/app/src/main/java/com/namehamal/tracker/ui/today/TodayScreen.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/timeline/TimelineScreen.kt`; provide manual start/end, current activity, the latest cached activity list, Unassigned fallback, and local-time display.
- [X] T013 [US1] Add interval edit/split/Unassigned controls in `android/app/src/main/java/com/namehamal/tracker/ui/timeline/IntervalEditor.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/timeline/IntervalEditViewModel.kt`, retaining the original local timeline across app restart.

**Checkpoint**: US1 passes its independent offline test without a desktop, internet connection, or any sensor/usage permissions.

---

## Phase 4: User Story 2 — Confirm Work with Check-ins (Priority: P2)

**Goal**: Provide best-effort hourly check-ins only during a manually active workday without changing interval boundaries unless the user chooses an action.

**Independent Test**: With notifications allowed, confirm one check-in with Same activity, ignore a later one and verify its interval stays present and Unconfirmed, use the quick flow for a change/break/end action, then end the day and verify reminders stop. In usability validation, at least 90% of participants must confirm in one action and finish a quick-flow change/break/end within three actions. Repeat with notification permission denied or delivery delayed and verify in-app review remains available.

### Tests for User Story 2

- [X] T014 [P] [US2] Add WorkManager scheduler/worker tests for approximately hourly unique scheduling during an active workday only, cancellation at workday end, stale-workday rechecks, and missed reminders marking an interval Unconfirmed without splitting/closing it in `android/app/src/test/java/com/namehamal/tracker/notifications/CheckInSchedulerTest.kt`.
- [X] T015 [P] [US2] Add notification/action tests for one-action Same activity confirmation, change/break/end quick-flow actions, denied/delayed permission fallback, and generic lock-screen text without activity/project names in `android/app/src/test/java/com/namehamal/tracker/notifications/CheckInNotificationTest.kt`.

### Implementation for User Story 2

- [X] T016 [US2] Persist check-in markers that reference a workday and interval in `android/app/src/main/java/com/namehamal/tracker/data/local/CheckInMarkerEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/CheckInDao.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/DatabaseMigrations.kt`; represent pending/confirmed/missed state without creating interval boundaries.
- [X] T017 [US2] Implement unique approximately hourly scheduling and a WorkManager worker in `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInScheduler.kt` and `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInWorker.kt`; re-check persisted active-workday state before notifying and cancel work on end.
- [X] T018 [US2] Implement a generic check-in notification channel and its Same activity/open-app actions in `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInNotification.kt` and `android/app/src/main/AndroidManifest.xml`; omit activity/project names by default and request no exact-alarm permission.
- [X] T019 [US2] Add notification-permission explanation and in-app timeline/check-in review in `android/app/src/main/java/com/namehamal/tracker/ui/checkin/NotificationPermissionCard.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/checkin/CheckInReviewScreen.kt`; denied or delayed notifications must not stop tracking.
- [X] T020 [US2] Connect notification actions to the existing timeline repository in `android/app/src/main/java/com/namehamal/tracker/notifications/CheckInActionReceiver.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/checkin/CheckInFlowViewModel.kt`; Same activity confirms the current interval, while change/break/end performs the normal explicit transition.

**Checkpoint**: Missing, denied, or late check-ins never delete, shorten, split, or stop a tracked interval; no reminder is sent after workday end.

---

## Phase 5: User Story 3 — Configure and Sync with the Desktop (Priority: P3)

**Goal**: Save the Mac IP/port once and let Android manually exchange the full shared time-entry set and desktop activity list, with safe retries and no background/desktop/cloud initiation.

**Independent Test**: Save the Mac's private IP and sync port in Android, manually sync all available history and activities, repeat for ten no-change/change cycles without duplicates, and retry with the bridge unavailable. Verify failed attempts preserve local entries, pending revisions, and cursor; verify no exchange occurs until Android Sync is tapped.

### Tests for User Story 3

- [X] T021 [P] [US3] Add throwaway-SQLite API contract tests for status, initial full-history/activity download, incremental edits, idempotent revision retries, pagination, malformed payloads, failed transactions, and unchanged cursor on failure in `tests/contract/sync/sync-api.test.ts`.
- [X] T022 [P] [US3] Add Electron bridge tests proving only `GET /api/sync/v1/status` and `POST /api/sync/v1/exchange` are forwarded, all other paths/methods are rejected, port 3061 is separate from the loopback app listener, and bridge failure is retryable in `tests/electron/sync-bridge.test.ts`.
- [X] T023 [P] [US3] Add Android tests for private-IP/port validation, saved endpoint reuse/forgetting, explicit-only network calls, multi-page Room atomicity, and preservation of entries/revisions/cursor on transport or permission failure in `android/app/src/test/java/com/namehamal/tracker/data/sync/EndpointAndRetryTest.kt`.

### Implementation for User Story 3

- [X] T024 [US3] Extend `prisma/schema.prisma` and add a SQLite-compatible migration under `prisma/migrations/` for stable entry/source IDs, entry type, optional activity ID, confirmation state, immutable revisions, sync devices, host change sequence, and acknowledgements; add field-level `///` comments, preserve required `Session.categoryId`/`Session.kind`, and deterministically backfill legacy sessions.
- [X] T025 [US3] Implement server-side protocol validation, Activity/Category mapping, transactional revision persistence, stable host-sequence paging, idempotent revision/resolution acknowledgements, and complete activity snapshots in `app/server/sync/validation.ts`, `app/server/sync/activity-mapping.ts`, and `app/server/sync/exchange-service.ts`; map legacy sessions without an Activity ID to Unassigned while preserving title/category, keep Activity distinct from Category, and never use `updatedAt` as a cursor or last-write-wins rule.
- [X] T026 [US3] Add server-owned status and exchange route handlers at `app/api/sync/v1/status/route.ts` and `app/api/sync/v1/exchange/route.ts`; validate bounded no-store JSON requests, keep Prisma access server-side, and expose no general desktop APIs through sync.
- [X] T027 [US3] Add the dedicated Electron LAN sync bridge and lifecycle wiring in `electron/sync-bridge.ts`, `electron/runtime-config.ts`, and `electron/server-process.ts`; use default port 3061, forward only the two contract routes to loopback Next.js, keep the normal UI/API at `127.0.0.1:3060`, and expose no generic proxy or desktop-initiated sync.
- [X] T028 [US3] Display the bridge's current private IP and listening port plus trusted-private-network-only guidance in `app/settings/SyncBridgeCard.tsx` and `app/settings/page.tsx`; provide no desktop Sync initiation control.
- [X] T029 [P] [US3] Implement Android DataStore endpoint save/reuse/forget behavior in `android/app/src/main/java/com/namehamal/tracker/data/sync/SavedDesktopEndpoint.kt`; accept a private-network IP literal and port 1–65535, reject malformed/public addresses and hostnames, and make clear that Forget only clears this app's configuration.
- [X] T030 [P] [US3] Add Android sync-device, immutable entry-revision, pending-acknowledgement, and opaque-cursor Room storage in `android/app/src/main/java/com/namehamal/tracker/data/local/SyncDeviceEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/EntryRevisionEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/SyncCursorEntity.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/SyncDao.kt`.
- [X] T031 [US3] Implement the plain-HTTP Android client and local-network permission handling in `android/app/src/main/java/com/namehamal/tracker/data/sync/AndroidSyncApi.kt` and `android/app/src/main/AndroidManifest.xml`; permit the contract's cleartext transport while limiting this client to the two versioned routes at the saved endpoint after a user-started flow, support API 37 local-network permission denial safely, and add no TLS, QR, HMAC, per-device authentication, cloud, or polling path.
- [X] T032 [US3] Implement the Room-transactional sync repository in `android/app/src/main/java/com/namehamal/tracker/data/sync/SyncRepository.kt`; upload all pending phone revisions and (when available) user resolutions, download full history for a null cursor and incremental host changes afterward, apply every page and the complete Activity snapshot, and commit records/acks/conflicts/resolutions/cursor atomically so partial failure remains retryable.
- [X] T033 [US3] Build the Android Sync/settings screen in `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsScreen.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/sync/SyncSettingsViewModel.kt`; provide save, Forget endpoint, and explicit Sync controls, clear success/failure/retry states, and no QR-pairing or security-setup flow.

**Checkpoint**: Ten repeated sync cycles are idempotent; only the Android button starts data exchange; failed or partial exchanges preserve all phone data and do not advance the cursor.

---

## Phase 6: User Story 4 — Review and Resolve Sync Conflicts (Priority: P4)

**Goal**: Deduplicate same-activity time in totals and require reversible user choices for different-activity overlaps and concurrent edits, preserving all source versions.

**Independent Test**: Sync same-activity and different-activity overlaps plus two divergent edits to one shared interval. Verify same-activity minutes count once, unresolved different-activity shared time is excluded from totals, both edit branches remain inspectable, and keep/split/edit/Unassigned resolution can be undone after restart and resync.

### Tests for User Story 4

- [X] T034 [P] [US4] Add overlap accounting/domain tests for exact duplicates, same-activity interval union, different-activity unresolved exclusion, resolution choices, and undo restoration in `android/app/src/test/java/com/namehamal/tracker/domain/ConflictAccountingTest.kt`.
- [X] T035 [P] [US4] Add host integration tests for concurrent revisions from a shared base, preserved source versions, unresolved conflict visibility, non-double-counted totals, resolution history, undo, and idempotent resync in `tests/contract/sync/conflicts.test.ts`.

### Implementation for User Story 4

- [X] T036 [P] [US4] Add host conflict and resolution models to `prisma/schema.prisma` and a SQLite-compatible migration under `prisma/migrations/`; persist conflict type, source entry/revision IDs, overlap range, unresolved/resolved/undone state, selected result, and append-only undo history with `///` comments on every new persisted field.
- [X] T037 [P] [US4] Add Android Room conflict and resolution entities/DAO in `android/app/src/main/java/com/namehamal/tracker/data/local/SyncConflictEntity.kt`, `android/app/src/main/java/com/namehamal/tracker/data/local/ConflictResolutionEntity.kt`, and `android/app/src/main/java/com/namehamal/tracker/data/local/ConflictDao.kt`; register an additive migration in `android/app/src/main/java/com/namehamal/tracker/data/local/DatabaseMigrations.kt`.
- [X] T038 [US4] Implement host conflict detection, total projection, and resolution ingestion in `app/server/sync/overlap.ts`, `app/server/sync/conflict-service.ts`, `app/server/sync/totals.ts`, and `app/server/sync/exchange-service.ts`; preserve same-activity source records while union-counting shared minutes, exclude unresolved different-activity overlap minutes, retain concurrent revisions without selecting a winner, and apply/acknowledge resolution and undo records idempotently as new revisions.
- [X] T039 [US4] Implement Android conflict accounting, user resolution, and compensating undo revisions in `android/app/src/main/java/com/namehamal/tracker/data/sync/IntervalOverlapCalculator.kt` and `android/app/src/main/java/com/namehamal/tracker/data/sync/ConflictResolutionRepository.kt`; support keep-either-version, split, edit, and Unassigned while preserving originals, queue resolution/undo records for `SyncRepository.kt`, and re-open a conflict after undo.
- [X] T040 [US4] Build the persistent Review conflicts UI in `android/app/src/main/java/com/namehamal/tracker/ui/conflicts/ConflictReviewScreen.kt` and `android/app/src/main/java/com/namehamal/tracker/ui/conflicts/ConflictResolutionSheet.kt`; keep unresolved overlaps and competing versions visible until the user resolves them, show original records, and expose undo.

**Checkpoint**: Same-activity overlap never inflates totals; unresolved different-activity shared time is not counted; conflict choices and undo survive restart and repeat sync.

---

## Phase 7: Polish & Cross-Cutting Validation

**Purpose**: Keep validation instructions aligned with the delivered flow and prove cross-platform compatibility and measurable criteria.

- [X] T041 Update `specs/004-android-time-tracking/quickstart.md` with the final Android/desktop commands, actual bridge settings, API 37 permission steps, and explicit manual checks for all scenarios; retain the v1.1.0 warning that plain unauthenticated HTTP is for trusted private LAN only, not public/untrusted networks, and that Forget endpoint is not host revocation.
- [X] T042 Run the desktop checks from `package.json` (`npm test` and `npm run lint`) and Android checks via `android/gradlew` (`testDebugUnitTest`, `connectedDebugAndroidTest`, and `assembleDebug`); resolve failures without changing existing desktop-only behavior.
- [X] T043 Execute scenarios A–E in `specs/004-android-time-tracking/quickstart.md` using a throwaway desktop database and supported Android devices/emulators; record the 10-cycle retry result, verify at least 90% of usability participants confirm in one action and complete quick-flow actions within three, and record private-LAN-only sync plus existing Session/category/timezone regression results in that guide.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No feature dependencies; complete before building Android code.
- **Foundational (Phase 2)**: Depends on Setup and blocks all stories.
- **US1 (Phase 3)**: Starts after Foundation; it establishes the local timeline needed by sync.
- **US2 (Phase 4)**: Depends on US1's workday and interval repository so check-ins annotate, but never split, its intervals.
- **US3 (Phase 5)**: Depends on US1's stable interval model and Foundation; can proceed alongside US2 after US1. The desktop bridge depends on the server routes, while Android endpoint/client/repository work can proceed in parallel after the contract tests.
- **US4 (Phase 6)**: Depends on US3's revision exchange and US1's interval model; conflict review depends on sync-delivered source versions.
- **Polish (Phase 7)**: Depends on the stories selected for release; run before declaring SC coverage complete.

### User Story Completion Order

1. **US1 (P1)** — MVP; independent offline tracking and durable editable timeline.
2. **US2 (P2)** — check-ins on top of the local workday timeline.
3. **US3 (P3)** — manual saved-endpoint Android-to-desktop full-data sync.
4. **US4 (P4)** — explicit overlap/concurrent-edit review on the shared revision stream.

## Parallel Opportunities

- **Setup/Foundation**: T006's SQLite test fixture can proceed while Android Gradle files are prepared; complete the Room shell before story work.
- **US1**: Run T007 and T008 together before implementation. After tests, entity/DAO work (T009) and UI layout planning (T012) may be split by owners, but T010–T013 should follow the stated repository/model dependencies.
- **US2**: Run T014 and T015 together before implementation. Once US1 is complete, check-in persistence, scheduler, and notification UI can be split by file ownership while keeping T020 integration last.
- **US3**: Run T021, T022, and T023 together against the written contract. After those tests, T024 (desktop schema), T029 (Android endpoint store), and T030 (Android sync-state Room records) touch distinct files and can proceed in parallel; then follow service → routes → bridge and client → repository → UI dependencies.
- **US4**: Run T034 and T035 together first. T036 (Prisma conflict records) and T037 (Android conflict records) can then proceed in parallel; implement host detection and Android resolution against the shared contract before completing T040.

### Parallel Execution Examples

```text
US1 tests: T007 + T008
US2 tests: T014 + T015
US3 tests: T021 + T022 + T023
US3 independent data setup after tests: T024 + T029 + T030
US4 tests: T034 + T035
US4 platform models after tests: T036 + T037
```

## Independent Test Criteria

| Story | Independent pass condition |
|---|---|
| US1 | Airplane-mode workday start, activity changes, break, edit/split/Unassigned, end and restart retain the full timeline; one active day only; no break time in work totals. |
| US2 | Same activity confirms in one action; quick change/break/end completes within three actions; missed intervals remain Unconfirmed and unchanged; denied/delayed notifications retain in-app review; ended workdays receive no further reminders. |
| US3 | A saved private IP/port is reused without QR; the initial sync covers all available entries and desktop activities; ten repeat/change cycles do not duplicate; failure/partial pages preserve data and cursor; only Android manual Sync initiates exchange. |
| US4 | Same-activity overlap counts once; different-activity shared time is excluded while unresolved; competing edits are visible with both versions; keep/split/edit/Unassigned and undo preserve history across restart/resync. |

## Functional Requirement & Success Criterion Coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T007, T009–T012 |
| FR-002 | T009, T011–T012 |
| FR-003 | T007, T010–T012 |
| FR-004 | T007, T010, T012, T034, T038–T039 |
| FR-005 | T008–T011 |
| FR-006 | T007, T013 |
| FR-007 | T014, T016–T017, T019–T020 |
| FR-008 | T014, T016–T018, T020 |
| FR-009 | T015, T019–T020 |
| FR-010 | T015, T018, T020 |
| FR-011 | T021, T023, T028–T029, T033 |
| FR-012 | T022–T023, T027, T031–T033 |
| FR-013 | T021, T024–T026, T030–T032 |
| FR-014 | T034, T038–T039 |
| FR-015 | T034–T040 |
| FR-016 | T035–T040 |
| FR-017 | T021–T023, T027–T033, T041–T043 |
| FR-018 | T007, T009–T011, T024, T030–T032 |
| FR-019 | T015, T018 |
| FR-020 | T007, T010, T041–T043 |
| SC-001 | T007–T013, T043 |
| SC-002 | T014–T020, T043 |
| SC-003 | T015, T020, T043 |
| SC-004 | T021–T033, T043 |
| SC-005 | T034–T040, T043 |
| SC-006 | T021–T023, T027, T031–T033, T041–T043 |
| SC-007 | T023, T027–T033, T041–T043 |

## Implementation Strategy

### MVP First

Complete Setup and Foundation, then deliver **US1 only** and validate its offline/restart test before expanding scope. US1 alone provides useful phone tracking without sync or notification dependencies.

### Incremental Delivery

1. Setup + Foundation.
2. US1 — offline local timeline MVP.
3. US2 — best-effort reminders and review.
4. US3 — saved-endpoint, Android-initiated full-data exchange.
5. US4 — explicit conflict review and reversible resolution.
6. Polish — run the complete quickstart, regression checks, and measurable SC validation.

## Notes

- Every implementation task has an ID, required checkbox, story label where applicable, and concrete repository path(s).
- `[P]` means the task writes a separate file set and has no dependency on an incomplete task; tests are listed before their story implementation.
- Prisma stays server-owned and SQLite-compatible; all new persisted Prisma fields require field-level `///` comments. Persist time as instants with zone/offset context and display in the current local zone.
- The v1.1.0 exception is intentionally narrow: trusted private LAN only, no TLS or device authentication, no QR/HMAC/security setup, no public/untrusted network use, no cloud, and no ordinary desktop listener exposure.
