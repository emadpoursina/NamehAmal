# Data Model: Android Notification Reminder Settings

This feature adds one small, device-local configuration store and a transient reminder chain. It adds no persisted tracking entity: the Android Room database (`TrackerDatabase`, schema v5) is unchanged, and the desktop remains authoritative for tracking data. The existing saved desktop endpoint is retained and only relocated in the UI.

## Entities

### Reminder Settings (Android DataStore: `reminder_settings`)

The user's saved reminder configuration. Persisted on the device and restored after app close or device restart (FR-010).

| Field | Type | Rules |
|---|---|---|
| `enabled` | Boolean | Default `false`. Reminders are opted into from Settings. Disabling cancels pending reminder work and retains the other values (FR-007, FR-003). |
| `intervalMinutes` | Int | Default `60`. Must be one of the presets `15`, `30`, `60`, `120`, `180` (FR-004). Invalid stored values fall back to the default. |
| `windowStartMinutes` | Int | Default `540` (09:00). Minutes since local midnight, `0..1439` (FR-005). |
| `windowEndMinutes` | Int | Default `1380` (23:00). Minutes since local midnight, `0..1439`. Start is inclusive, end is exclusive; start equal to end is an empty window (FR-008). |

Derived:

- **Active window**: `[windowStartMinutes, windowEndMinutes)` evaluated in the device's current local zone. `start < end` is a same-day window; `start > end` is an overnight window; `start == end` is empty. The window may be open or closed at any instant; the schedule function decides whether the next trigger falls inside it.
- **Cycle presets**: `ReminderCycle` — `MINUTES_15`, `MINUTES_30`, `HOUR_1` (default), `HOURS_2`, `HOURS_3`.

Validation: interval must be a preset; window minutes must be `0..1439`; edits that fail validation keep the last valid value. Settings are device-local only and are never uploaded or synced (spec assumption).

### Reminder Schedule (derived, not persisted)

Computed by the pure `ReminderSchedule` function from `now` (device-local `ZonedDateTime`), the active window, and the interval.

- The cycle is **anchored at the window opening**: the first trigger is `open + interval`, and triggers step by `interval` while strictly before the window close (FR-006).
- For 09:00–23:00 with a 1-hour cycle the triggers are 10:00, 11:00, …, 22:00; the first reminder arrives at 10:00 (acceptance scenario US1-4).
- For an overnight window (e.g. 22:00–06:00) the triggers wrap past midnight (e.g. 23:00, 00:00, …, 05:00).
- An empty window yields no trigger.
- The window must be at least one interval long for any trigger to fit.

### Reminder (transient notification)

A posted notification prompting the user to check in. It has no dependency on a running session, uses neutral copy that does not name any tracked activity, offers exactly one action ("Open app") that launches `MainActivity`, and is subject to the active window and cycle (FR-016, FR-017). Channel: `reminders`. Not persisted as an entity.

### Test Reminder (transient notification)

A one-off sample notification triggered from Settings. It reuses the Reminder rendering, is posted immediately when notifications are permitted, and never changes the enabled state, cycle, window, or scheduled work (FR-012, FR-013). It is delivered even when reminders are disabled or the current time is outside the window.

### Notification Permission State (derived, not persisted)

Reported by `ReminderPermission` for the Settings screen (FR-014).

| State | Condition | Settings behavior |
|---|---|---|
| Granted | API 33+ `POST_NOTIFICATIONS` granted, or API < 33, and `areNotificationsEnabled()` | Show that reminders can be delivered; test button posts. |
| Requestable | Not granted but the runtime dialog can still be shown | Offer "Allow notifications" to request the runtime permission in-app. |
| Blocked | Notifications disabled at OS level, or permission permanently denied | Offer a deep link to the app's system notification settings. |

### Desktop Connection Configuration (existing Android DataStore: `sync_endpoint`)

The saved desktop sync host and port and the explicit Sync action, moved from the main screen into Settings. Unchanged in behavior and storage (FR-015): host is an IP literal or hostname, port is `1..65535`, saving works offline, and private-network resolution is enforced at connection time. This feature only relocates the UI that edits and invokes it.

## State transitions

### Reminder enabled state

1. `DISABLED -> ENABLED`: user turns reminders on in Settings. Compute the next trigger from the saved window/cycle and enqueue the reminder work chain.
2. `ENABLED -> DISABLED`: user turns reminders off. Cancel all reminder work; deliver no further reminders; retain cycle and window (FR-007).
3. `ENABLED -> ENABLED (edited)`: user changes the cycle or window. Cancel and re-enqueue so the new configuration governs subsequent reminders without a restart (FR-009).

### Cycle within a day

1. `BEFORE_WINDOW -> IN_WINDOW`: at the window open the cycle is anchored; the first reminder fires one cycle later.
2. `IN_WINDOW -> IN_WINDOW`: each run posts a reminder and schedules the next trigger one cycle later, while the next trigger is inside the window.
3. `IN_WINDOW -> AFTER_WINDOW`: the next computed trigger would fall at/after the close, so no reminder is delivered at the boundary; the next trigger becomes the next window's open + interval (or overnight continuation).
4. `ANY -> RESTORED`: after process death/reboot, settings are read and the chain is re-enqueued from the current local time (FR-010).

### Reminder delivery

1. Worker runs → if reminders are disabled, do nothing and schedule nothing.
2. Worker runs → if the current instant is outside the active window (or the window is empty), do not post; schedule the next trigger.
3. Worker runs → if inside the window and permission is granted, post the neutral reminder with the "Open app" action; schedule the next trigger.
4. Worker runs → if inside the window but notifications are not permitted, do not post (the permission state is surfaced in Settings); schedule the next trigger.

### Test reminder

1. `PERMITTED -> POSTED`: post the sample immediately; settings and scheduled work are unchanged.
2. `NOT_PERMITTED -> EXPLAINED`: show that notifications must be allowed and offer the request/deep-link affordance; post nothing and change nothing.

## Ordering and evaluation rules

- Time is evaluated in the device's current local zone on every decision, so time-zone changes and DST shifts are followed (FR-011).
- The window uses local wall-clock minutes since midnight; the cycle anchor is the window opening in that zone on the relevant day.
- `start == end` is empty and delivers nothing; `start > end` is treated as overnight.
- Settings changes take effect immediately (no app restart) by cancelling and re-enqueueing the chain.
- Reminder scheduling is independent of any tracking session.

## Migration / compatibility

- No Room schema change: `TrackerDatabase` stays at version 5; existing tables (including legacy check-in tables) are retained.
- New DataStore keys are additive; absent keys read as the documented defaults, so an existing installation starts with reminders disabled and the 09:00–23:00 / 1-hour defaults.
- Legacy scheduled workday/session check-in work is cancelled at startup and not rescheduled; existing saved endpoint settings are preserved and now edited from Settings.
