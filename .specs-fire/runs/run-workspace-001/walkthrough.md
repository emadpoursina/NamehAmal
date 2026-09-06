---
run: run-workspace-001
work_item: pomodoro-tab-notifications
intent: pomodoro-background-notify
generated: 2026-09-06T11:09:00Z
mode: confirm
---

# Implementation Walkthrough: Pomodoro Tab Notifications

## Summary

Pomodoro users can opt in to browser notifications from the Pomodoro settings card. The preference is stored with the existing local settings, permission is requested only after the checkbox interaction, and hidden-tab phase completions show a notification that names the completed and next phases. The existing visible-tab modal and sound continue to use the same phase-complete signal.

## Structure Overview

The page control updates the provider-owned Pomodoro settings. The provider exposes guarded notification permission state and mounts a null-rendering phase subscriber next to the existing modal alert. On phase completion, the subscriber checks the persisted opt-in, permission, and document visibility before constructing a browser notification. Browser API failures update the provider status so the page can explain the fallback without changing timer state.

## Architecture

### Pattern Used

Client-side observer over the existing Pomodoro phase-complete event bus. This keeps notification delivery separate from timer transitions while allowing the modal/sound observer and system-notification observer to react to the same completion.

### Layer Structure

```text
┌───────────────────────────────┐
│ Pomodoro page control          │
│ opt-in + permission click      │
├───────────────────────────────┤
│ PomodoroProvider               │
│ settings + notification status │
├───────────────────────────────┤
│ Phase-complete subscribers     │
│ modal/sound + system alert     │
├───────────────────────────────┤
│ Browser Notification API       │
└───────────────────────────────┘
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `app/lib/pomodoro/notifications.ts` | Guards browser support, requests permission, gates hidden-tab alerts, and implements click-to-focus behavior. |
| `app/lib/pomodoro/PomodoroPhaseNotification.tsx` | Subscribes to existing phase completions and shows system notifications only for hidden tabs. |
| `app/lib/pomodoro/notifications.test.ts` | Tests hidden-tab gating, missing support, permission, notification content, click focus, and constructor failures. |

### Modified

| File | Changes |
|------|---------|
| `app/lib/pomodoro/types.ts` | Added default-off `notifyOnPhaseComplete` setting and notification status type. |
| `app/lib/pomodoro/storage.ts` | Parses the new setting and preserves it in the existing settings payload. |
| `app/lib/pomodoro/storage.test.ts` | Covers legacy/default behavior and settings round-trip persistence. |
| `app/lib/pomodoro/PomodoroProvider.tsx` | Exposes notification state/actions and mounts the new subscriber beside the existing phase alert. |
| `app/pomodoro/PomodoroView.tsx` | Added the on/off control, user-click permission request, and blocked-alert explanation. |
| `package.json` | Bumped application version to `0.1.7`. |
| `CHANGELOG.md` | Documented the delivered feature. |

## Key Implementation Details

### 1. User-controlled permission

The checkbox handler enables the persisted preference and calls `Notification.requestPermission()` only in response to that user interaction. No page-load or phase-complete code requests permission.

### 2. Background-only system alerts

The system notification subscriber consumes `subscribePhaseComplete` and requires the preference to be enabled, permission to be granted, and `document.visibilityState` to be non-visible. Visible tabs continue to receive the existing modal and sound without an additional pop-up.

### 3. Graceful browser fallback

Missing APIs, denied permission, permission request failures, and notification constructor failures are caught. The timer and existing alert path continue, while the Pomodoro page displays plain-language fallback text.

### 4. Focus behavior

Notification clicks focus the app window and close the notification.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Preference location | Existing Pomodoro settings local-storage payload | Preserves the local-first settings model and restores the choice after refresh. |
| Notification timing | Hidden tabs only | Prevents stacking a system pop-up over the existing visible-tab modal and sound. |
| Integration point | Existing `subscribePhaseComplete` signal | Covers countdown completion and Skip without duplicating timer logic or coupling to session tracking. |
| Failure handling | Guard and report status in the client provider | Browser support and permission are optional; notification failure must not interrupt the timer. |

## Deviations from Plan

None.

## Dependencies Added

| Package | Why Needed |
|---------|------------|
| (none) | Uses the browser Notification API and existing project dependencies. |

## How to Verify

1. **Run automated checks**

   ```bash
   npm test -- --run
   npm run lint
   npx tsc --noEmit
   npm run build
   ```

   Expected: 26 tests pass, lint and type checking exit successfully, and the Next.js production build completes.

2. **Try the opt-in control**

   Open `/pomodoro`, select “Notify me when a phase ends, even in another tab,” and accept the browser permission prompt.

   Expected: the checkbox stays enabled after refresh and the preference is stored in the existing Pomodoro settings key.

3. **Verify the background path**

   Start a short Pomodoro phase, switch to another browser tab, and wait for completion or use Skip.

   Expected: a system notification identifies the completed and next phases; clicking it focuses the NamehAmal tab. Returning to the app still shows the existing modal/sound behavior.

4. **Verify fallback**

   Deny permission or use a browser without the Notification API.

   Expected: the Pomodoro page explains that browser alerts are blocked or unavailable, while the timer continues and the in-page alert remains available.

## Test Coverage

- Tests added: 7
- Automated tests passing: 26
- Coverage: Not configured
- Status: Passing

## Ready for Review

- [x] All acceptance criteria met
- [x] Tests passing
- [x] No critical issues
- [x] Documentation updated
- [x] Developer notes captured

## Developer Notes

The browser Notification API is intentionally isolated in `notifications.ts` so server rendering never touches browser globals and unsupported browsers remain safe. The initial production build required `npm rebuild better-sqlite3` because the verification environment installed dependencies with lifecycle scripts disabled; no application code change was needed for that environment issue.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-workspace-001*
