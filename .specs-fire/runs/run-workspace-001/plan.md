---
run: run-workspace-001
work_item: pomodoro-tab-notifications
intent: pomodoro-background-notify
mode: confirm
checkpoint: plan
approved_at: 2026-09-06T11:06:00Z
---

# Implementation Plan: Pomodoro Tab Notifications

## Approach

Extend the existing Pomodoro settings with a default-off notification preference and keep all browser API access inside client-side code. Add a small guarded notification helper for permission requests, background visibility checks, notification construction, and click-to-focus behavior. Mount a phase-complete notification subscriber beside the existing modal alert so both consume the existing `subscribePhaseComplete` signal; it will notify only when the tab is hidden, the preference is enabled, and permission is granted. The Pomodoro page will expose a user-click opt-in control, persist the preference through the provider's existing settings effect, and explain unsupported, denied, or failed alerts without interrupting the timer.

## Files to Create

| File | Purpose |
|------|---------|
| `app/lib/pomodoro/notifications.ts` | Guarded browser notification helpers and background-notification eligibility logic. |
| `app/lib/pomodoro/PomodoroPhaseNotification.tsx` | Client subscriber that shows system notifications for hidden-tab phase completions. |
| `app/lib/pomodoro/notifications.test.ts` | Focused tests for hidden-tab eligibility, unsupported APIs, and click handling. |

## Files to Modify

| File | Changes |
|------|---------|
| `app/lib/pomodoro/types.ts` | Add the persisted default-off notification preference and notification status type. |
| `app/lib/pomodoro/storage.ts` | Parse and preserve the notification preference in existing local-storage settings. |
| `app/lib/pomodoro/PomodoroProvider.tsx` | Expose notification permission/status actions and mount the system-notification subscriber. |
| `app/lib/pomodoro/PomodoroPhaseAlert.tsx` | No behavior change; retain the existing visible-tab modal and sound alongside the new subscriber. |
| `app/pomodoro/PomodoroView.tsx` | Add the click-to-opt-in control and plain-language blocked-alert status. |
| `app/lib/pomodoro/storage.test.ts` | Cover default-off, persisted, and legacy settings parsing. |
| `package.json` | Bump the application version for the delivered feature. |
| `CHANGELOG.md` | Document the Pomodoro background notification feature. |

## Tests

| Test File | Coverage |
|-----------|----------|
| `app/lib/pomodoro/storage.test.ts` | Notification preference defaults off and round-trips through existing settings storage. |
| `app/lib/pomodoro/notifications.test.ts` | Hidden-tab gating, missing Notification support, permission handling, notification construction, and click-to-focus behavior. |

## Technical Details

- Use `"use client"` only for components that access state, effects, or browser APIs, consistent with the installed Next.js 16 App Router guidance.
- Request permission only from the Pomodoro page control's click handler; page load and phase-complete effects only inspect current permission.
- Use `document.visibilityState !== "visible"` as the background condition, while the existing modal and sound remain unchanged for visible tabs.
- Catch unsupported APIs, permission-request failures, and constructor failures so notification issues cannot stop timer transitions.
- Do not add backend writes, session-tracker coupling, a second timer, or third-party dependencies.

---
*Plan approved at checkpoint. Execution follows.*
