---
id: pomodoro-phase-alert
title: Phase End Alert
intent: pomodoro-timer
complexity: low
mode: autopilot
status: pending
depends_on: [pomodoro-core-engine]
created: 2026-07-23T09:48:54Z
---

# Work Item: Phase End Alert

## Description

When a Pomodoro phase completes (natural countdown or Skip that completes a phase), show a modal and play a short sound alert. Mount globally so it works from the Pomodoro page or other routes once the widget exists.

## Acceptance Criteria

- [ ] On phase complete, a modal is shown identifying the completed phase and/or the next phase.
- [ ] A sound alert plays when the modal appears (browser-permitted; degrade gracefully if autoplay is blocked until user gesture context exists).
- [ ] User can dismiss the modal; timer may already have advanced to the next phase per engine rules (document behavior: auto-advance vs wait for dismiss — pick auto-advance of phase with modal as notification unless product says otherwise).
- [ ] Works regardless of which page the user is on (layout-level mount).
- [ ] No session-tracker side effects.

## Technical Notes

- Use a short built-in sound (e.g. Web Audio beep or a small static asset under `public/`).
- Subscribe to the core engine’s phase-complete signal; do not duplicate timer logic.

## Dependencies

- pomodoro-core-engine
