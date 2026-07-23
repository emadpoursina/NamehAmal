---
id: pomodoro-timer
title: Pomodoro Timer
status: in_progress
created: 2026-07-23T09:41:12Z
---

# Intent: Pomodoro Timer

## Goal

Add a **simple Pomodoro timer** that runs focus → short rest / long rest cycles. It lives on its **own page** plus a **small always-visible floating widget** (manually hideable). Configurable focus, short rest, long rest, and long-rest interval (default every 4 focus sessions). When each phase ends, show a **modal with a sound alert**. No stats. Fully **separate from the session tracker** (does not create or modify tracked sessions).

## Users

Single user (the app owner), local-first app. Same audience as the rest of nameh-amal.

## Problem

Need timed focus/break cycles inside the app without mixing Pomodoro into session tracking or relying on an external timer.

## Success Criteria

- Start a focus session → countdown → modal + sound → proceed to rest (or next focus as appropriate).
- After N focus sessions (default 4, configurable), use long rest instead of short rest.
- Durations and long-rest interval are editable on the Pomodoro page and apply to the next phase.
- Floating widget stays in sync across pages; Start / Stop / Skip; can be hidden and shown manually.
- Fully separate from session tracker — no sessions created or updated in the DB for Pomodoro use.

## Constraints

- Follow existing stack and patterns: Next.js App Router, TypeScript, Prisma/SQLite only if needed for persistence; prefer local client persistence for timer settings if no server need.
- Pomodoro settings live on the **Pomodoro page only** — not mixed into `/settings`.
- Defaults: focus 25m, short rest 5m, long rest 15m, long rest every 4 focus sessions — all configurable.
- Controls: **Start / Stop / Skip** — no pause button.
- Floating widget always visible when not manually hidden (including idle).
- No Pomodoro stats, history, or reports in this intent.
- No coupling to session tracker APIs, active-timer bus, or `Session` records.
- No external integrations.

## Notes

### UI (v1)

- Dedicated route (e.g. `/pomodoro`) for full timer UI + settings.
- Global floating widget: remaining time, phase indicator, Start/Stop/Skip; manual hide/show.
- End-of-phase modal + sound alert.

### Scope (v1 — in)

- Pomodoro page with timer and settings.
- Floating widget with hide/show.
- Focus / short rest / long rest cycle with configurable N.
- Modal + sound on phase end.

### Scope (v1 — out)

- Stats, history, charts.
- Integration with session tracker.
- Pause control.
- Settings under `/settings`.
