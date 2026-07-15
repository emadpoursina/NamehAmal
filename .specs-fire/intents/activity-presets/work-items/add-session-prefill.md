---
id: add-session-prefill
title: Add Session Form Activity Pre-fill
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on:
  - activity-management-ui
  - activity-combobox
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T17:18:42.462Z
---

# Work Item: Add Session Form Activity Pre-fill

## Description

Integrate the activity combobox into `AddSessionForm` so picking an activity pre-fills title, category, and the end time (end = start + `defaultDurationSeconds` when set). Add an inline "new activity" button that opens the reusable `ActivityFormDialog`; after creating, the new activity is selected. Picking an activity never saves a session — the user still clicks Save.

## Acceptance Criteria

- [ ] `AddSessionForm` shows the activity combobox when the form is open.
- [ ] Selecting an activity sets `title`, `categoryId`, and (if `defaultDurationSeconds` is set) computes `endTime` = `startTime` + default duration (kept on the same day; if it crosses midnight, the existing next-day logic applies).
- [ ] Category and times remain editable after pre-fill (defaults, not fixed).
- [ ] No automatic session creation on selection; the existing `onSubmit` validation and `createManualSession` flow remain unchanged.
- [ ] Inline "new activity" button opens `ActivityFormDialog`; on successful create, the new activity is selected and the list refreshes.
- [ ] Clearing the combobox leaves the fields at their current values or resets to defaults consistently (no stale partial pre-fill).
- [ ] No regression to timezone handling, date handling, or the start/end next-day logic.

## Technical Notes

- Reuse `ymdAndHmToUtcIsoInTimeZone` for any time arithmetic; compute the displayed `endTime` string (`HH:MM`) from `startTime` plus `defaultDurationSeconds`, wrapping past 24h if needed (the existing end < start → next-day rule still applies).
- `AddSessionForm` currently receives `categories`; decide whether to pass activities from the server component or let the combobox fetch them.

## Dependencies

- activity-management-ui
- activity-combobox
