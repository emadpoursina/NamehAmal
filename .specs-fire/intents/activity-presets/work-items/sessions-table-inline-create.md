---
id: sessions-table-inline-create
title: Sessions Table Inline Activity Create
intent: activity-presets
complexity: low
mode: autopilot
status: completed
depends_on:
  - activity-management-ui
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-002
completed_at: 2026-07-15T17:20:13.925Z
---

# Work Item: Sessions Table Inline Activity Create

## Description

Add an inline "new activity" button to the Sessions table area that opens the reusable `ActivityFormDialog` so the user can create an activity without leaving the dashboard. On success, the activity is available for use in the tracker and add-session form.

## Acceptance Criteria

- [ ] A "New activity" button is visible near the Sessions table.
- [ ] Clicking it opens `ActivityFormDialog` (reuse from activity-management-ui).
- [ ] On successful create, the dialog closes and the dashboard data refreshes (e.g. `router.refresh()`) so the new activity is usable in the tracker/form.
- [ ] Errors from the API are surfaced in the dialog.
- [ ] Button disabled state matches existing patterns (no special gating required beyond dialog open/close).
- [ ] No regression to existing Sessions table behavior (filters, edit dialog, etc.).

## Technical Notes

- This item only adds the create affordance; it does not add a picker to the table.
- Reuse the same `ActivityFormDialog` component to avoid duplication.

## Dependencies

- activity-management-ui
