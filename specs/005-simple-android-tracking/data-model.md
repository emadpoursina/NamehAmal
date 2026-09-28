# Data Model: Simplified Android Tracking

The Android Room database remains the offline source for phone-created events. The desktop keeps its existing SQLite/Prisma session records as the durable destination after upload. Existing Room workday/check-in/revision tables are retained where needed for upgrade compatibility, but the simplified UI does not expose their retired workflows.

## Entities

### Event / Time Interval (Android Room: `time_intervals`)

| Field | Type | Rules |
|---|---|---|
| `entryId` | UUID/string | Stable primary key; reused for retries and server idempotence. |
| `title` | string | Required for newly created work events; trim on save and reject blank/whitespace-only input. Legacy labels are backfilled from the prior activity snapshot, or `Break` / `Unassigned` if unavailable. |
| `workdayId` | UUID/string or null | Null for all newly created events. Retained for pre-migration rows and their existing relation. |
| `entryType` | `WORK` or `BREAK` | New events use `WORK`. Existing break rows are retained and labeled `Break`; no new break action is offered. |
| `activityId` | desktop Activity ID or null | Null for free-text Android titles. Retained for old synced intervals; title suggestions do not require an Activity table. |
| `startedAt` | UTC instant / epoch millis | Required; entered/displayed in the device-local zone. A manual session may be in the past. A running-session start may not be later than the current instant. |
| `endedAt` | UTC instant / epoch millis or null | Null only while running. Completed sessions require `endedAt > startedAt`. |
| `timeZoneId` | IANA zone ID | Captured from the device when the event begins. |
| `timeZoneOffsetMinutes` | integer | Offset at `startedAt`; retained for audit and sync. |
| `sourceDeviceId` | stable device ID | Existing installation ID; remains immutable for the event. |
| `currentRevisionId` | revision ID or null | Existing sync lineage pointer; used for idempotent upload and preserved through migration. |
| `syncedAt` | UTC instant or null | Local-only acknowledgement marker. Set only after the host accepts the event and the Room acknowledgement transaction commits. Null means pending/not acknowledged. Never sent to the desktop as an event field. |
| `updatedAt` | UTC instant | Local audit/sync metadata. Not a cross-device ordering cursor. |
| `deletedAt` | UTC instant or null | Existing protocol field for legacy/remote tombstones only. Android user removal MUST physically delete the local event and MUST NOT set or transmit this field. |

The existing schema's nullable `workdayId` permits direct events without creating a Workday. Enforce one active event in a serialized repository transaction; a new Start cannot replace an existing open interval. The active row survives process death; elapsed time is derived from `startedAt`.

### Previous Activity Title (derived view)

There is no new title-catalog table. Offer distinct, nonblank titles derived from local event rows, ordered by their most recent `startedAt`. Selecting **Start again** creates a new event ID with the selected title and leaves the previous event unchanged.

### Sync Revision / Acknowledgement (existing Room sync tables)

| Field | Type | Rules |
|---|---|---|
| `revisionId` | UUID/string | Stable idempotency key for the submitted event snapshot. A retry resends the same unacknowledged revision. |
| `entryId` | UUID/string | Links the revision to the local event. |
| `title` | string | Persist on the local revision row and serialize inside its `entry` snapshot so retries preserve free text even if the event is edited before acknowledgement. |
| `startedAt`, `endedAt`, `timeZoneId`, `timeZoneOffsetMinutes` | interval values | Only completed events are submitted; values preserve the original device-local context. |
| `acknowledged` | boolean | True only after host acceptance. `time_intervals.syncedAt` mirrors the successful acknowledgement for event-list display and cleanup. |

User deletion removes the event and its phone-side revision metadata in a Room transaction. No deletion revision is created. Clearing synced events removes only rows with `syncedAt != null`; pending events and the sync endpoint remain untouched.

### Saved Server Connection (Android DataStore)

Keep the existing saved host and port keys. Host input accepts a valid IP literal or hostname; port is a whole number from 1 through 65535. Saving settings does not require connectivity. At connection time, reject a hostname that resolves outside a private/loopback/link-local destination; sync remains plain HTTP on a trusted private network only. An invalid edit does not replace the last valid endpoint. A connection failure does not mutate local events.

### Desktop Session (existing Prisma `Session`)

The existing desktop `Session` already has an optional `title`, `startedAt`, `endedAt`, `durationSeconds`, timezone fields, `syncId`, and a required Category relation. For a title-only Android upload, store the submitted title in `Session.title`, use the stable event ID as `syncId`, retain source/time metadata, and use the existing Unassigned-category fallback when no desktop Activity is associated. Desktop screens and ordinary session creation remain unchanged. A repeated accepted revision/event ID is idempotent and does not create a second Session.

## State transitions

1. `NONE -> COMPLETED`: validate nonblank title and `end > start`; allow dates in the past; persist the interval before showing success.
2. `NONE -> RUNNING`: validate nonblank title and `start <= now`; reject if another interval has `endedAt == null`.
3. `RUNNING -> COMPLETED`: Stop sets `endedAt` to the current instant in one local transaction.
4. `PENDING -> SYNCED`: only completed intervals are uploaded. On host acknowledgement, atomically acknowledge the revision and set `syncedAt`; on timeout/failure leave the event pending and retryable with its stable ID.
5. `PENDING|SYNCED -> REMOVED_LOCAL`: after confirmation, remove only the selected Room event and local revision metadata. A running event is removed only after confirmation. No remote delete is emitted.
6. `SYNCED -> CLEARED_LOCAL`: after bulk confirmation, remove only acknowledged events from Android. The desktop Session remains unchanged.

## Ordering and validation

- Main feed: all local, non-tombstoned events across dates, ordered by `startedAt DESC`, then stable `entryId DESC` to make equal start times deterministic.
- Title is trimmed and nonempty; start/end values must be parseable local date/time values converted to instants.
- A completed interval must have `endedAt > startedAt`; a running start must not be in the future.
- An active event blocks a second Start; it is never silently stopped or replaced.
- New events capture device-local `timeZoneId` and offset. Times render using the device's current local time zone, consistent with existing tracking behavior.

## Migration

Increment Room from schema version 3 to 4 with an additive migration. Preserve existing workday, interval, sync revision, cursor, and conflict rows. Add the free-text title and local sync marker fields to `time_intervals`, and a title field to `entry_revisions`; backfill titles from `activity_snapshots` (and the associated interval for queued revisions), mapping old break rows to `Break` and unresolved work titles to `Unassigned`. Preserve timestamps, timezone values, stable IDs, open intervals, and revision acknowledgements. Cancel scheduled check-in work after upgrade; do not destructively clear legacy tables or saved server settings.
