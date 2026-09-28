# Research: Android Time Tracking Companion

**Date**: 2026-09-26

## Decisions

### 1. Build a native Kotlin Android app

- **Decision**: Add one Android application module using Kotlin 2.x, Jetpack Compose/Material 3, coroutines, and the Android Gradle Plugin. Keep the desktop Next.js/Electron app and its npm workflow unchanged except for the host sync integration.
- **Rationale**: The feature depends on durable offline records, Android notification actions, and OS-scheduled reminders after the app is backgrounded. Jetpack Compose is Android's recommended modern native UI toolkit. A native app makes permission, notification, persistence, and background-work behavior explicit.
- **Alternatives considered**: A PWA/WebView would share more UI but makes reliable background reminders and offline lifecycle behavior dependent on browser/WebView policy. A hybrid wrapper still needs native plugins for every central behavior and adds a second runtime boundary.
- **References**: [Jetpack Compose](https://developer.android.com/develop/ui/compose); repository guidance in `AGENTS.md` requires the existing desktop app to remain Next.js/TypeScript/Prisma/SQLite.

### 2. Use Room for the phone's source-of-truth timeline

- **Decision**: Persist workdays, interval records, activity snapshots, check-in state, immutable revisions, conflicts, and sync cursors in Room/SQLite. Use DataStore for the saved IP address and port. Every user action that starts/ends a day, switches activity, starts/ends a break, or edits an interval commits locally before reporting success.
- **Rationale**: Phone tracking must work with no network and survive process death. Room provides compile-time checked SQL and migration support over SQLite, appropriate for related interval/version/conflict tables.
- **Alternatives considered**: Preferences or JSON files do not provide the constraints/transactions needed for interval transitions, retries, and conflict history; a remote or Mac-owned database would violate offline-first behavior.
- **Reference**: [Save data in a local database using Room](https://developer.android.com/training/data-storage/room) recommends Room over direct SQLite APIs for non-trivial structured data and offline caching.

### 3. Use WorkManager for approximate hourly check-ins without time-boundary side effects

- **Decision**: Enqueue uniquely named periodic work at an approximately hourly interval only for an active workday; cancel it when that workday ends. The worker checks the durable active-workday state and posts a generic notification if notification permission/channel settings allow it. A check-in marker may record the reminder outcome and reference the relevant interval, but dispatch or a missed reminder MUST NOT close, split, or create a time interval. A missed check-in leaves the interval present and marks it Unconfirmed; user actions alone change activity/break/workday interval boundaries. Opening the app exposes review state if notifications were denied or delayed. No exact-alarm permission is requested.
- **Rationale**: FR-007 and the missed-check-in scenarios require retaining the interval and marking it Unconfirmed, but do not require an hourly interval split. WorkManager supports periodic work, persists scheduling, and permits a 60-minute repeat interval; Android documents a 15-minute minimum and warns that actual execution depends on constraints and system optimization. Exact alarms add special access and battery cost not justified by the spec.
- **Alternatives considered**: `AlarmManager` exact alarms would add a time-critical permission and conflict with the explicit no-exact-alarm MVP requirement. A foreground service or in-process timer would require the app to stay alive.
- **References**: [Define WorkManager requests](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work); [Schedule alarms](https://developer.android.com/develop/background-work/services/alarms/schedule); [Android notification runtime permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission). Android 13+ requires runtime notification permission; denial must not stop tracking.

### 4. Keep the Mac's ordinary web/API listener private; add a sync-only LAN bridge

- **Decision**: Preserve the current desktop origin on `127.0.0.1:3060` and add a separate Electron-owned listener (default port 3061, configurable on the Mac) that forwards only `GET /api/sync/v1/status` and `POST /api/sync/v1/exchange` to Next.js route handlers on loopback. Reject every other path and method. The bridge never opens Prisma/SQLite directly. Android stores the entered Mac IP and bridge port and calls them only after a user taps Sync.
- **Rationale**: The existing Electron runtime configuration binds Next.js to `127.0.0.1`; changing it to `0.0.0.0` would expose unrelated pages and APIs. A dedicated allowlisted bridge preserves server-owned Prisma access while creating the necessary local-network boundary.
- **Alternatives considered**: Widening the existing Next.js listener is broader than the contract; having Electron access SQLite directly would create a second desktop data-access path; a cloud relay is expressly out of scope.
- **Repository evidence**: `electron/runtime-config.ts` defines `DESKTOP_HOST = "127.0.0.1"`, port `3060`, and the matching HTTP origin. `electron/server-process.ts` launches the Next standalone server as a child process.

### 5. Use the trusted private LAN as the accepted MVP trust boundary

- **Decision**: Android saves the manually entered Mac IP/port once and offers an explicit Sync action. There is no QR pairing, pairing credential, HMAC, or per-device authentication. The user can forget the saved endpoint in Android; this stops that app from reusing it but is not server-side revocation and does not prevent another reachable LAN client from calling the bridge. Use HTTP without TLS only on a trusted private LAN. Validate the endpoint as a private-network IP literal and port `1..65535`; constrain the bridge to sync routes and apply request/body/time limits. Keep the ordinary desktop listener loopback-only.
- **Rationale**: The reconciled specification and the v1.1.0 constitution amendment expressly select manual saved-IP/port setup, Android-initiated sync, and no TLS or additional security setup. SC-007 requires sync without security options beyond the saved endpoint. The lack of transport encryption and client authentication is an explicit accepted residual risk under the amendment: a reachable LAN peer can observe or submit sync data. The network trust boundary is therefore essential, and public or otherwise untrusted networks are out of scope.
- **Alternatives considered**: QR pairing/HMAC would reintroduce a setup and authentication flow superseded by the clarified spec. TLS/client certificates would add transport-security configuration excluded from the MVP amendment. Exposing all desktop routes is rejected regardless of transport.
- **Android platform constraint**: Android's current [local network permission guidance](https://developer.android.com/privacy-and-security/local-network-permission) says local-network protections become mandatory for apps targeting Android 17/API 37; direct TCP connections to a manually entered IP require `ACCESS_LOCAL_NETWORK` at runtime. Request that permission with an explanation when needed; denial makes sync fail without touching local records. Android's [networking guide](https://developer.android.com/develop/connectivity/network-ops/connecting) generally recommends SSL; the v1.1.0 amendment explicitly accepts no TLS on trusted private networks for this feature.

### 6. Use a versioned, idempotent exchange with immutable entry revisions

- **Decision**: Synchronize the full shared time-entry set and desktop activity list: a null cursor downloads the complete available history, and subsequent exchanges transfer pending phone revisions, incremental host changes, and the complete activity snapshot. Exchange opaque stable entry IDs, immutable revision IDs and base revision IDs; use a monotonically increasing host change sequence for the download cursor (not client wall-clock timestamps). The host applies each request in one database transaction, treats a repeated revision ID as already applied, stores accepted versions before acknowledging them, and returns host deltas and conflicts. Android applies the complete response and advances its cursor in one Room transaction. A timeout leaves unacknowledged local revisions queued for retry.
- **Rationale**: The desktop's existing `Session` model has a local CUID and `updatedAt`, but no shared identity, source device, revision history, or tombstone. `updatedAt` clocks can differ and cannot safely represent conflict ancestry. Immutable revisions preserve both sides of a concurrent edit; unique revision IDs make retries idempotent.
- **Alternatives considered**: Last-write-wins, direct overwrite, importing through the existing JSON import endpoint, or using timestamps alone can lose edits or duplicate records. The existing `/api/data/import` explicitly warns that repeated imports can create duplicates and is not a sync contract.

### 7. Normalize phone intervals into desktop-owned `Session` records

- **Decision**: Extend the desktop schema additively with sync identity/source fields, optional `activityId`, interval type (`WORK`/`BREAK`), confirmation state, and revision/conflict tables. Keep the existing `Session.categoryId` relation; use the selected desktop `Activity`'s category when importing a phone activity and a reserved `Unassigned` category when the phone interval has no activity. Ensure break intervals are persisted but excluded from work totals. Legacy desktop sessions with no activity ID appear on Android as Unassigned while their title/category remain preserved.
- **Rationale**: The repository has separate Prisma `Activity` and `Category` models: `Activity` has a unique title and category relation, while existing `Session` rows reference required `categoryId` and do not reference `Activity`. A precise mapping is necessary to avoid losing activity identity or changing existing category semantics. Existing rows default to ordinary working time and retain their current meaning.
- **Alternatives considered**: Treating `Category` and `Activity` as the same entity is inconsistent with the schema; stuffing activity IDs into free-text titles is not a stable mapping. A parallel, disconnected sync-only table would leave existing desktop totals and session views unaware of phone time.

### 8. Keep conflicts explicit and reversible

- **Decision**: The sync service preserves all source revisions and creates durable conflict records. Same-activity overlap duration is counted once while the source entries remain identifiable. Different-activity overlaps and two revisions branching from one base revision remain visible in Android's Review conflicts UI; shared unresolved time contributes to no activity total until the user chooses, splits/edits, or assigns it to Unassigned. Persist each resolution as a new revision plus an undoable resolution record.
- **Rationale**: This matches FR-014–FR-016 and avoids silently attributing unresolved shared time to either activity. The phone is the manual sync initiator and is the MVP resolution surface; the desktop host stores authoritative conflict history and returns it on sync.
- **Alternatives considered**: Automatically favoring phone/Mac, merging intervals destructively, or counting the overlap under both activities violates the clarified user-choice and no-double-count requirements.

### 9. Retain the existing desktop activity vocabulary and session semantics

- **Decision**: Use the desktop Activity ID as the phone selection key and preserve its Category ID association when creating desktop records. Legacy desktop Sessions without an Activity ID display as Unassigned on Android while retaining their original title/category. Keep `Session.kind` (`MANUAL`/`TIMER`) separate from a new `entryType` (`WORK`/`BREAK`).
- **Rationale**: The source schema has distinct `Activity` and `Category` models and a required Category foreign key on Session; conflating the two or encoding IDs in titles would be lossy. Breaks must be retained but excluded from working totals.
- **Alternatives considered**: Reusing Category names as Activity IDs or a separate sync-only timeline would break current desktop semantics and reporting.

## Remaining implementation gates (not unresolved product choices)

- Confirm the Android SDK/Gradle toolchain and install/use API 37 emulator/device coverage. The repository currently has no Android project or Android SDK build workflow.
- Check the Electron bridge's port collision and macOS firewall behavior on a real trusted private LAN; report the configured IP/port visibly in desktop settings so Android can save it. Do not treat clearing Android's saved endpoint as server-side access revocation.
