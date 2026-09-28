# Implementation Plan: Activity Management Fixes

**Branch**: `activity-management-fixes` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)

**Input**: [Feature specification](spec.md)

## Summary

Improve the Android direct-session screen with local date/time pickers, required desktop-category selection, category-preserving restart, bulk selection/removal and Clear all, and a Settings back control that respects the system/app top inset. Keep the existing Compose, Room, and DataStore architecture. Cache desktop category metadata through the existing manually invoked, trusted-LAN sync status endpoint, persist each new session's selected category locally and in its upload revision, and keep all Android removals local-only. Do not reposition the main tracking screen or download desktop sessions.

## Technical Context

**Language/Version**: Kotlin 2.2.21 and Java 17 (Android); TypeScript 6.0.3 for the existing desktop sync host.

**Primary Dependencies**: Jetpack Compose and Material 3, Room 2.8.5, Preferences DataStore 1.1.7, Kotlin coroutines; existing Next.js 16.2.4/Prisma 7 sync service and Electron sync-only bridge. Use Android framework date/time dialogs and existing dependencies; no new runtime dependency.

**Storage**: Android Room/SQLite, currently schema v4, for time intervals, upload revisions, and category metadata cache; DataStore for the saved host and port. Desktop SQLite/Prisma remains authoritative for categories and accepted sessions.

**Testing**: Android JUnit/coroutines unit tests, Room migration/persistence instrumentation tests, and Compose UI tests where supported; Vitest route/contract/sync-service tests against throwaway SQLite. Key commands: `cd android && ./gradlew testDebugUnitTest`, `cd android && ./gradlew connectedDebugAndroidTest`, root `npm test`, and root `npm run lint`.

**Target Platform**: Android API 26+, target SDK 37; optional explicit sync to the existing desktop host on a trusted private network.

**Project Type**: Native Android mobile app in a monorepo with a Next.js/Electron desktop sync host.

**Performance Goals**: No numeric SLO. Local create/start/stop/remove and selection changes remain responsive and network-independent; category metadata refreshes only as part of user-requested sync.

**Constraints**: Store instants with device IANA timezone and offset; date/time controls use device-local values, allow past completed records, and retain existing range/future-start validation. Every newly created or restarted Android session requires an available category; historical records may retain a null category. Sync remains explicit, trusted-LAN-only and upload-only for event records. Android removals must not create remote tombstones or delete desktop data. Preserve existing Room rows, saved endpoint settings, and the main tracking layout.

**Scale/Scope**: One Android installation paired with one desktop installation, a desktop-owned category list, and the device's existing local session history. No cloud, accounts, new sync listener, or desktop workflow redesign.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Result | Evidence and plan |
|---|---|---|
| Local-first, single-user monolith and authorized Android sync | **Pass** | Reuse the 004/005-approved, explicit Android-to-desktop sync path on a trusted private network. Fetch only category metadata from the sync status route; no cloud, background sync, desktop-initiated sync, or general LAN listener. Upload-only event exchange continues to return acknowledgements and no desktop events. |
| Server-owned desktop data access | **Pass** | Category metadata and category/session validation stay in the Next.js sync service. Android calls only the existing sync route/bridge and never accesses Prisma or desktop SQLite. Do not call ordinary desktop category APIs from Android. |
| Timezone-aware time logic (non-negotiable) | **Pass** | Pickers produce device-local date/time components; existing validation converts them with the system ZoneId to instants and retains the time zone and offset. Existing DST-gap, positive-duration, and future-start checks remain authoritative. |
| Test-first with real dependencies | **Pass** | Cover category-required create/start/restart and picker state, real Room v4→v5 migration and persistence, bulk local deletion/acknowledgement safety, and the status/exchange contract with the existing host test storage. |
| Simplicity and framework trust | **Pass** | Use the existing Compose screens, Room repositories, and status/exchange API. Use platform picker dialogs, avoid a new dependency or second data store, keep bulk state in UI state, and leave the main tracking layout intact. |
| Data/security constraints | **Pass** | Category metadata goes only through the existing sync-only, manual, private-network boundary; no credentials, new route allowlist, or ordinary endpoint exposure. Failed or unsupported sync leaves local records and the last valid endpoint intact. |

### Post-design re-check

The design keeps category discovery inside the existing Android-authorized sync path and returns metadata only, not desktop event data. Category choices are persisted locally; session writes still pass through Android's repository and server-side sync validation. Room migration is additive, pickers retain device-local timezone rules, and physical removal remains a local-only operation. No desktop UI, main tracking layout, listener boundary, or constitution exception is expanded. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/006-activity-management-fixes/
├── plan.md
├── research.md
├── data-model.md
├── contracts/sync-categories.md
└── quickstart.md
```

### Source Code (repository root)

```text
android/app/src/main/java/com/namehamal/tracker/
├── data/local/       # Room entities, DAOs, repositories, migrations
├── data/sync/        # Manual status/exchange client and category cache refresh
├── ui/sync/          # Settings layout and back navigation
└── ui/tracking/      # Date/time/category inputs and activity selection/removal
android/app/src/test/ # Session rules, view-model, bulk-removal, and sync tests
android/app/src/androidTest/ # Room migration/persistence and Compose UI checks
app/api/sync/v1/      # Existing status and exchange routes
app/server/sync/      # Status metadata, exchange validation, and session persistence
electron/             # Existing sync-only bridge; no new general route
tests/contract/       # Host sync contract and category-assignment tests
prisma/schema.prisma  # Existing desktop Category and Session models
```

**Structure Decision**: Keep the Android app's existing module and UI/data layers. Evolve Room additively and extend the current sync status contract for category metadata; do not add a module, service, endpoint outside the existing sync route, or category-management UI.

## Complexity Tracking

No constitution violations; no complexity justification is required.
