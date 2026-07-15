---
run: run-nameh-amal-001
work_item: activity-data-model
intent: activity-presets
mode: confirm
checkpoint: plan
approved_at: pending
---

# Implementation Plan: Activity Data Model

## Approach

Add the `Activity` model to the existing Prisma schema following the same conventions as `Category` and `Session` (cuid ids, timestamps, archive/sort patterns). Wire the inverse relation on `Category`, add the required indexes and unique constraint on `title`, then create and apply a SQLite migration and regenerate the Prisma client into `app/generated/prisma`.

No changes to `Session` — category remains an independent snapshot per session.

## Files to Create

| File | Purpose |
|------|---------|
| `prisma/migrations/{timestamp}_add_activity_model/migration.sql` | SQLite migration adding `Activity` table |

## Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `Activity` model, add `activities Activity[]` to `Category` |

## Tests

| Test File | Coverage |
|-----------|----------|
| (none) | No test framework configured; verify via `bun --bun run prisma migrate dev` + `bun --bun run prisma generate` + TypeScript compile |

## Technical Details

- Relation: `Activity.category` → `Category` with `onDelete: Restrict, onUpdate: Cascade` (matches `Session`)
- Fields: `id`, `title` (@unique), `categoryId`, `defaultDurationSeconds` (Int?), `color` (String?), `sortOrder` (Int @default(0)), `isPinned` (Boolean @default(false)), `isArchived` (Boolean @default(false)), `createdAt`, `updatedAt`
- Indexes: `@@index([isArchived, sortOrder])`, `@@index([categoryId])`
- Run: `bun --bun run prisma migrate dev --name add_activity_model` then `bun --bun run prisma generate`

---
*Plan pending approval at checkpoint. Execution follows.*

---

## Work Item: activities-api

### Approach

Create `app/api/activities/route.ts` and `app/api/activities/[id]/route.ts` mirroring the categories API pattern: shared `jsonError`/`readJson` helpers, `{ ok, data?, error? }` envelope, Prisma CRUD via `app/server/db`.

**GET list:** Exclude archived activities by default; when `?includeArchived=true`, include them. Also exclude activities whose linked category is archived from the default list (picker-disabled behavior). Order by `isPinned desc`, `sortOrder asc`, `title asc`. Include `category` relation in responses.

**POST create:** Require `title` + `categoryId`; validate category exists and is not archived; reject duplicate titles (400).

**PATCH update:** Partial updates for all mutable fields including `isArchived`; validate category on change; reject duplicate titles excluding self.

### Files to Create

| File | Purpose |
|------|---------|
| `app/api/activities/route.ts` | GET list + POST create |
| `app/api/activities/[id]/route.ts` | PATCH update |

### Files to Modify

| File | Changes |
|------|---------|
| (none) | |

### Tests

| Test File | Coverage |
|-----------|----------|
| (none) | Verify via manual `curl` + `bun run build` (no test framework configured) |

### Technical Details

- Follow categories route structure for validation and Prisma error handling (P2002 → duplicate title 400 per AC, P2025 → 404)
- Optional: extract title-uniqueness check helper shared between POST and PATCH

---
*Plan approved and executed.*

---

## Work Item: activity-management-ui

### Approach

Add an `ActivityManager` section to Settings, modeled after `CategoryManager`. Create a reusable exported `ActivityFormDialog` for create/edit (used later by inline-create buttons).

**Server:** Fetch activities via `GET /api/activities?includeArchived=true` and categories via existing categories API in `settings/page.tsx`. Split into active/archived sections; mark rows disabled when `activity.category.isArchived`.

**Client components:**
- `ActivityFormDialog` — modal with title, category select (non-archived only), default duration, color, pinned; handles create (POST) and edit (PATCH); shows API errors inline.
- `ActivityManager` — list with pin/unpin, reorder (sortOrder up/down), archive/unarchive, edit dialog trigger; archived section with restore.

### Files to Create

| File | Purpose |
|------|---------|
| `app/settings/ActivityFormDialog.tsx` | Reusable create/edit dialog (exported) |
| `app/settings/ActivityManager.tsx` | Settings list UI for activities |

### Files to Modify

| File | Changes |
|------|---------|
| `app/settings/page.tsx` | Fetch activities, render `ActivityManager`, update page description |

### Tests

| Test File | Coverage |
|-----------|----------|
| (none) | Verify via `bun run build` + manual Settings page smoke test |

---
*Plan approved and executed.*

---

## Work Item: activity-combobox

### Approach

Build a reusable `ActivityCombobox` client component plus a small `useActivities` hook for cached fetching from `GET /api/activities`.

**Filtering:** Case-insensitive title prefix match on typed input; sort matches alphabetically by title (pinned first optional via API order, then alpha within filter).

**UX:** Dropdown list, keyboard navigation (↑/↓/Enter/Esc), empty states for no activities / no matches, `onSelect`, `onClear`, optional `onCreateNew` slot.

### Files to Create

| File | Purpose |
|------|---------|
| `app/lib/use-activities.ts` | Client hook fetching/caching activities |
| `app/components/ActivityCombobox.tsx` | Reusable autocomplete combobox |

### Files to Modify

| File | Changes |
|------|---------|
| (none) | Component only — integration in later work items |

### Tests

| Test File | Coverage |
|-----------|----------|
| (none) | Verify via `bun run build` + lint |

---
*Plan approved and executed.*

---

## Work Item: tracker-prefill

### Approach

Integrate `ActivityCombobox` into `TrackerCard` when idle (`!active`). On select: set `title` and `categoryId`. Track selected activity id for clear/reset. Add "New activity" opening `ActivityFormDialog`; on create refresh activities cache and select new activity.

On clear: reset title to empty and category to default.

### Files to Modify

| File | Changes |
|------|---------|
| `app/dashboard/TrackerCard.tsx` | Add combobox, dialog, pre-fill/clear handlers |

### Tests

| Test File | Coverage |
|-----------|----------|
| (none) | Verify via `bun run build` + lint |

---
*Plan approved and executed.*

---

## Work Item: add-session-prefill

### Approach

Integrate `ActivityCombobox` into `AddSessionForm` when open. On select: set title, categoryId, and compute endTime from startTime + defaultDurationSeconds (HH:MM on same day, wrapping past 24h). On clear: reset title, category to default, endTime to default pair with startTime.

Add `ActivityFormDialog` for inline create with onSuccess selection.

Helper: add `addMinutesToHm(hm: string, minutes: number): string` in timezone lib or inline in form.

### Files to Modify

| File | Changes |
|------|---------|
| `app/dashboard/AddSessionForm.tsx` | Combobox, dialog, pre-fill/clear + duration end time |

### Tests

| Test File | Coverage |
|-----------|----------|
| (none) | Verify via `bun run build` + lint |

---
*Plan pending approval at checkpoint. Execution follows.*
