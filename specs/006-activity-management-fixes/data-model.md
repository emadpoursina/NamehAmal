# Data Model: Activity Management Fixes

The Android Room database remains the offline source for locally entered sessions. The desktop remains authoritative for reusable Activity presets, Category rows, and accepted Sessions. Category and Activity metadata are refreshed together from the existing explicit sync status route; upload-only exchange continues to return acknowledgements rather than desktop event records.

## Terminology

In Android's tracking list, a **session/event/entry** is one recorded time entry; its title can be custom text. The desktop Prisma `Activity` is a separate reusable preset that can be selected from its synced snapshot.

## Entities

### Android Session / Time Interval (`time_intervals`)

| Field | Type | Rules |
|---|---|---|
| `entryId` | UUID/string | Stable local record ID; preserved for retries and desktop idempotence. |
| `title` | string | Required and nonblank for newly created sessions; unchanged prior title behavior. |
| `categoryId` | category ID or null | New Android sessions MUST contain the selected desktop Category ID. Nullable only for historical rows preserved during migration. No foreign key is used, so archiving/removing a category cannot cascade into local history. |
| `startedAt` | instant / epoch milliseconds | Required; selected and displayed in the device-local timezone, converted by existing session rules. Past manual starts remain valid; a running start cannot be in the future. |
| `endedAt` | instant / epoch milliseconds or null | Null while running; completed sessions require `endedAt > startedAt`. |
| `timeZoneId`, `timeZoneOffsetMinutes` | IANA zone ID and integer offset | Capture the device zone and offset at start, following the existing timezone-aware session model. |
| `workdayId`, `entryType`, `activityId`, `confirmationState`, `sourceDeviceId`, `updatedAt`, `currentRevisionId`, `deletedAt`, `syncedAt` | Existing fields | Retain existing meanings and migration behavior. `activityId` identifies a selected active desktop preset; custom titles keep it null. Android removal physically deletes the local event and does not set `deletedAt`. |

### Category Snapshot (`category_snapshots`, new Room entity)

| Field | Type | Rules |
|---|---|---|
| `categoryId` | desktop category ID | Stable primary key supplied by the desktop status route. |
| `name` | string | Display label copied from the desktop-owned Category. |
| `sortOrder` | integer | Desktop order for deterministic picker presentation. |
| `isArchived` | boolean | Archived categories are retained as metadata if returned but are not selectable for new sessions. |
| `receivedAt` | instant / epoch milliseconds | Local cache freshness marker, not a desktop event timestamp. |

The cache contains only category metadata. It is not an Android category-management surface and does not replace or mutate desktop categories. The picker offers categories from the latest successful status response with `isArchived == false`. A network failure preserves the prior cache; an unsupported host must not clear it or alter local sessions.

### Desktop Activity Snapshot (`activity_snapshots`, existing Room entity)

| Field | Type | Rules |
|---|---|---|
| `activityId` | desktop Activity ID | Stable primary key supplied by the desktop status route. |
| `title`, `categoryId` | string and desktop category ID | Prefill the session title and associated category when selected. |
| `color`, `sortOrder` | optional color and integer order | Copied from the desktop preset for picker presentation/order. |
| `isArchived` | boolean | Archived presets remain cached but are not selectable. |
| `snapshotVersion`, `receivedAt` | string and epoch milliseconds | Local cache metadata; not a desktop event timestamp. |

The snapshot is read-only on Android and refreshed atomically with category snapshots only during explicit Sync. Only non-archived Activities with an active cached category are offered. Typing a custom title does not create or mutate a desktop Activity; saved custom titles remain available from recent session titles.

### Session Upload Revision (`entry_revisions`, existing Room entity)

| Field | Type | Rules |
|---|---|---|
| `revisionId`, `entryId`, `baseRevisionId`, `changedByDeviceId`, `sourceDeviceId`, `updatedAt` | Existing lineage fields | Keep stable/idempotent retry and acknowledgement semantics. |
| `title`, `startedAt`, `endedAt`, `timeZoneId`, `timeZoneOffsetMinutes`, `confirmationState` | Existing event snapshot fields | Upload only completed events with existing timezone metadata. |
| `categoryId` | category ID or null | This nullable field already exists in Room schema v4. Copy the selected category ID into each revision for a new Android session; preserve null for legacy revisions. A retry reuses the same revision/category snapshot. |
| `acknowledged`, `createdAt`, `deletedAt` | Existing sync fields | Acknowledge only accepted revision IDs. Android removal does not create a deletion revision or tombstone. |

### Session Selection (transient UI state)

The set of selected record IDs is screen/view-model state, not persisted data. Toggling selection changes no record. Select all targets all rows in the displayed Android session list; clear selection affects only this transient set. Remove selected uses a snapshot of the selected IDs after confirmation. Clear all is a separate action that always targets every Android-local list row, irrespective of the selection set. Choosing a reusable Activity writes its ID to the new session; choosing a recent custom title leaves the Activity ID null.

### Desktop Category and Session (existing Prisma models)

The desktop Category and Activity remain the source for category IDs/names and reusable preset IDs/titles. A newly synced Android session is associated with its submitted category and, when selected, Activity ID. No desktop Activity is created from a free-text Android title. Desktop UI behavior and category management remain unchanged. Older/null-category revisions keep their established compatibility behavior.

## State transitions

1. **Metadata refresh**: User starts Sync → status returns required capabilities and category/activity metadata → Android validates both and atomically refreshes both Room caches. A missing capability or failed request does not upload records or erase existing metadata.
2. **Choose saved Activity**: Select an active preset → prefill title/category and retain its Activity ID in UI state. Editing the title or changing its category turns the entry into a custom title with no Activity ID.
3. **New completed session**: Draft custom or preset title, start, end, and active category → validate and persist title, category ID, optional Activity ID, and `endedAt`.
4. **New running session**: Draft custom or preset title, start, and active category → validate and persist title, category ID, optional Activity ID, and `endedAt == null`. Preserve the one-running-session rule.
5. **Restart**: Select a prior record → prefill its title/category and its Activity ID only if the matching preset is still active; if its category is unavailable, require another active choice → create a separate new event. Never rewrite the source record.
6. **Stop and sync**: Running → completed on Stop. Only completed records are revisioned and uploaded. The desktop ID/category relation is persisted from the revision; local synced status changes only after acknowledgement.
7. **Remove selected / Clear all**: Confirmation accepted → transactionally delete the targeted Android event rows and their local revision metadata. Running rows in that target set are removed only after confirmation. No host call or tombstone is generated; saved endpoint and metadata snapshots remain.
8. **Room upgrade**: v4 → v5 adds the category cache and nullable event category field. The Activity snapshot table and nullable Activity IDs already exist. Preserve all old rows, event/revision IDs, timestamps, running state, sync acknowledgement, endpoint settings, and existing tables. Do not fabricate category values for legacy events.

## Validation and invariants

- For every newly created or restarted session, `categoryId` is non-null and identifies an active category in the latest local category cache at save/start time. A non-null `activityId` identifies a currently available cached preset with that category.
- A missing cache, missing selection, or archived category blocks a new create/start; an existing running/completed record keeps its stored category ID if the cache changes later.
- Picker cancellation leaves the selected local date/time unchanged. Persist local values as instants plus their existing timezone metadata; do not treat local text as UTC.
- Selection and Clear all never modify category definitions, endpoint settings, desktop copies, or remote sync state.
- Bulk selected removal targets only selected current row IDs. Clear all targets the full current Android-local activity list, not the current selection.
