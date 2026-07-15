---
run: run-nameh-amal-001
work_item: activity-presets (batch)
intent: activity-presets
generated: 2026-07-15T17:20:00Z
mode: confirm
---

# Implementation Walkthrough: Activity Presets (Confirm Batch)

## Summary

Implemented the Activity Presets foundation across six work items: Prisma `Activity` model, REST CRUD API, Settings management UI, reusable autocomplete combobox, and pre-fill integration on the Tracker card and Add-session form. Activity selection pre-fills fields only — users still click Start or Save.

## Structure Overview

```
Activity (Prisma)
  └─ /api/activities (GET/POST, PATCH)
       ├─ Settings: ActivityManager + ActivityFormDialog
       ├─ ActivityCombobox + useActivities (shared client cache)
       ├─ TrackerCard (idle pre-fill)
       └─ AddSessionForm (manual session pre-fill + default duration → end time)
```

## Files Changed

### Created

| File | Purpose |
|------|---------|
| `prisma/migrations/20260715165401_add_activity_model/migration.sql` | SQLite migration for Activity table |
| `app/api/activities/route.ts` | List/create activities |
| `app/api/activities/[id]/route.ts` | Update activities |
| `app/settings/ActivityFormDialog.tsx` | Reusable create/edit dialog |
| `app/settings/ActivityManager.tsx` | Settings activity list |
| `app/lib/use-activities.ts` | Cached client activities hook |
| `app/components/ActivityCombobox.tsx` | Prefix-filter autocomplete |

### Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Added Activity model + Category relation |
| `app/settings/page.tsx` | Fetch/render activities section |
| `app/dashboard/TrackerCard.tsx` | Activity combobox when idle |
| `app/dashboard/AddSessionForm.tsx` | Activity combobox + duration end-time |

## Domain Model

### Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| Activity | title (unique), categoryId, defaultDurationSeconds?, color?, sortOrder, isPinned, isArchived | Category restrict on delete; archived activities / archived categories hidden from default picker list |

## Key Implementation Details

### 1. Data layer

Added `Activity` linked to `Category` with indexes on `(isArchived, sortOrder)` and `categoryId`. Session schema unchanged — category remains a per-session snapshot.

### 2. API

Mirrors categories route patterns. Default GET excludes archived activities and those whose category is archived. Duplicate titles return 400 per acceptance criteria.

### 3. Settings UI

`ActivityManager` follows `CategoryManager` patterns. Rows with archived categories are visually disabled; dialog restricts category dropdown to active categories.

### 4. Combobox

Client-side prefix filter (case-insensitive), pinned-first then alphabetical. Module-level cache via `useSyncExternalStore` avoids refetching across surfaces.

### 5. Pre-fill surfaces

Tracker (idle only) and Add-session form integrate combobox + inline create dialog. Add-session computes `endTime` from `startTime + defaultDurationSeconds`, wrapping on the 24h clock; existing next-day submit logic unchanged.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Activity list caching | Module store + `useSyncExternalStore` | Share data across combobox instances; satisfy React lint rules |
| Duplicate title HTTP status | 400 (not 409) | Match activities work item AC |
| includeArchived query | Accept `true` or `1` | Align with categories API while honoring AC |
| Pre-fill vs auto-action | Pre-fill only | Explicit v1 scope in intent brief |

## Deviations from Plan

None significant. Added `onSuccess` to `ActivityFormDialog` during tracker integration to select newly created activities without extra fetches.

## Dependencies Added

| Package | Why Needed |
|---------|------------|
| `yaml` | FIRE builder scripts (state.yaml parsing) |

## How to Verify

1. **Build**
   ```bash
   bun run build
   ```
   Expected: TypeScript and Next.js build succeed.

2. **Settings → Activities**
   - Open `/settings`, create/edit/archive/pin/reorder activities.
   - Expected: CRUD works; archived section shows archived items.

3. **Tracker pre-fill**
   - On dashboard (idle), search activity in combobox → title/category pre-fill.
   - Click Start → timer starts; combobox hidden while running.

4. **Add session pre-fill**
   - Open Add session, pick activity with default duration.
   - Expected: title, category, and end time update; Save still required.

5. **API smoke**
   ```bash
   curl -s http://localhost:3060/api/activities
   ```

## Test Coverage

- Tests added: 0 (no test framework configured)
- Coverage: N/A
- Status: Verified via build, lint, and manual API/UI checks

## Ready for Review

- [x] All acceptance criteria met (confirm batch items)
- [x] Tests passing (build/lint/manual)
- [x] No critical issues
- [ ] Documentation updated (README not updated)
- [x] Developer notes captured

## Developer Notes

- Restart dev server after Prisma migrate/generate if `/api/activities` returns 500 (stale client).
- Run B (autopilot): `sessions-table-inline-create` remains — invoke `/specsmd-fire-builder` after this run to plan Run B.

---
*Generated by specs.md - fabriqa.ai FIRE Flow Run run-nameh-amal-001*
