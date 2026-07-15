---
id: activity-data-model
title: Activity Data Model
intent: activity-presets
complexity: medium
mode: confirm
status: completed
depends_on: []
created: 2026-07-15T07:48:00Z
run_id: run-nameh-amal-001
completed_at: 2026-07-15T16:54:27.828Z
---

# Work Item: Activity Data Model

## Description

Add the `Activity` entity to the Prisma schema and create the database migration. This is the foundation for all other work items. An activity is a reusable preset binding a unique title to a category, with optional default duration, color, sort order, pinned flag, and archived flag.

## Acceptance Criteria

- [ ] `Activity` model exists in `prisma/schema.prisma` with fields: `id`, `title` (unique), `categoryId`, `defaultDurationSeconds` (nullable int), `color` (nullable string), `sortOrder` (int, default 0), `isPinned` (bool, default false), `isArchived` (bool, default false), `createdAt`, `updatedAt`.
- [ ] `Category` model has an `activities Activity[]` relation.
- [ ] `Activity` has a relation to `Category` with `onDelete: Restrict, onUpdate: Cascade`.
- [ ] Indexes added: `@@index([isArchived, sortOrder])` and `@@index([categoryId])`.
- [ ] `title` enforced as `@unique`.
- [ ] Migration created and applied to the SQLite dev database.
- [ ] Prisma client regenerated (`app/generated/prisma`) and types available.
- [ ] No changes to `Session` schema (category remains an independent snapshot).

## Technical Notes

- Datasource is SQLite (`prisma/schema.prisma`). Use the project's Prisma workflow (config at `prisma.config.ts`) to create the migration and regenerate the client into `app/generated/prisma`.
- Do NOT add a `Session.activityId` link in this iteration — out of v1 scope.
- Follow existing model conventions visible in `Category`/`Session` (cuid ids, `createdAt @default(now())`, `updatedAt @updatedAt`).

## Dependencies

(none)
