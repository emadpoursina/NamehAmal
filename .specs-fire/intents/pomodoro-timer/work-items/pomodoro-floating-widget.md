---
id: pomodoro-floating-widget
title: Floating Widget
intent: pomodoro-timer
complexity: medium
mode: confirm
status: pending
depends_on: [pomodoro-core-engine, pomodoro-phase-alert]
created: 2026-07-23T09:48:54Z
---

# Work Item: Floating Widget

## Description

Add a small always-visible floating Pomodoro widget in the app shell (unless the user has manually hidden it). Show phase, remaining time, and Start / Stop / Skip. Persist hide/show via the engine. Stay in sync with the Pomodoro page across routes.

## Acceptance Criteria

- [ ] Widget visible on all main app pages when not manually hidden (including idle).
- [ ] User can hide the widget and show it again (restore control accessible, e.g. small tab/button or control on `/pomodoro`).
- [ ] Controls: Start, Stop, Skip — no pause.
- [ ] Remaining time and phase stay in sync with `/pomodoro` and the core engine.
- [ ] Phase-end modal + sound still fire when controlling the timer from the widget on non-Pomodoro pages.
- [ ] No session-tracker coupling.

## Technical Notes

- Mount from root layout alongside the phase-alert consumer; share the same provider from `pomodoro-core-engine`.
- Keep the widget compact; avoid covering primary nav/CTAs on mobile.

## Dependencies

- pomodoro-core-engine
- pomodoro-phase-alert
