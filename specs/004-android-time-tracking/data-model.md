# Data Model: Android Time Tracking Companion

This model adds phone-owned offline records and a shared sync identity/version layer. The desktop remains the owner of its SQLite database; Android has its own Room database. See [sync-api.md](contracts/sync-api.md) for exchange semantics.

## Entities

### Workday (Android-local)

| Field | Type | Rules |
|---|---|---|
| `workdayId` | UUID/string | Primary key; created when the user explicitly starts a workday. |
| `startedAt` | UTC instant | Required; captured from the device clock at the start action. |
| `endedAt` | UTC instant or null | Null only while active; set once when the user ends the day. |
| `timeZoneId` | IANA zone ID | Captured from the device at start for audit/display context. |
| `state` | `ACTIVE \| ENDED` | Must agree with `endedAt`. |

At most one active workday exists. The start/end transition and active-interval update are committed in a Room transaction. Workday grouping is phone-local; the bounded interval records, not scheduler state, are synchronized.

### Activity Snapshot (Android cache; desktop authoritative)

| Field | Type | Rules |
|---|---|---|
| `activityId` | Desktop Activity ID | Stable desktop identity; primary key in the phone cache. |
| `title` | string | Snapshot of the desktop `Activity.title`. |
| `categoryId` | Desktop Category ID | Preserved for mapping a phone entry into desktop `Session.categoryId`. |
| `color`, `sortOrder`, `isArchived` | optional scalar fields | Snapshot fields used for display/selection; only active activities are offered for new intervals. |
| `snapshotVersion` | string | Server activity sequence or content version. |
| `receivedAt` | UTC instant | Last successful sync that refreshed this row. |

The desktop's Prisma `Activity` model is distinct from `Category`; a session currently references a required category and has no activity relation. Do not equate these records. Existing desktop sessions with no `activityId` map to Unassigned on Android, retaining their title and category data.

### Time Entry (shared logical interval)

| Field | Type | Rules |
|---|---|---|
| `entryId` | UUID/string | Stable logical identity; unique across the exchanged data set and immutable after creation. |
| `sourceDeviceId` | stable device ID | Immutable originating phone/desktop identity. |
| `workdayId` | UUID/string or null | Android workday association; optional for desktop-created sessions. |
| `entryType` | `WORK \| BREAK` | Break is a non-working interval and excluded from work totals. |
| `activityId` | desktop Activity ID or null | Null means Unassigned; breaks have no activity. |
| `categoryId` | desktop Category ID or null on phone | On desktop, required by the existing Session schema. Imported Unassigned/break entries use a reserved Unassigned Category; existing non-phone categories remain unchanged. |
| `startedAt`, `endedAt` | UTC instants | A synchronized interval is bounded and `endedAt > startedAt`. Open current phone intervals are closed at transitions/workday end before export. |
| `timeZoneId` | IANA zone ID | Zone captured when the interval begins. |
| `timeZoneOffsetMinutes` | integer or null | Offset at `startedAt`, for DST/audit context. |
| `confirmationState` | `CONFIRMED \| UNCONFIRMED` | The interval associated with a missed check-in remains present and Unconfirmed until the user reviews/confirms it. |
| `currentRevisionId` | revision ID | Points to the current source version; competing versions are retained separately. |
| `createdAt`, `updatedAt` | UTC instants | Metadata; `updatedAt` is not used as the replication cursor. |
| `deletedAt` | UTC instant or null | Tombstone for a user deletion after sync; original version remains available for conflict/undo history. |

On the desktop, map a logical Time Entry to the existing Prisma `Session` row. Extend `Session` additively with `syncId`/entry ID, `sourceDeviceId`, current revision pointer, optional `activityId`, `entryType`, and confirmation state. Keep `Session.kind` (`MANUAL`/`TIMER`) as its existing creation-kind field. Backfill old desktop rows deterministically to the existing desktop installation ID and a stable legacy entry ID; default them to `WORK` and `CONFIRMED`. Maintain the required category foreign key. Add Prisma field-level `///` comments for every new persisted schema field, per the constitution.

### Entry Revision (immutable)

| Field | Type | Rules |
|---|---|---|
| `revisionId` | UUID/string | Globally unique idempotency key for one complete entry snapshot. |
| `entryId` | UUID/string | Logical entry this version describes. |
| `baseRevisionId` | revision ID or null | Version observed when this edit began; null for the initial revision. |
| `changedByDeviceId` | stable device ID | Device that authored this revision; distinct from immutable source device where applicable. |
| `updatedAt` | UTC instant | Audit data only; never determines winner or cursor order. |
| `payload` | normalized Time Entry snapshot | Contains the complete interval values and deletion tombstone state. |

Every edit, split, or deletion creates a new revision; no revision overwrites another. If two incoming/current revisions descend from the same base and neither is an ancestor of the other, preserve both and create a concurrent-edit conflict. Repeating a revision ID is a no-op.

### Check-in Marker (Android-local)

| Field | Type | Rules |
|---|---|---|
| `checkInId` | UUID/string | Stable local identifier. |
| `workdayId` | UUID/string | Must refer to the active workday when scheduled. |
| `entryId` | UUID/string | Current interval the check-in concerns; a marker does not create a new interval boundary. |
| `dueAt`, `deliveredAt` | UTC instants | Scheduler target and actual dispatch; `deliveredAt` may be late. |
| `state` | `PENDING \| CONFIRMED \| MISSED` | Same activity confirms the referenced interval; a missed check-in marks that interval Unconfirmed. Notification dispatch does not split or otherwise alter the interval. |

The best-effort worker checks persisted workday state before posting. A check-in is a reminder/marker, not a time boundary: dispatching or missing it MUST NOT close the active interval, split it, or create a continuation. If a check-in is missed, its referenced interval remains present and is marked Unconfirmed until reviewed. Same activity explicitly confirms the current interval; change/break/end performs the normal user-initiated interval transition. If notifications are disabled or delayed, the app still exposes in-app review state. Workday end cancels unique periodic work.

### Sync Device and Cursor

| Field | Type | Rules |
|---|---|---|
| `deviceId` | stable UUID/string | Generated once per app installation/profile and retained across restarts. |
| `deviceType` | `ANDROID \| DESKTOP` | Immutable. |
| `lastSeenAt` | UTC instant | Updated only after a successful exchange. |
| `serverSequence` | integer | Monotonic desktop change sequence; Android persists the highest fully applied value. |
| `clientAckSequence` | integer | Host acknowledgement state for the phone's uploaded revisions. |

The host change log/cursor is ordered by a database sequence, not client timestamps. A null cursor performs the initial full-history download; later syncs apply incremental host changes while continuing to exchange all pending phone revisions and the complete activity snapshot. Android persists received versions, activity snapshot, conflict changes, and its new cursor in one Room transaction. Failed/partial transport never clears the phone's pending revisions or advances its cursor. Device IDs identify record provenance and sync state only; they are not authentication credentials.

### Sync Conflict

| Field | Type | Rules |
|---|---|---|
| `conflictId` | UUID/string | Stable conflict identity. |
| `conflictType` | `CONCURRENT_EDIT \| OVERLAP` | Competing revisions to one entry or intersecting distinct entries. |
| `entryIds` | one or more entry IDs | Original source records are never removed. |
| `revisionIds` | one or more revision IDs | The exact competing versions remain inspectable. |
| `overlapStartAt`, `overlapEndAt` | UTC instants or null | Required for interval overlap; defines the intersecting range. |
| `state` | `UNRESOLVED \| RESOLVED \| UNDONE` | Unresolved conflicts remain visible after sync and restart. |
| `resolutionId` | UUID/string or null | Links the user's selected/split/edited result. |
| `createdAt`, `updatedAt` | UTC instants | Audit only. |

Same-activity overlaps retain both source entries but their shared duration is included only once in totals (union duration). Different-activity overlaps remain visible and their shared portion is excluded from activity totals until resolved. A conflict involving an edit to a synced entry never silently selects a version.

### Conflict Resolution

| Field | Type | Rules |
|---|---|---|
| `resolutionId` | UUID/string | Stable ID; each resolution/undo action creates a new record. |
| `conflictId` | UUID/string | Conflict being resolved. |
| `action` | `KEEP_ENTRY \| SPLIT \| EDIT \| UNASSIGNED \| UNDO` | User-selected action; concurrent-edit resolution may choose either preserved revision. |
| `selectedRevisionId` | revision ID or null | Required for a keep-version choice; null for split/edit/Unassigned choices. |
| `resultEntryIds` | entry IDs | New/current entries produced by the choice. |
| `resolvedByDeviceId` | stable device ID | Device on which the user made the choice. |
| `resolvedAt` | UTC instant | Audit timestamp. |
| `undoesResolutionId` | resolution ID or null | Preserves history and makes undo reversible without deleting source versions. |

Resolution is applied as new revisions. Re-review after undo marks the conflict unresolved again; the original entries and decisions remain in history.

### Saved Desktop Endpoint (Android DataStore)

Contains the manually entered Mac private-network IP literal and port `1..65535`, plus last successful sync status. The scheme is HTTP. Reject malformed addresses, hostnames, public IP literals, and invalid ports. A failed connection changes only sync status, not entries, cursors, or conflicts. The user enters and saves the endpoint once. A **Forget endpoint** action removes the saved IP/port and prevents this Android app from using it until configured again.

There are no paired-device credentials, QR flow, HMAC signatures, or server-side per-device revocation records. Forgetting the endpoint is local configuration removal, not a host authorization revocation: any client that can reach the sync-only bridge on the trusted private LAN can call it. Plain HTTP also exposes request and response contents to LAN observers. These are accepted residual risks under Constitution v1.1.0; sync MUST NOT be used on public or otherwise untrusted networks. The Android app initiates exchanges only after the user taps Sync, but the unauthenticated host cannot cryptographically verify the initiating client.

## State transitions and validation

1. `NO_ACTIVE_WORKDAY -> ACTIVE`: explicit user start, choose Activity or Unassigned, persist Workday and first interval in one transaction; reject a second active workday.
2. `ACTIVE_ACTIVITY -> ACTIVE_ACTIVITY`: close the current interval and start the next at the same instant; validate category/activity snapshot and positive duration when closed.
3. `ACTIVE_ACTIVITY -> ACTIVE_BREAK -> ACTIVE_ACTIVITY`: break is a distinct non-working interval, never counted in work totals.
4. `ACTIVE -> ENDED`: close the current interval, mark the Workday ended, stop its reminders; no later worker may create a check-in for it.
5. A check-in reminder references the current interval but does not change its boundaries. If missed, its interval remains present and becomes `UNCONFIRMED`; an explicit user review/confirmation can mark it `CONFIRMED`. Missing notification permission or delivery never pauses, splits, or deletes tracking. Activity changes, breaks, and workday end are the only transitions that close/start intervals.
6. `LOCAL_REVISION -> UPLOADED -> ACKNOWLEDGED`: persist before upload; immutable revision ID makes retries idempotent. Only acknowledge after server transaction success and local response commit.
7. `UNRESOLVED_CONFLICT -> RESOLVED -> UNDONE`: preserve all originals; user resolution creates new revision(s), and undo appends a compensating resolution/revision.

All timestamps serialize as ISO-8601 UTC instants; the IANA zone/offset is metadata, never used instead of the instant. Present timestamps in the user's current local zone. Local transitions are serialized to prevent overlapping active intervals. Remote overlaps are represented as conflicts, not destructive merges.
