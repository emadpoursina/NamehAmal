---
id: pomodoro-tab-notifications
title: Pomodoro Tab Notifications
intent: pomodoro-background-notify
complexity: medium
mode: confirm
status: pending
depends_on: []
created: 2026-09-06T10:59:00Z
---

# Work Item: Pomodoro Tab Notifications

## Description

Let the user turn on browser system notifications for Pomodoro phase end, so they still get a notice when this app’s tab is in the background. Add a simple opt-in on the Pomodoro page (asks the browser for permission). On phase complete, if they opted in and permission is granted, show a system notification. Keep the existing on-page modal and sound. Fail quietly if the browser blocks notifications.

## Acceptance Criteria

- [ ] The Pomodoro page has a clear on/off (or equivalent) for “notify me when a phase ends, even in another tab.”
- [ ] Turning it on requests browser notification permission after a user click (not on page load).
- [ ] The opt-in choice is saved with existing Pomodoro settings in local storage and restored after refresh.
- [ ] When opt-in is on and permission is `granted`, a phase complete (countdown end or Skip that completes a phase) shows a system notification that names the finished phase and the next phase.
- [ ] With the tab in the background, that system notification still appears (this is the main success case).
- [ ] Clicking the notification focuses this app’s tab/window.
- [ ] Existing phase-end modal and sound still appear when the user is on this app.
- [ ] If permission is denied, the Notification API is missing, or showing a notification throws, the timer continues; no crash; a short plain-language note on the Pomodoro page explains that alerts are blocked.
- [ ] Turning the opt-in off stops further system notifications (modal/sound unchanged).
- [ ] No session-tracker writes; no new backend or third-party notification service.

## Technical Notes

- Reuse `subscribePhaseComplete` from the existing Pomodoro provider (same signal as `PomodoroPhaseAlert`). Do not duplicate the engine.
- Use the browser Notification API in a client component only. Request permission from a user gesture.
- Persist a boolean on the existing settings object in `app/lib/pomodoro/storage.ts` (and types). Default **off** so current users are not prompted until they choose it.
- When the document is hidden (`document.visibilityState !== "visible"`), always attempt the system notification if opted in and granted. When the document is visible, skip the system notification to avoid stacking a pop-up on top of the modal (modal + sound remain).
- Notification `onclick` should call `window.focus()` (and close the notification).
- Keep copy short and non-technical on the page. Tests: preference persistence; “show notification only when hidden”; no throw when Notification is missing (mock/guard).

## Dependencies

(none — builds on the already-shipped Pomodoro engine and phase alert)
