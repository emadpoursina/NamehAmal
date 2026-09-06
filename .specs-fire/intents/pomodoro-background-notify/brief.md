---
id: pomodoro-background-notify
title: Pomodoro Background Notifications
status: in_progress
created: 2026-09-06T10:59:00Z
---

# Intent: Pomodoro Background Notifications

## Goal

When a Pomodoro phase ends, the user still gets a **clear notification even if they are looking at another browser tab**. The existing in-page modal and sound stay for when they are on this app. The new piece is a **system notification** from the browser (the little OS/browser pop-up), so a hidden tab can still interrupt them.

## Users

The single owner of this local-first app (same person who already uses the Pomodoro page and floating widget).

## Problem

Today, phase end is announced with a modal and a sound **inside the page**. If the user is in another tab, they often miss it: the page is hidden, sound may not play, and nothing appears in the operating system. They come back late and the cycle has already moved on without them noticing.

## Success Criteria

- After the user allows notifications, ending a phase shows a system notification even when this app’s tab is in the background.
- Clicking that notification brings them back to this app’s tab.
- The existing on-page modal and sound still work when they are looking at the app.
- If they refuse permission, or the browser cannot show notifications, the timer still works; they only miss the extra pop-up (no errors, no nag loop).
- No change to session tracking, Pomodoro cycle rules, or the floating widget’s job.

## Constraints

- Stay on the current stack: Next.js App Router, TypeScript, client-side Pomodoro engine already in the app.
- Use the browser’s built-in notification feature only. No email, SMS, phone apps, or extra servers.
- Reuse the existing “phase complete” signal. Do not invent a second timer.
- Settings stay on the Pomodoro page (not mixed into `/settings`).
- Persist the user’s “I want these notifications” choice with the existing Pomodoro local storage, next to other Pomodoro settings.
- No Pomodoro stats, no session-tracker coupling, no pause button, no third-party notification services.

## Notes

### Discovery (planner)

Assessed as **low** complexity (one concern: notify when the tab is hidden). The user asked for this while the planner was running as a background agent, so these answers were taken from the request plus the existing Pomodoro intent instead of a five-question chat:

1. **Goal** — A notice they can see/hear even in another tab when a phase ends.
2. **Users** — The app owner, same as today’s Pomodoro.
3. **Scope** — In: browser system notifications + a simple on/off (with permission) on the Pomodoro page. Out: mobile push, email, Slack, custom sounds beyond what we already play, changing cycle logic.
4. **Constraints** — Existing Pomodoro engine, page, modal, and sound; local-first; no new backend.
5. **Success** — With permission granted, switch to another tab, wait for a phase to end (or skip to end one), and still see a system notification.

### UI (this intent)

- On the Pomodoro page, a short control such as “Notify me when a phase ends (even in another tab)”.
- Turning it on asks the browser for permission in the usual way.
- If permission is blocked, show a plain-language note: the browser is blocking alerts; they can still use the in-page modal.

### Behavior

- On phase complete (natural end or Skip that completes a phase), if permission is granted and the user opted in, show a system notification naming the finished phase and the next one.
- Prefer showing the system notification when the tab is **not visible**; when the tab **is** visible, the existing modal + sound remain the main alert (system notification may still fire or be skipped if the tab is focused — builder should pick the less noisy option that still covers the other-tab case).
- Clicking the notification focuses this app’s window/tab.

### Scope (in)

- Opt-in + browser permission on the Pomodoro page.
- System notification on phase end, working with a background tab.
- Graceful fallback when permission is denied or the browser has no Notification API.

### Scope (out)

- Push notifications after the browser is fully closed (that needs extra services).
- Changing focus/rest durations or cycle rules.
- Replacing the existing modal/sound.
- Session tracker integration.
