---
run: run-nameh-amal-004
work_item: pomodoro-phase-alert
intent: pomodoro-timer
mode: autopilot
---

# Implementation Plan: Phase End Alert

## Approach

Mount a layout-level `PomodoroPhaseAlert` client component inside `PomodoroProvider`. Subscribe to `subscribePhaseComplete`, show a dismissible modal naming the completed and next phases, and play a short Web Audio beep. Engine already auto-advances phases; modal is notification-only.

## Files to Create

| File | Purpose |
|------|---------|
| `app/lib/pomodoro/phase-labels.ts` | Shared phase labels + alert message helper |
| `app/lib/pomodoro/phase-labels.test.ts` | Unit tests for alert message formatting |
| `app/lib/pomodoro/play-alert-sound.ts` | Web Audio beep with graceful autoplay failure |
| `app/lib/pomodoro/PomodoroPhaseAlert.tsx` | Global modal alert UI |

## Files to Modify

| File | Changes |
|------|---------|
| `app/lib/pomodoro/PomodoroProvider.tsx` | Pass `nextPhase` to phase-complete subscribers |
| `app/lib/pomodoro/use-pomodoro.ts` | Update subscriber type |
| `app/lib/pomodoro/PomodoroProvider.tsx` | Mount `PomodoroPhaseAlert` inside provider |
| `app/pomodoro/PomodoroView.tsx` | Use shared `PHASE_LABELS` |
