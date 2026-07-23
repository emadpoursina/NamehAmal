---
id: pomodoro-page
title: Pomodoro Page
intent: pomodoro-timer
complexity: medium
mode: confirm
status: completed
depends_on:
  - pomodoro-core-engine
created: 2026-07-23T09:48:54Z
run_id: run-nameh-amal-003
completed_at: 2026-07-23T12:48:20.757Z
---

# Work Item: Pomodoro Page

## Description

Add a dedicated `/pomodoro` page with the full timer UI (phase, countdown, Start/Stop/Skip) and Pomodoro settings form (focus, short rest, long rest, long-rest interval). Settings live only on this page — not under `/settings`. Add a nav link in the app shell.

## Acceptance Criteria

- [ ] Route `/pomodoro` renders timer display + controls wired to the core engine.
- [ ] Settings form edits focus / short rest / long rest / N and persists via the engine; defaults match the brief.
- [ ] Settings are not added to `/settings`.
- [ ] App shell nav includes a link to Pomodoro (alongside existing Home / Settings / Stats).
- [ ] Page works while idle and while a phase is running; stays in sync if the floating widget (later) also controls the same engine.
- [ ] No session-tracker integration.

## Technical Notes

- Follow existing page/layout patterns (`app/layout.tsx` nav, App Router page under `app/pomodoro/`).
- Reuse existing visual language where practical; keep composition simple (not a stats dashboard).

## Dependencies

- pomodoro-core-engine
