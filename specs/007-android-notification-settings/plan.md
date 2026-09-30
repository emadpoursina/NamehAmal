# Implementation Plan: Android Notification Reminder Settings

**Branch**: `android-notification-settings` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-android-notification-settings/spec.md`, including the 2026-09-30 clarifications (neutral copy + single "Open app" action; cycle restarts at window open; all sync UI moves to Settings; presets 15m/30m/1h/2h/3h with 1h default; in-app permission request plus system-settings deep link).

## Summary

Add one Android **Settings** screen that becomes the home for all app configuration: move the existing desktop connection/Sync UI into it and add the reminder settings (enabled toggle, cycle preset, daily active window, test button, and permission state). Replace the session-bound hourly reminder with an always-on **fixed-cycle reminder** that is independent of any running session: a WorkManager one-time work chain computes the next allowed trigger inside the configured device-local window, restarts its cycle when the window opens, and uses neutral copy with a single **Open app** action. Persist reminder settings in a new DataStore preferences store; keep the Room schema unchanged; change no desktop behavior.

## Technical Context

**Language/Version**: Kotlin 2.2.21 / Java 17 (Android Gradle Plugin 8.13.2).

**Primary Dependencies**: Jetpack Compose + Material 3, AndroidX Preferences DataStore 1.1.7, AndroidX WorkManager 2.11.1 (`work-runtime-ktx`), Room 2.8.5, Kotlin coroutines 1.10.2. No new runtime dependency is planned.

**Storage**: A new DataStore Preferences file (`reminder_settings`) for reminder configuration, alongside the existing `sync_endpoint` store. Room/SQLite is unchanged (schema stays at version 5); no Room migration is required because this feature adds no persisted tracking entity.

**Testing**: JUnit 4 + `kotlinx-coroutines-test` unit tests for the pure scheduling algorithm, the settings store, and the settings ViewModel; `androidx.work:work-testing` (`WorkManagerTestInitHelper`) instrumentation tests for scheduling/cancellation; Compose UI tests for the Settings screen and the main-screen entry. Commands: `cd android && ./gradlew testDebugUnitTest`, `./gradlew connectedDebugAndroidTest`, `./gradlew assembleDebug`. Root `npm test` / `npm run lint` are unaffected (no desktop change).

**Target Platform**: Android API 26+; `compileSdk = 36`, `targetSdk = 37`.

**Project Type**: Native Android companion app inside the existing Next.js/Electron monorepo.

**Performance Goals**: No numeric SLO. A reminder is delivered approximately on the configured cycle (WorkManager scheduling tolerance is acceptable); settings changes take effect without an app restart; no network is involved.

**Constraints**: No exact-alarm permission and no `AlarmManager`; reminders are scheduled only through WorkManager. Times are evaluated in the device's current local zone so time-zone/DST changes are respected. Cycle options are presets only (no free-form input). Reminder settings are device-local and never synced. The existing desktop sync transport, routes, and desktop behavior are untouched. Reminder copy must not name any tracked activity and must offer exactly one action.

**Scale/Scope**: One Android installation, one Settings screen, one reminder work chain. No desktop screens, sync protocol, Room schema, cloud, or multi-user changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Result | Evidence and plan |
|---|---|---|
| I. Local-First, Single-User Monolith and scoped Android sync | **Pass** | This is a change to the already-authorized Android companion on the current `android-notification-settings` branch. The reminder is fully local and offline; the existing desktop connection/Sync UI is only relocated inside the app, not changed. No new remote service, listener, cloud, or multi-user machinery is introduced, and the trusted-private-LAN sync boundary is untouched. |
| II. Server-Owned Data Access | **Pass / not exercised** | No Prisma, Next.js route, desktop SQLite, or `app/generated/prisma` change. The feature lives entirely in the Android module. |
| III. Timezone-Aware Time Logic (NON-NEGOTIABLE) | **Pass** | The active window is stored as local wall-clock minutes since midnight and evaluated against the device's current local zone at each scheduling decision, so a time-zone change or DST shift is honored (FR-011). No session date/time is stored without timezone context; existing tracking timezone rules are unchanged. |
| IV. Test-First with Real Dependencies | **Pass** | The pure `ReminderSchedule` algorithm, the DataStore-backed store, the ViewModel, and the WorkManager scheduler each get focused tests. WorkManager tests use the real test work manager; Compose tests exercise the real Settings screen. No desktop test surface is added. |
| V. Simplicity & Framework Trust | **Pass** | Reuse Compose/Material 3, DataStore, and WorkManager directly; add no wrapper framework and no speculative feature. Retire the session-bound reminder code rather than layering a second reminder path on top of it. |
| Technology Stack & Security Constraints | **Pass** | No secrets, no new dependency, no new network surface. Plain-HTTP sync behavior and the loopback-only desktop listener are unchanged. |

### Post-design re-check

After Phase 1 design: the reminder is a local WorkManager chain; settings live in DataStore; no Room migration and no desktop/sync change. The permission flow requests the Android 13+ runtime permission in-app and deep-links to system notification settings when notifications are disabled or permanently denied, which is existing platform behavior, not a new security boundary. No constitution violation requires justification, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/007-android-notification-settings/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── reminder-scheduling.md
│   └── settings-ui.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
android/app/src/main/java/com/namehamal/tracker/
├── MainActivity.kt                          # main <-> Settings navigation; drop inline sync wiring
├── TrackerApplication.kt                    # own ReminderSettingsStore + ReminderScheduler; reschedule on start
├── data/settings/
│   ├── ReminderSettings.kt                  # settings value type, cycle presets, window + defaults
│   └── ReminderSettingsStore.kt             # DataStore "reminder_settings" (enabled, interval, window)
├── notifications/
│   ├── ReminderSchedule.kt                  # pure next-trigger / within-window algorithm (unit-testable)
│   ├── ReminderScheduler.kt                 # unique one-time work chain, reschedule/cancel
│   ├── ReminderWorker.kt                    # fires reminder if enabled + inside window, re-enqueues next
│   ├── ReminderNotification.kt              # neutral copy + single "Open app" action; test trigger
│   ├── ReminderPermission.kt                # granted/requestable/blocked state + system-settings deep link
│   ├── SessionCheckInScheduler.kt           # RETIRE from the live path
│   ├── SessionCheckInWorker.kt              # RETIRE from the live path
│   └── CheckInScheduler.kt / CheckInWorker.kt  # legacy workday path; keep only for startup cleanup
├── ui/settings/
│   ├── SettingsScreen.kt                    # single Settings page (reminder section + sync section)
│   ├── ReminderSettingsSection.kt           # toggle, cycle picker, window pickers, test + permission
│   └── ReminderSettingsViewModel.kt         # reminder UI state + persistence + reschedule on change
├── ui/sync/
│   └── SyncSettingsScreen.kt                # refactored into the sync section embedded in Settings
├── ui/tracking/
│   └── TrackingScreen.kt                    # remove inline Sync/connection UI and permission card
└── ui/checkin/
    └── NotificationPermissionCard.kt        # reworked/moved into the reminder settings section

android/app/src/test/java/com/namehamal/tracker/
├── notifications/ReminderScheduleTest.kt
├── notifications/ReminderNotificationTest.kt
├── data/settings/ReminderSettingsStoreTest.kt
└── ui/settings/ReminderSettingsViewModelTest.kt

android/app/src/androidTest/java/com/namehamal/tracker/
├── notifications/ReminderSchedulerIntegrationTest.kt
├── ui/settings/SettingsScreenTest.kt        # renamed/expanded from SyncSettingsScreenTest
└── ui/tracking/TrackingScreenTest.kt        # updated: no inline sync/permission controls

android/app/src/main/AndroidManifest.xml     # drop the retired confirm-action receiver if unused
```

**Structure Decision**: Keep the single existing Android app module and its Compose/DataStore/WorkManager layers. Add a `data/settings` store, a `notifications` reminder chain, and a `ui/settings` screen; fold the existing `SyncSettingsScreen` into that screen as a section and remove inline configuration from `TrackingScreen`. Do not add a second module, a new persistence store, a Room migration, or any desktop/sync change.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
