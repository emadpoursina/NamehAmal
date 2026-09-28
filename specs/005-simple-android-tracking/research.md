# Research: Simplified Android Tracking

**Date**: 2026-09-27  
**Scope**: Existing Android companion and its already-authorized manual desktop sync path.

## Decisions

### 1. Keep the current native Android stack and simplify its existing shell

- **Decision**: Continue with Kotlin 2.2.21, Jetpack Compose/Material 3, Room 2.8.5, DataStore 1.1.7, and coroutines. Replace the current Today/Timeline/check-in navigation with a single event-feed surface and a secondary connection-settings surface; add no runtime dependencies.
- **Rationale**: These libraries are already configured in `android/app/build.gradle.kts` and `android/gradle/libs.versions.toml`. The current application entry is `MainActivity` → `TrackerHome`; no new platform or rendering framework is needed.
- **Alternatives considered**: Keeping the current page navigation would preserve the workflow the user asked to retire. Replacing the app or local store would create unnecessary migration and framework work.

### 2. Model Android activity records directly, independently of workdays

- **Decision**: Treat a session/event as a titled time interval. New intervals have no workday association, use `WORK` internally, and are either completed (`endedAt` set) or running (`endedAt` null). Derive previous-title suggestions from locally saved events. Keep at most one running interval.
- **Rationale**: `TimeIntervalEntity.workdayId` is nullable already, and the existing Room timeline is observed newest first. A direct event fits the established Room storage without requiring a new tracking aggregate. A short-lived Room migration adds the free-text title and local sync marker while preserving old rows.
- **Alternatives considered**: Retaining WorkdayController would keep start/end-workday and break transitions in the core path. A new parallel event database would duplicate persistence and complicate migration.

### 3. Preserve timezone and input semantics using instants

- **Decision**: Continue storing epoch/UTC instants together with the device IANA zone and offset at start. Date/time controls use device-local values; completed sessions allow past dates, require `end > start`, and running sessions reject a start later than now. Refresh/reopen computes elapsed time from the persisted start instant.
- **Rationale**: This follows the non-negotiable timezone principle and the existing `TimeIntervalEntity` fields/`IntervalRules` behavior. It remains correct across midnight and daylight-saving transitions.
- **Alternatives considered**: Storing local date/time text or treating a local timestamp as UTC would be ambiguous around zone changes and DST.

### 4. Reuse the saved endpoint and extend the existing sync protocol as upload-only

- **Decision**: Keep `SavedDesktopEndpoint`/DataStore and the current manual status/exchange routes. Add an explicit upload-only exchange capability for the simplified app while leaving the current default behavior available to any legacy client. Upload only completed Android events; carry the free-text title in the event revision and map it into the existing desktop `Session.title`. Require the status response to advertise title and upload-only support before sending. Hostnames may be saved while offline, but a sync connection must resolve only to a private-network destination; ports remain `1..65535`.
- **Rationale**: The existing app already supports user-entered endpoint settings and a trusted-LAN sync bridge. Its current exchange is bidirectional and currently represents labels only by desktop `activityId`; free-text titles and local-only cleanup therefore need an explicit contract extension. The desktop `Session.title` field exists, and the sync store already maps an unassigned event to the reserved Unassigned category, so no desktop UI or new Prisma field is needed.
- **Alternatives considered**: A second sync service/listener or cloud relay would violate the local-first boundary. Sending arbitrary title text as an `activityId` would be invalid/lossy. Keeping the full-download mode for this app would repopulate the temporary phone store and retain unneeded activity/conflict UI. Requiring a DNS lookup at settings-save time would prevent saving an endpoint while offline, so private-destination enforcement belongs to connection time.

### 5. Keep removal local and distinguish it from sync deletion

- **Decision**: Remove an event only after explicit confirmation, physically delete its local event and phone-side revision metadata, and never create/send `deletedAt` for that user action. Clear-synced cleanup removes only locally acknowledged events. The upload-only response has no desktop event delta, so cleared events are not downloaded back.
- **Rationale**: The clarification says Android is temporary storage and desktop copies survive Android cleanup. Existing sync revisions distinguish remote tombstones from local rows; a physical Room delete avoids generating the existing sync tombstone that would remove a desktop record.
- **Alternatives considered**: Setting `deletedAt` or sending a deletion revision would violate the desktop-preservation requirement. Hiding rows while retaining full event payloads locally would not satisfy the requested local wipe.

### 6. Migrate old data safely and disable old check-in scheduling

- **Decision**: Add a Room v3→v4 migration that retains existing intervals, revisions, sync cursor, and endpoint settings. Backfill titles from `activity_snapshots`; label legacy breaks `Break` and otherwise-missing activity names `Unassigned`. Preserve existing running intervals. On upgrade/startup, cancel scheduled check-in work and stop presenting/scheduling workday, break, or check-in flows; leave legacy tables available for migration/history rather than destructively dropping them.
- **Rationale**: A user may already have Room data from the current branch. `TrackerDatabase` is schema version 3, and check-in work is scheduled independently of the UI, so navigation changes alone would not retire notifications. Preserving tables avoids needless loss while the new UI treats them as ordinary historical events.
- **Alternatives considered**: Destructive database recreation would lose offline records and queued retries. Leaving the worker active would continue a flow explicitly retired by the spec.

### 7. Validate locally and at the existing host boundary

- **Decision**: Use Android unit tests for validation/order/lifecycle and sync retry semantics, instrumentation tests for Room migration/persistence, and existing Vitest/throwaway-SQLite tests for API title mapping, upload idempotence, and non-deletion. Keep host-side Prisma access inside the Next.js sync service.
- **Rationale**: The existing build already configures JUnit, coroutines-test, Room testing, and Vitest. Real Room/server storage is required to prove migration and desktop-copy preservation.
- **Alternatives considered**: Testing only UI state or mocking the host store would not prove durable state, migration behavior, or no-duplicate/no-delete properties.

## Resolved design constraints

- Only user-initiated sync sends data; no automatic/background transfer is added.
- Running events remain local until completed, consistent with the current repository's behavior of exporting only closed intervals.
- New title-only events use no desktop Activity ID; server projection preserves the title as `Session.title` and uses the established Unassigned category fallback.
- Desktop and web workflows remain unchanged. Only the existing sync DTO/service behavior is extended for the Android upload-only capability.
- Sync stays within the existing v1 route allowlist and trusted-private-network boundary; no new public listener, credentials, TLS mode, or cloud service is introduced.
