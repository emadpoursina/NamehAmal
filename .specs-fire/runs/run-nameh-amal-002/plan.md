---
run: run-nameh-amal-002
work_item: sessions-table-inline-create
intent: activity-presets
mode: autopilot
---

# Implementation Plan: Sessions Table Inline Activity Create

## Approach

Add a "New activity" button above the Sessions table (including empty state) that opens `ActivityFormDialog`. On successful create, close dialog and `router.refresh()` so tracker/add-session comboboxes pick up the new activity via cache invalidation (already in dialog).

## Files to Modify

| File | Changes |
|------|---------|
| `app/dashboard/SessionsTable.tsx` | Header with button + ActivityFormDialog |

## Tests

Verify via `bun run build` + lint.
