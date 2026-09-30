# Quickstart: Android Notification Reminder Settings

## Prerequisites

- Java 17, Android SDK/platform tools, and an Android API 26+ device or emulator (API 33+ to exercise the runtime notification permission).
- No desktop, network, or server is required for any scenario in this feature; the desktop sync section is only exercised for regression.
- For the sync regression scenario, a desktop build reachable on a trusted private network.

## Build and automated validation

From the repository root:

```sh
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

With an emulator/device available:

```sh
./gradlew connectedDebugAndroidTest
```

Expected result: the reminder-schedule unit tests pass (normal, overnight, empty, and boundary windows; cycle restart at open), the settings store and ViewModel tests pass, the WorkManager scheduler instrumentation test passes, and the Settings/main-screen Compose tests pass. The root `npm test` / `npm run lint` checks are unaffected because no desktop code changes.

## End-to-end scenarios

1. **Settings is the single home for configuration** (US2): From the main tracking screen, confirm no Sync action, connection fields, or inline permission card are shown, and that a control opens Settings. In Settings, confirm both the desktop connection/Sync section and the reminder section are present. Edit and save the connection details; verify they persist and the saved endpoint is shown.
2. **Configure cycle and window** (US1): In Settings, enable reminders, choose a cycle, and set a start/end window. Reopen Settings (and force-stop/relaunch the app); verify the chosen enabled state, cycle, and window are retained.
3. **Window/cycle delivery** (US1, SC-002): Configure 09:00–23:00 with a 1-hour cycle. Verify the first reminder arrives one cycle after the window opens (10:00 in the example), reminders continue about hourly, and no reminder is delivered outside 09:00–23:00. Verify the change takes effect without restarting the app.
4. **Overnight and empty windows** (FR-008): Configure an overnight window (e.g. 22:00–06:00) and verify reminders are delivered only inside it and wrap past midnight. Configure start equal to end and verify no reminders are delivered.
5. **Enable/disable** (FR-007): With reminders on, turn them off and verify no further reminders are delivered and pending work is cancelled; turn them back on and verify reminders resume with the retained cycle and window.
6. **Test button** (US3): Tap the test reminder button while notifications are permitted and verify a sample reminder appears immediately, even when reminders are disabled or the current time is outside the window, and that the enabled state, cycle, window, and schedule are unchanged.
7. **Permission handling** (FR-014): With notifications not permitted, tap the test button and verify the app explains that permission is required and requests the runtime permission in-app. Permanently deny (or disable notifications at the OS level) and verify the app offers a deep link to the app's system notification settings.
8. **Reminder content** (FR-017): Confirm the delivered and test notifications show neutral copy that does not name any activity and offer exactly one action, "Open app", which opens the app.
9. **Session independence** (FR-016): Verify reminders continue on their cycle with no tracking session running, and that starting/stopping a session neither creates nor cancels reminder work.
10. **Sync regression** (FR-015): From Settings, save an endpoint and run Sync as before; verify upload-only behavior, messages, and the saved endpoint are unchanged by the move.

## Manual review points

- The main screen has no inline configuration or Sync action and provides a clear way into Settings.
- Settings hosts all configuration: reminder settings (enable, cycle, window, test, permission state) and the desktop connection/Sync section.
- Reminders are independent of sessions, follow the configured local-time window and cycle, restart their cycle at window open, and use neutral copy with a single "Open app" action.
- No desktop, sync-protocol, or Room-schema change is introduced.
