---
id: activity-management-ui
title: Activity Management UI (Settings)
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on:
  - activities-api
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T17:02:39.825Z
---

# Work Item: Activity Management UI (Settings)

## Description

Add a Settings page for managing activities: list, create, edit, archive/unarchive, reorder, and pin. Build a reusable `ActivityFormDialog` component (create/edit) that is also used by the inline-create buttons in later work items. Handle the "activity's category is archived" case by forcing the user to reassign a non-archived category before the activity can be re-enabled.

## Acceptance Criteria

- [ ] Activities listed under Settings, ordered by pinned desc, then sortOrder, then title.
- [ ] Create activity via `ActivityFormDialog` (fields: title, category select, default duration, color, pinned).
- [ ] Edit activity via the same dialog, prefilled with current values.
- [ ] Archive and unarchive actions available per row; archived activities still listed (e.g. under a toggle/section) so they can be unarchived.
- [ ] Reorder (sort order) and pin/unpin controls functional.
- [ ] Unique-title and required-field errors surfaced from the API are shown inline.
- [ ] When an activity's category is archived, the row is visibly "disabled" and the user is prompted to reassign a non-archived category (the dialog restricts the category dropdown to non-archived categories in this case).
- [ ] `ActivityFormDialog` is exported as a reusable component so other surfaces can trigger create.
- [ ] Follows existing Settings visual conventions (zinc palette, rounded-lg, dark mode) used elsewhere in the app.

## Technical Notes

- Model the page/dialog after the existing categories Settings page/UX.
- Category dropdown should exclude archived categories when creating/reassigning.
- The dialog should call the `/api/activities` routes from the client.

## Dependencies

- activities-api
