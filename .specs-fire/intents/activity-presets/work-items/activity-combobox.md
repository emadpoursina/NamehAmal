---
id: activity-combobox
title: Activity Autocomplete Combobox
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on:
  - activities-api
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T17:05:28.988Z
---

# Work Item: Activity Autocomplete Combobox

## Description

Build a reusable client-side autocomplete combobox for picking an activity. Typing filters activities by title prefix; results sort alphabetically. Used by the Tracker card and the Add-session form. Includes an empty-state message and a callback for the selected activity.

## Acceptance Criteria

- [ ] Component renders a text input with a dropdown of matching activities.
- [ ] Filtering is by title prefix (case-insensitive); e.g. `w` → `work`, `working`; `worki` → `working`.
- [ ] Results are sorted alphabetically by title; pinned items may appear first (optional) but alphabetical order within the visible matches is preserved.
- [ ] Selecting an activity calls `onSelect(activity)` with the full activity object (id, title, categoryId, defaultDurationSeconds, color).
- [ ] Only non-archived activities with a non-archived category appear (per the API default list).
- [ ] Empty state: when there are no activities or no matches, show a simple message (e.g. "No activities yet" / "No matches").
- [ ] Keyboard-friendly: arrow keys to move, Enter to select, Esc to close (basic support).
- [ ] Reusable props: `value`, `onSelect`, `onClear`, placeholder, and an optional `onCreateNew` affordance slot for inline create.
- [ ] Fetches activities from `GET /api/activities` (no-store) and matches existing styling conventions.

## Technical Notes

- Keep the component self-contained and presentational; it should not know about tracker/session specifics.
- Consider caching the activity list in a small client hook to avoid refetching across surfaces.

## Dependencies

- activities-api
