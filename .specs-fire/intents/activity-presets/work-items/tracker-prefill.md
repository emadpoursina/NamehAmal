---
id: tracker-prefill
title: Tracker Card Activity Pre-fill
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on:
  - activity-management-ui
  - activity-combobox
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T17:13:42.499Z
---

# Work Item: Tracker Card Activity Pre-fill

## Description

Integrate the activity combobox into `TrackerCard` so picking an activity pre-fills the title and category fields. Presets appear only when the tracker is idle (no timer running). Add an inline "new activity" button that opens the reusable `ActivityFormDialog`; after creating, the new activity is selected. Picking an activity never starts a timer — the user still clicks Start.

## Acceptance Criteria

- [ ] `TrackerCard` shows the activity combobox (above or alongside the existing Category/Title inputs) when idle; hidden while a timer is running.
- [ ] Selecting an activity sets `categoryId` to the activity's category and `title` to the activity's title.
- [ ] Category remains changeable after pre-fill (default, not fixed).
- [ ] No automatic timer start on selection; the existing Start button and validation in `TrackerCard` (`onStart`) remain unchanged.
- [ ] Inline "new activity" button opens `ActivityFormDialog`; on successful create, the new activity is selected in the combobox and the activity list refreshes.
- [ ] Clearing the combobox resets the pre-filled title/category back to the default category / empty title.
- [ ] No regression to the existing active-timer display, stop flow, or `subscribeActiveTimerRefresh` behavior.

## Technical Notes

- `TrackerCard` currently receives `categories`; it will also need the activity list (pass from the dashboard server component, or fetch via the API used by the combobox — prefer one source of truth).
- Reuse the existing `startTimer` helper; only the form state initialization changes.

## Dependencies

- activity-management-ui
- activity-combobox
