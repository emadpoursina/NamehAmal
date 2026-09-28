# Implementation Plan: Simplified Android Tracking

**Branch**: `android-time-tracking` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: [Feature specification](spec.md), including clarifications that retire workday/break/check-in flows, allow past manual sessions, and make Android a temporary local store whose explicit sync uploads events without propagating local removals.

## Summary

Replace the workday/timeline/check-in interaction with one Android event feed, newest first. Users can add completed sessions with a title and local start/end date-times (including past dates), start/stop one running session, restart a prior title, and remove local events. Keep manual server settings and sync, but make simplified Android sync upload-only: a completed event is marked synced only after desktop acknowledgement, and local removal/cleanup never sends a deletion. Reuse the existing Room, DataStore, Compose, and desktop sync infrastructure; add a title-bearing upload mode so free-text Android titles survive as desktop `Session.title` values without changing desktop screens.

## Technical Context

**Language/Version**: Kotlin 2.2.21 / Java 17 for Android; TypeScript 6.0.3 for the existing desktop sync service.

**Primary Dependencies**: Jetpack Compose + Material 3, Room 2.8.5, Preferences DataStore 1.1.7, Kotlin coroutines; existing Next.js 16 / Prisma 7 sync routes and Electron sync-only bridge. No new runtime dependency is planned.

**Storage**: Android Room/SQLite (currently schema v3) for events and sync acknowledgements; DataStore for the saved host/port; desktop SQLite/Prisma remains authoritative for uploaded desktop records.

**Testing**: Android JUnit/coroutines unit tests, Room migration and persistence instrumentation tests, Compose/UI or ViewModel flow tests; Vitest contract and sync-service tests using throwaway SQLite. Commands include `cd android && ./gradlew testDebugUnitTest` and root `npm test`.

**Target Platform**: Android API 26+, target SDK 37; companion sync to the existing desktop host on a trusted private network.

**Project Type**: Native Android mobile app in a monorepo with an existing Next.js/Electron desktop sync host.

**Performance Goals**: No numeric SLO. Local create/start/stop/remove must commit before success; list order and running duration update without a network dependency; retries must not duplicate desktop records.

**Constraints**: Offline-first local tracking; persist UTC instants with IANA zone and offset and display device-local time; manual intervals require `end > start`, while running-session starts cannot be in the future; at most one running event; sync only on explicit user action, using the existing trusted-LAN-only transport; never send deletion/tombstone for Android local removal. Do not expose workday, break creation, check-in, Today/Timeline navigation, or split actions. Preserve old Room data through migration and cancel scheduled check-ins on upgrade.

**Scale/Scope**: One Android installation and one existing desktop installation; local event history and bounded manual upload batches. No cloud sync, accounts, desktop workflow redesign, or multi-user support.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Result | Evidence and plan |
|---|---|---|
| Local-first, single-user monolith and scoped Android sync | **Pass for the existing companion** | This is a simplification of the already-authorized Android companion on the current `android-time-tracking` branch, not a new network product. The existing manual Android-to-Mac sync boundary remains: trusted private LAN only, no cloud, no desktop-initiated/background sync, and no wider desktop listener. Upload-only sync narrows the existing exchange; hostname input must still resolve to a private-network destination before connecting. |
| Server-owned desktop data access | **Pass** | Android calls only the existing sync API/bridge. Desktop session projection remains in the Next.js server service; Android never opens Prisma or desktop SQLite. `Session.title` already exists, so the host API maps the uploaded title into that field and uses the existing Unassigned category mapping when no desktop activity is selected. Desktop/web screens and ordinary routes remain unchanged. |
| Timezone-aware time logic (non-negotiable) | **Pass** | Save instants plus device IANA zone and start-time offset. Convert date/time picker values using the device zone; compare instants for positive duration and future-start validation. |
| Test-first with real dependencies | **Pass** | Cover Room v3→v4 migration and persistence, local session lifecycle and ordering, sync acknowledgement/retry/removal behavior, and the host sync contract/service with throwaway SQLite. |
| Simplicity and framework trust | **Pass** | One primary event feed plus a secondary connection-settings surface. Keep the current Compose/Room/DataStore layers; remove the old tracking flows from navigation rather than introducing a new UI framework or sync service. |
| Data/security constraints | **Pass with existing trusted-LAN restriction** | Keep the sync-only allowlist and user-initiated HTTP transport authorized by the Android amendment. Accept IP addresses and local/private hostnames only; validate ports 1–65535 and reject a hostname whose resolved destination is not private. Failed connection leaves Room data available. |

### Post-design re-check

The proposed title-bearing upload mode remains Android-initiated and LAN-only, and server-side persistence still runs through the existing sync service. Upload acknowledgements are idempotent; Room state is marked synced only after a successful response is committed locally. Android deletions physically remove local event data and are not translated into server tombstones. Room migration retains existing intervals and cancels check-in work. No desktop user workflow, listener exposure, cloud service, or timezone rule is changed.

## Project Structure

### Documentation (this feature)

```text
specs/005-simple-android-tracking/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
```text
android/
├── app/src/main/java/com/namehamal/tracker/
│   ├── data/local/          # Room event title/status fields, DAOs, v3→v4 migration
│   ├── data/sync/           # Existing client, upload-only acknowledgement handling
│   ├── data/                # Existing saved desktop endpoint (DataStore)
│   ├── domain/              # Direct event validation and start/stop/remove operations
│   ├── ui/tracking/         # Single event list and session-entry/start-stop flows
│   └── ui/sync/             # Connection settings and explicit Sync action
├── app/src/test/            # Domain, sync, endpoint-validation, ViewModel tests
└── app/src/androidTest/     # Room migration/persistence and UI-flow tests

app/api/sync/v1/             # Existing status/exchange routes; add upload-only capability
app/server/sync/             # Validate/store event title and project into desktop Session
electron/sync-bridge.ts      # Retain existing sync-only LAN allowlist
prisma/schema.prisma         # Existing Session.title; no new persisted desktop field expected
tests/contract/              # Host upload-only and idempotency contract tests
```

**Structure Decision**: Keep the existing Android app module and its Room/Compose/DataStore structure. Replace the navigation and interaction in the tracking UI, evolve Room with an additive migration, and extend only the existing versioned sync API/service required to transfer user-entered titles and acknowledgements. Do not add a second Android module, desktop UI flow, listener, or persistence store.
