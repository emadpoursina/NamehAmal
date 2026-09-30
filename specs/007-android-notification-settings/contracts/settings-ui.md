# Contract: Android Settings UI

**Feature**: [Android Notification Reminder Settings](../spec.md)  
**Surface**: The Android app's Settings screen and the main tracking screen's entry point. This is a UI contract: it fixes what each screen must expose and what must no longer appear, not the visual styling.

## Main tracking screen

The main screen retains the primary tracking actions (add/start/stop/remove sessions, session list) and:

- MUST provide a clear control that opens Settings.
- MUST NOT host the desktop connection fields, the Sync action, sync status text, or the inline notification-permission card.
- MUST NOT show reminder configuration inline.

## Settings screen

A single screen that contains all user-configurable app options, in two sections:

### Reminder section

| Control | Required behavior |
|---|---|
| Reminders enabled toggle | Turns reminders on/off; turning off cancels pending reminders and retains the cycle/window; turning on or changing values applies without an app restart. |
| Cycle picker | Offers exactly the presets 15 minutes, 30 minutes, 1 hour (default), 2 hours, 3 hours. No free-form entry. |
| Window start picker | Sets the daily active-window start in device-local time. |
| Window end picker | Sets the daily active-window end in device-local time. |
| Test reminder button | Immediately posts the sample reminder when notifications are permitted; otherwise explains that permission is required and offers the request/deep-link affordance; never changes settings or scheduled work. |
| Permission state | Shows whether notifications are granted; offers an in-app runtime permission request when requestable and a deep link to system notification settings when blocked. |

### Desktop connection / sync section

| Control | Required behavior |
|---|---|
| Server address field | Editable host (IP literal or hostname); unchanged behavior from before the move. |
| Sync port field | Editable port `1..65535`; unchanged behavior. |
| Save / Forget | Persist or clear the saved endpoint exactly as before. |
| Saved endpoint display | Shows the saved host:port when present. |
| Sync action | Runs the explicit upload-only sync exactly as before, with its status/result message. |

## Navigation contract

- From the main screen, opening Settings shows the Settings screen.
- From Settings, a Back control returns to the main screen.
- Returning to the main screen preserves the main screen's state and shows only tracking content plus the Settings entry.

## Testability contract

Stable test tags must be present for at least:

- the Settings entry control on the main screen;
- the Settings content root and Back control;
- the reminders enabled toggle;
- the cycle picker and each cycle option;
- the window start and end pickers;
- the test reminder button;
- the notification permission affordance;
- the sync address/port fields and the Sync action.

## Out of scope

- Visual design, theming, or layout specifics beyond the controls above.
- Any desktop or web UI change.
- Any new configuration surface beyond reminder settings and the relocated sync configuration.
