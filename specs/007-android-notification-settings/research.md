# Research: Android Notification Reminder Settings

**Date**: 2026-09-30  
**Scope**: Existing Android companion only; the desktop sync transport, routes, and desktop behavior are unchanged.

## Decisions

### 1. Consolidate configuration into one Settings screen and demote the main screen

- **Decision**: Introduce a single `SettingsScreen` (`ui/settings`) that hosts both a reminder section and the existing desktop connection/Sync section. `MainActivity` navigates main ↔ Settings. `TrackingScreen` drops the inline Sync/"Connection settings" controls, the sync status text, and the permission card, and gains one clear entry point to Settings. The existing `SyncSettingsViewModel` and its save/forget/sync logic are reused unchanged; `SyncSettingsScreen` is refactored into an embeddable sync section.
- **Rationale**: FR-001/FR-002 and US2 require one Settings page that owns all configuration, including the Sync action and its status, while the main screen keeps only tracking actions plus a way into Settings. Reusing `SyncSettingsViewModel` preserves the already-tested sync behavior (FR-015).
- **Alternatives considered**: Keeping a separate "Connection settings" screen plus a new reminder screen would leave configuration scattered. Rewriting sync logic would risk regressing the trusted-LAN contract for no benefit.

### 2. Make the reminder an independent, always-on fixed cycle and retire the session/workday reminders

- **Decision**: The reminder no longer depends on a running session or a workday. Remove the live `SessionCheckInScheduler`/`SessionCheckInWorker` wiring (and the `TrackingViewModel` `onSessionStarted`/`onSessionStopped` callbacks that drove it). Keep the legacy `CheckInScheduler`/`CheckInWorker` and `WorkdayController` only where they already compile, and keep the one startup `CheckInScheduler(this).cancel()` call so any old scheduled work is cleared; do not schedule new workday check-ins. Retire the session-named notification copy and the "Still working" confirm action.
- **Rationale**: FR-016 and the spec assumptions state the reminder repeats on the configured cycle regardless of whether a session is running, replacing the session-only hourly reminder. Leaving the old scheduler active would produce two competing reminders.
- **Alternatives considered**: Layering the fixed-cycle reminder on top of the session scheduler would double-fire and contradict the spec. Deleting the legacy workday classes outright would force unrelated cleanup of already-retired code; keeping them compiled but unscheduled is the smaller, safer change.

### 3. Schedule the cycle with a self-rescheduling WorkManager one-time work chain

- **Decision**: Use a unique one-time `WorkRequest` (`ReminderWorker`, unique name/tag `reminder-cycle`) rather than `PeriodicWorkRequest`. On each run the worker decides whether to post a reminder, then computes the next trigger and enqueues the next one-time work with the correct initial delay. Enabling, disabling, or changing the cycle/window cancels and re-enqueues the chain; disabling cancels it and schedules nothing. Startup re-enqueues from persisted settings so reminders resume after process death or reboot (WorkManager also persists work across reboot).
- **Rationale**: `PeriodicWorkRequest` anchors its cadence to enqueue time and cannot restart exactly at the daily window opening, cannot cleanly stop at the window boundary, and cannot model an overnight window; its minimum period is 15 minutes, which the presets satisfy but the window semantics do not. A one-time chain gives explicit control over window boundaries and cycle restarts (FR-006, FR-008) while staying within the existing WorkManager dependency.
- **Alternatives considered**: `PeriodicWorkRequest` (rejected: cadence drift across window boundaries, no restart-at-open). `AlarmManager` exact alarms (rejected: requires `SCHEDULE_EXACT_ALARM` on Android 12+, more permission surface than the feature needs). A foreground service (rejected: overkill for an hourly nudge).

### 4. Compute triggers with a pure, timezone-aware schedule function

- **Decision**: Put the scheduling math in a pure Kotlin `ReminderSchedule` object that takes `now` (a `ZonedDateTime`), the window start/end as minutes-since-midnight, and the interval, and returns the next trigger `Instant?`. Rules: the window is `[start, end)` in device-local time; `start == end` is an empty window that yields no triggers; the cycle is anchored at the window opening, so the first trigger is `open + interval` and subsequent triggers step by `interval` while strictly before the close (FR-006). Normal windows (e.g. 09:00–23:00, 1h → 10:00 … 22:00) and overnight windows (e.g. 22:00–06:00, 1h → 23:00 … 05:00) are handled by testing candidate openings across adjacent days.
- **Rationale**: Isolating the math makes the core behavior unit-testable without Android/WorkManager, and evaluating against the device zone at each decision satisfies FR-011 (local time, DST/zone changes).
- **Alternatives considered**: Computing schedules inside the worker (rejected: hard to test, duplicates logic). Storing absolute instants (rejected: a saved instant goes stale across DST/zone changes).

### 5. Persist reminder settings in a dedicated DataStore preferences file; leave Room untouched

- **Decision**: Add `ReminderSettingsStore` backed by a new `preferencesDataStore("reminder_settings")`, mirroring `SavedDesktopEndpoint`. Keys: `enabled` (Boolean, default `false`), `interval_minutes` (Int, default `60`), `window_start_minutes` (Int, default `540` = 09:00), `window_end_minutes` (Int, default `1380` = 23:00). Expose a `Flow<ReminderSettings>` plus `suspend` save methods; validate the interval against the preset set and window minutes to `0..1439`, falling back to defaults on invalid stored values.
- **Rationale**: FR-010 requires settings to persist across app close and reboot; DataStore already backs the saved endpoint and is the smallest durable option. FR-004 restricts cycles to presets, and the spec's default window is 09:00–23:00. Because no tracking entity is added, the Room schema (v5) and its migrations are untouched.
- **Alternatives considered**: Room table (rejected: unnecessary migration for four scalar values). `SharedPreferences` (rejected: the project already standardizes on DataStore flows).

### 6. Neutral reminder content with a single "Open app" action

- **Decision**: Rewrite the reminder notification to a neutral title/body (`"Time check-in"` / `"What have you been working on?"`) with exactly one action, "Open app", whose `PendingIntent` opens `MainActivity`. Use a new channel (`reminders`). Remove `sessionBody(title)`, the "Still working" / "Same activity" confirm actions, and the confirm broadcast receiver if it becomes unused. The same rendering is reused for the test trigger.
- **Rationale**: FR-017 and clarification Q1 require copy that never names a tracked activity and a single app-opening action; the retired content and action are explicitly out of scope.
- **Alternatives considered**: Keeping the confirm action (rejected: it belonged to the session-confirmation flow the spec retires).

### 7. Surface permission state and support request + system-settings deep link

- **Decision**: Add `ReminderPermission` helpers that report a three-way state: **granted** (POST_NOTIFICATIONS granted on API 33+, or pre-33, and `areNotificationsEnabled()`), **requestable** (not granted but the runtime dialog can still be shown), and **blocked** (notifications disabled at the OS level, or permission permanently denied). The Settings reminder section shows this state and offers an "Allow notifications" button that requests the runtime permission in-app; when blocked it offers a button that opens the app's system notification settings via `Settings.ACTION_APP_NOTIFICATION_SETTINGS`. The test button explains that permission is required instead of failing silently.
- **Rationale**: FR-014 and clarification Q5 require both an in-app runtime request and a deep link when permanently denied/OS-disabled. Detecting "blocked" uses `areNotificationsEnabled()` plus `Activity.shouldShowRequestPermissionRationale` after a denial, since Android exposes no direct "permanently denied" flag.
- **Alternatives considered**: Only requesting the runtime permission (rejected: cannot recover from permanent denial/OS disable). Only deep-linking (rejected: loses the smoother in-app request path).

### 8. Test trigger bypasses enablement and the window

- **Decision**: The "Send test reminder" control posts the sample notification immediately when notifications are permitted, regardless of the enabled flag or current time, and never mutates settings or scheduled work (FR-012, FR-013 and the spec edge case).
- **Rationale**: The purpose is to verify delivery before relying on the schedule; gating it on the schedule would defeat the feature.
- **Alternatives considered**: Respecting the window for tests (rejected: makes testing impossible outside active hours).

### 9. Test strategy

- **Decision**: Unit-test `ReminderSchedule` for normal/overnight/empty windows, cycle restart at open, pre-open/post-close, and exact-boundary cases; unit-test `ReminderSettingsStore` defaults/round-trip/validation and `ReminderSettingsViewModel` for save + reschedule triggers; instrumentation-test `ReminderScheduler` with `WorkManagerTestInitHelper` for enqueue/cancel/unique-work behavior and the Settings screen's controls. Update `TrackingScreenTest` for the removed inline controls and retire the session-reminder tests.
- **Rationale**: Principle IV wants critical paths covered with real dependencies; the schedule math and the WorkManager chain are the two critical paths here. No desktop tests are needed because desktop behavior is unchanged.
- **Alternatives considered**: UI-only tests (rejected: would not prove the window/cycle algorithm). Testing with a mocked clock inside the worker (rejected: the pure function already isolates time).

## Resolved design constraints

- Reminder scheduling is local and offline; no desktop, sync, cloud, or multi-user change.
- Cycle presets only: 15, 30, 60 (default), 120, 180 minutes; custom intervals out of scope.
- Window default 09:00–23:00, start inclusive, end exclusive, evaluated in device-local time; empty window delivers nothing.
- Cycle restarts at window open; the first reminder arrives one cycle after the open; the cycle stops at the close.
- Reminders are disabled by default and are opted into from Settings; the previously chosen cycle/window are retained when disabled.
- WorkManager tolerances mean delivery is "approximately" on the cycle, which the spec accepts.
- No new runtime dependency, no new permission, no Room migration.
