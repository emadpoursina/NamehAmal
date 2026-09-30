# Feature Specification: Android Notification Reminder Settings

**Feature Branch**: `android-notification-settings`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Changes to apply on the Android application: (1) add a settings page and move configuration into the settings page; (2) rework the notification reminder so it fires on a fixed cycle (for example every 1 hour) that is configurable from settings; let the user define a daily time range in which reminders are allowed to trigger, also configurable from settings (for example 9:00 to 23:00 every 1 hour); and add a small button for testing the notification."

## Clarifications

### Session 2026-09-30

- Q: What should the reminder say and do when no tracking session is running? → A: Neutral copy (for example "What have you been working on?") with a single "Open app" action; the reminder does not name any tracked activity.
- Q: Does the reminder cycle restart when the daily window opens, or run continuously through it? → A: The cycle restarts when the window opens; the first reminder arrives one cycle after the window opens (10:00 in the 09:00–23:00, one-hour example).
- Q: Should the Sync action and its status stay on the main tracking screen, or move entirely into Settings? → A: Move all sync UI, including the Sync action, into Settings; the main screen only provides a way to open Settings.
- Q: Is the reminder cycle limited to preset intervals, and if so which set, or can users enter a custom interval? → A: Presets of 15 minutes, 30 minutes, 1 hour, 2 hours, and 3 hours, with 1 hour as the default; custom intervals are out of scope.
- Q: When notification permission is denied, how should the app offer to allow notifications? → A: Request the runtime permission in-app, and deep-link to system notification settings when permission is permanently denied or notifications are disabled at the OS level.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure the Reminder Cycle and Active Hours (Priority: P1)

As a person who wants gentle, predictable nudges to check in, I want to choose how often reminders repeat and the daily window in which they are allowed to appear, so that reminders match my working hours instead of interrupting me at night or on a fixed schedule I cannot change.

**Why this priority**: The fixed-cycle reminder and the daily active-hours window are the core of the request and the main source of user value; without them the feature does not exist.

**Independent Test**: Open Settings, enable reminders, set the cycle to a chosen interval and the active window to a chosen start and end time, then verify that reminder notifications appear only inside the window and at the configured cycle.

**Acceptance Scenarios**:

1. **Given** reminders are enabled, **When** the user selects a reminder cycle from the available options, **Then** the chosen cycle is saved and subsequent reminders follow that cycle.
2. **Given** reminders are enabled, **When** the user sets a daily start and end time for the active window, **Then** reminders are delivered only at times within that window.
3. **Given** the configured window is 09:00 to 23:00 and the cycle is 1 hour, **When** the device clock is inside the window, **Then** a reminder is delivered approximately once per hour and no reminder is delivered outside 09:00–23:00.
4. **Given** the configured window is 09:00 to 23:00 and the cycle is 1 hour, **When** the window opens at 09:00, **Then** the first reminder is delivered at 10:00 (one cycle after the window opens) and subsequent reminders follow the cycle.
5. **Given** a reminder is delivered, **When** it appears, **Then** it shows neutral reminder copy that does not name any tracked activity and offers a single action that opens the app.
6. **Given** reminders are enabled, **When** the user turns reminders off, **Then** no further reminder notifications are delivered while off, and the previously chosen cycle and window are retained.
7. **Given** the user changes the cycle or the window, **When** the change is saved, **Then** it takes effect without the user restarting the app.

---

### User Story 2 - Reach All Configuration from One Settings Page (Priority: P1)

As a person using the Android app, I want a single Settings page that holds the app's configuration, so that I do not have to hunt for options scattered across the tracking screen.

**Why this priority**: The settings page is the required home for the new reminder options and for the configuration currently shown on the main screen; it is a prerequisite for configuring the reminder.

**Independent Test**: Open Settings from the main screen and confirm that the desktop connection/sync configuration (including the Sync action) and the notification reminder configuration are present and editable there, and that the main screen no longer presents configuration controls or the Sync action inline.

**Acceptance Scenarios**:

1. **Given** the user is on the main tracking screen, **When** they open Settings, **Then** a Settings page is shown that contains the desktop connection/sync configuration (including the Sync action and its status) and the notification reminder configuration.
2. **Given** the Settings page is open, **When** the user edits and saves the desktop connection details, **Then** the values are saved exactly as before and the saved connection is shown on the Settings page.
3. **Given** the user wants to sync, **When** they are on the main tracking screen, **Then** no Sync action or connection status is shown there and the user reaches Sync by opening Settings.
4. **Given** the user returns from Settings to the main screen, **When** the main screen is shown, **Then** the main screen focuses on tracking actions and provides a way back into Settings rather than hosting configuration controls or the Sync action inline.

---

### User Story 3 - Test the Reminder Notification On Demand (Priority: P2)

As a person setting up reminders, I want a small button that immediately shows a sample reminder, so that I can confirm notifications are permitted and working before relying on them.

**Why this priority**: Testing is valuable for trust and troubleshooting, but the reminder itself is useful without it.

**Independent Test**: On the Settings page, activate the test button and verify that a sample reminder notification appears immediately without waiting for the next cycle or window.

**Acceptance Scenarios**:

1. **Given** notifications are permitted, **When** the user activates the test button, **Then** a sample reminder notification is shown immediately.
2. **Given** the test button is used, **When** the sample notification appears, **Then** the configured cycle, active window, and reminder enabled/disabled state are unchanged.
3. **Given** notifications are not permitted, **When** the user activates the test button, **Then** the app explains that notifications must be allowed and requests the runtime permission in-app instead of silently doing nothing.
4. **Given** notification permission is permanently denied or notifications are disabled at the OS level, **When** the user activates the test button or opens the notification settings, **Then** the app offers a deep link to the system notification settings for this app.

---

### Edge Cases

- The active window crosses midnight (for example 22:00 to 06:00); reminders are still delivered only within that overnight window.
- The window start and end are the same time; the app treats this as an empty window and delivers no reminders.
- The user enables reminders but notification permission is denied or later revoked; no reminders can display, and Settings surfaces the permission state, requests the runtime permission in-app, and deep-links to system notification settings when permission is permanently denied or notifications are disabled at the OS level.
- A reminder cycle is in progress when the active window closes; the cycle stops delivering at the window boundary and restarts when the window next opens, so the first reminder of the next window arrives one cycle after it opens.
- The user changes the cycle or window while a reminder cycle is already in progress; the new configuration governs subsequent reminders.
- The device is restarted, or the app process is closed and reopened; saved reminder settings are restored and reminders resume when enabled.
- The device time zone changes or daylight saving time shifts; reminders follow the device's current local time.
- The test button is used while reminders are disabled or the current time is outside the active window; the sample notification still appears so testing remains possible.
- Reminders are disabled; pending scheduled reminders are cancelled rather than left to fire.
- The main screen is opened before any settings have been changed; defaults are applied and shown in Settings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Android app MUST provide a single Settings page that contains all user-configurable app options, including the desktop connection/sync configuration (the Sync action and its status) and the notification reminder configuration.
- **FR-002**: The main tracking screen MUST NOT host configuration controls or the Sync action inline; it MUST provide a clear way to open the Settings page, while retaining the primary tracking actions.
- **FR-003**: Users MUST be able to enable or disable reminder notifications from the Settings page.
- **FR-004**: Users MUST be able to choose the reminder cycle (how often reminders repeat) from the presets 15 minutes, 30 minutes, 1 hour, 2 hours, and 3 hours, with a default of one hour; custom intervals are out of scope.
- **FR-005**: Users MUST be able to define a daily active window with a start time and an end time during which reminders are allowed to trigger.
- **FR-006**: The system MUST deliver reminders only at times within the configured active window and at approximately the configured cycle while reminders are enabled; the cycle MUST restart when the active window opens, so the first reminder arrives one cycle after the window opens.
- **FR-007**: The system MUST deliver no reminders while reminders are disabled, and disabling reminders MUST cancel any already-scheduled reminders.
- **FR-008**: The active window MUST support ranges that cross midnight, and the system MUST treat an empty window (start equal to end) as delivering no reminders.
- **FR-009**: Changes to the reminder enabled state, cycle, or active window MUST take effect without requiring the user to restart the app.
- **FR-010**: Reminder settings MUST persist on the device and be restored after the app is closed and reopened or the device is restarted.
- **FR-011**: Reminders MUST be delivered according to the device's current local time, including after a time zone change or daylight saving shift.
- **FR-012**: The Settings page MUST provide a test control that immediately shows a sample reminder notification when notifications are permitted.
- **FR-013**: Using the test control MUST NOT change the reminder enabled state, cycle, active window, or any scheduled reminder.
- **FR-014**: When notifications are not permitted, the Settings page MUST show the notification permission state and MUST offer a way for the user to allow notifications: it MUST request the runtime permission in-app and MUST deep-link to the system notification settings when permission is permanently denied or notifications are disabled at the OS level; the test control MUST explain that permission is required rather than failing silently.
- **FR-015**: The desktop connection/sync configuration previously available on the main screen, including the Sync action, MUST remain available and behave as before after being moved into Settings.
- **FR-016**: Reminders MUST be scheduled on the configured fixed cycle independent of whether a tracking session is currently running.
- **FR-017**: Reminder notifications MUST use neutral copy that does not name any tracked activity and MUST offer a single action that opens the app.

### Key Entities *(include if feature involves data)*

- **Reminder Settings**: The user's saved reminder configuration: whether reminders are enabled, the selected cycle interval, the daily active-window start time, and the active-window end time.
- **Reminder**: A notification prompting the user to check in on their tracking; it has no dependency on a running session, uses neutral copy that does not name any tracked activity, offers a single action that opens the app, and is subject to the active window and cycle.
- **Test Reminder**: A one-off sample notification triggered from Settings that demonstrates reminder content without altering Reminder Settings or the schedule.
- **Desktop Connection Configuration**: The saved desktop sync endpoint details (address and port) and related sync action, moved into the Settings page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of reminder settings (enabled state, cycle, and active-window start and end) are editable from the Settings page and are retained after the app is closed and reopened.
- **SC-002**: In 100% of schedule checks, reminders are delivered only inside the configured active window; with a 09:00–23:00 window and a one-hour cycle, no reminder is observed outside that window, the first reminder arrives at 10:00, and reminders occur about once per hour inside it.
- **SC-003**: In 100% of checks, disabling reminders stops further reminder notifications, and re-enabling restores them without re-entering the previous settings.
- **SC-004**: In 100% of tests, activating the test control shows a sample reminder notification immediately when notifications are permitted, without changing the enabled state, cycle, or window.
- **SC-005**: 100% of desktop connection/sync configuration and the Sync action that existed on the main screen are available on the Settings page and behave as before.
- **SC-006**: At least 90% of usability-test participants can find and change the reminder cycle and active window on their first attempt without assistance.
- **SC-007**: At least 85% of usability-test participants rate setting up reminders as easy or very easy on a five-point scale.

## Assumptions

- "Settings page" means a single Android Settings screen that is the home for all app configuration; the existing desktop connection/sync configuration (including the Sync action and its status) and the notification permission information move there, and the main screen keeps only tracking actions plus a way to open Settings, with no inline configuration or Sync action.
- The fixed-cycle reminder is an independent, always-on reminder (while enabled) that repeats on the chosen cycle regardless of whether a tracking session is running; it replaces the current behavior where the hourly reminder only exists while a manual session is running.
- The available cycle intervals are presets including 15 minutes, 30 minutes, 1 hour, 2 hours, and 3 hours, with 1 hour as the default; custom free-form intervals are out of scope.
- The active-window default is 09:00–23:00, matching the example, and the window is evaluated in the device's local time; the start time is inclusive and the end time is exclusive.
- The cycle restarts when the active window opens; the first reminder after enabling or after a window opens arrives one cycle after that point (for example 10:00 for a 09:00 window with a one-hour cycle), and the cycle stops delivering at the window boundary.
- The test control sends a sample reminder immediately, even when reminders are disabled or the current time is outside the active window, so the user can verify delivery.
- Reminder settings are stored on the device only; they are not synced to the desktop and do not affect desktop behavior.
- Android notification permission behavior (including the Android 13+ runtime permission) is reused; if permission is denied, reminders cannot display, the app surfaces that state in Settings, requests the runtime permission in-app, and deep-links to the system notification settings when permission is permanently denied or notifications are disabled at the OS level.
- The reminder notification uses neutral copy that does not name any tracked activity and a single action that opens the app; the former session-named content and "Still working" action are retired along with the session-only reminder.
- This feature applies to the Android companion only; desktop tracking, sync behavior, and data are unchanged.
