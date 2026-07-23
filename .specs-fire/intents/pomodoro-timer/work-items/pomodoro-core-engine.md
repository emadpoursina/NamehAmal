---
id: pomodoro-core-engine
title: Pomodoro Core Engine
intent: pomodoro-timer
complexity: medium
mode: confirm
status: completed
depends_on: []
created: 2026-07-23T09:48:54Z
run_id: run-nameh-amal-003
completed_at: 2026-07-23T12:36:01.885Z
---

# Work Item: Pomodoro Core Engine

## Description

Build a client-side Pomodoro timer engine (state machine + persistence) that is fully separate from the session tracker. It manages settings (focus, short rest, long rest, long-rest interval N), current phase, remaining time, focus-session count toward long rest, and Start / Stop / Skip transitions. Persist settings and widget-visibility preference in localStorage. Emit a clear signal when a phase completes so UI can show modal + sound.

## Acceptance Criteria

- [ ] Defaults: focus 25m, short rest 5m, long rest 15m, long rest every 4 focus sessions — all configurable via the settings API of the engine.
- [ ] Phases cycle correctly: focus → short rest (or long rest after every N completed focus sessions) → focus…
- [ ] Start begins the current (or idle→focus) countdown; Stop cancels/resets the run without writing session-tracker data; Skip ends the current phase early and advances to the next phase (same as natural completion for cadence purposes, or documented equivalent).
- [ ] No pause control.
- [ ] Settings changes apply to the **next** phase (not mid-phase unless Stop resets).
- [ ] Settings and widget-hidden preference persist in localStorage and reload correctly.
- [ ] Phase-complete event/callback is available for alert UI.
- [ ] Zero coupling to session tracker APIs, `Session` model, or active-timer refresh bus — no DB writes for Pomodoro.

## Technical Notes

- Prefer a React context or small client store shared by page and floating widget; keep logic testable and free of Next.js route concerns.
- localStorage keys should be namespaced (e.g. `nameh-amal:pomodoro:*`).
- Durations stored in seconds internally; UI may display minutes.

## Dependencies

(none)
