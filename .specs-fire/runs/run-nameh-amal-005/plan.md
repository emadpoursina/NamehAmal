---
run: run-nameh-amal-005
work_item: pomodoro-floating-widget
intent: pomodoro-timer
mode: confirm
checkpoint: plan
approved_at: 2026-07-23T12:52:31Z
---

# Implementation Plan: Floating Widget

## Approach

Add a compact fixed-position widget mounted in `PomodoroProvider` (alongside phase alert). When visible, show phase + countdown + Start/Stop/Skip + hide control. When hidden (`state.widgetHidden`), show a small restore tab. Add show/hide toggle on `/pomodoro` page.

## Files to Create

| File | Purpose |
|------|---------|
| `app/lib/pomodoro/PomodoroFloatingWidget.tsx` | Fixed widget + restore tab |

## Files to Modify

| File | Changes |
|------|---------|
| `app/lib/pomodoro/PomodoroProvider.tsx` | Mount `PomodoroFloatingWidget` |
| `app/pomodoro/PomodoroView.tsx` | Widget show/hide control card |

## Tests

No new unit tests — UI-only; existing engine tests cover shared state.
