# Contract: Android Reminder Scheduling

**Feature**: [Android Notification Reminder Settings](../spec.md)  
**Surface**: In-app reminder behavior on the Android companion. No network, desktop, or sync interface is involved.

This contract defines the observable reminder-scheduling behavior that the app must honor. It is implemented by a pure schedule function plus a WorkManager one-time work chain; it makes no promise about the exact wall-clock instant of delivery beyond WorkManager's normal tolerance ("approximately" the configured cycle).

## Inputs

| Input | Source | Values |
|---|---|---|
| Reminders enabled | `reminder_settings.enabled` | Boolean; default `false` |
| Cycle | `reminder_settings.interval_minutes` | Preset: 15, 30, 60 (default), 120, 180 minutes |
| Window start | `reminder_settings.window_start_minutes` | Minutes since local midnight, `0..1439`; default 540 (09:00) |
| Window end | `reminder_settings.window_end_minutes` | Minutes since local midnight, `0..1439`; default 1380 (23:00) |
| Now | Device clock | Evaluated in the device's current local zone |

The window is `[start, end)` in local time: start inclusive, end exclusive.

## Schedule rules

1. **Disabled** → no trigger is ever produced.
2. **Empty window** (`start == end`) → no trigger is ever produced.
3. **Same-day window** (`start < end`) → the cycle is anchored at the window opening on the relevant local day; the first trigger is `open + cycle`; subsequent triggers step by the cycle while strictly before `end`.
4. **Overnight window** (`start > end`) → identical rules, with the close occurring on the following local day; triggers wrap past midnight.
5. **Cycle restart at open** → a new window always restarts the cadence; the first reminder of a window is one cycle after it opens. Example: 09:00–23:00 with a 1-hour cycle produces 10:00, 11:00, …, 22:00.
6. **Window boundary** → no trigger is delivered at or after the close; the next trigger belongs to the next opening (or overnight continuation).
7. **Window shorter than one cycle** → no trigger fits; nothing is delivered in that window.
8. **Local time** → the window and anchor use the device's current local zone on each decision, so a time-zone change or DST shift is followed.

## Delivery rules

- On each run: if reminders are disabled, do nothing and schedule nothing.
- If the current instant is outside the active window (or the window is empty), do not post; schedule the next trigger.
- If inside the window and notifications are permitted, post the reminder notification (below); schedule the next trigger.
- If inside the window but notifications are not permitted, do not post; schedule the next trigger (the permission state is surfaced in Settings).
- Reminders are scheduled independently of whether a tracking session is running.

## Notification contract

| Aspect | Value |
|---|---|
| Channel | `reminders` |
| Content title | `Time check-in` |
| Body | Neutral copy that does not name any tracked activity, e.g. `What have you been working on?` |
| Actions | Exactly one: **Open app**, which launches `MainActivity` |
| Forbidden | Naming a tracked activity/title; any "Still working" / confirm-in-place action |

## Test trigger contract

- Triggered only from Settings by an explicit user action.
- Posts the same rendering immediately when notifications are permitted, regardless of the enabled state or current time.
- Does not change `enabled`, the cycle, the window, or any scheduled work.
- When notifications are not permitted, it explains that permission is required and offers the request/deep-link affordance instead of posting.

## Lifecycle rules

| Event | Behavior |
|---|---|
| Reminders enabled | Cancel any existing chain and enqueue a new one from the current local time. |
| Reminders disabled | Cancel all reminder work; deliver nothing; retain cycle and window. |
| Cycle or window changed | Cancel and re-enqueue so the new configuration governs subsequent reminders without an app restart. |
| App process closed / device rebooted | WorkManager persists the chain; on startup the app re-enqueues from persisted settings so reminders resume. |
| Time zone / DST change | The next decision uses the new local zone. |

## Out of scope

- Custom (non-preset) intervals.
- Exact-time alarms and the exact-alarm permission.
- Cloud, desktop, or cross-device reminder behavior.
- Any change to tracking sessions or sync.
