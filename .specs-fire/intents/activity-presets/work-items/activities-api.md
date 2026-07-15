---
id: activities-api
title: Activities CRUD API
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on:
  - activity-data-model
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T16:56:49.747Z
---

# Work Item: Activities CRUD API

## Description

Create REST routes for managing activities, mirroring the existing `app/api/categories/` pattern. Supports list (with archived filter), create (unique title), update, archive/unarchive, and reorder/pin. Enforces unique titles and category validity, and disables activities whose category has been archived.

## Acceptance Criteria

- [ ] `GET /api/activities` returns activities; supports an `?includeArchived=true` query and excludes archived by default; results ordered by `isPinned` desc, then `sortOrder`, then `title`.
- [ ] `POST /api/activities` creates an activity; requires `title` + `categoryId`; rejects duplicate titles with a clear 400 error; validates the category exists.
- [ ] `PATCH /api/activities/:id` updates `title`, `categoryId`, `defaultDurationSeconds`, `color`, `sortOrder`, `isPinned`, `isArchived`; rejects duplicate titles (excluding self); validates category on change.
- [ ] Archive/unarchive is performed via `PATCH` on `isArchived`.
- [ ] An activity whose `category.isArchived === true` is excluded from the default (non-archived) list response, i.e. it is "disabled" in the picker until its category is reassigned.
- [ ] All responses follow the existing `{ ok, data?, error? }` envelope used by `app/api/tracker/route.ts` and `app/api/categories/route.ts`.
- [ ] Invalid JSON / missing fields return `400` with a descriptive error.

## Technical Notes

- Reuse the `jsonError` / `readJson` helper style from `app/api/tracker/route.ts`.
- Use the regenerated Prisma client from `app/generated/prisma`.
- Consider a small shared validation helper for title uniqueness to avoid duplication between create and update.

## Dependencies

- activity-data-model
