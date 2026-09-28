# Implementation Plan: Android Time Tracking Companion

**Branch**: `android-time-tracking` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)

**Input**: `/Users/emad/Projects/playground/nameh-amal/scratch/androidphone-tracker.md` and the clarified feature specification.

## Summary

Add an offline-first native Android companion that records workdays, activity/break intervals, and best-effort check-ins in a local Room database. The user enters and saves the Mac IP/port once, then initiates full-data sync only from Android. On desktop, add a narrow LAN sync bridge to the existing loopback-only Next.js server; versioned, idempotent exchanges preserve competing edits and expose overlap conflicts for user resolution. The exchange is incremental after initial sync, but covers the complete shared time-entry set and desktop activity list. No cloud service or automatic data exchange is introduced. The desktop's current listener is `127.0.0.1:3060`; it must not be widened to the LAN because that would expose unrelated UI and APIs.

## Technical Context

**Language/Version**: Kotlin 2.x for Android; TypeScript 6.0.3 for the existing Next.js/Electron host.

**Primary Dependencies**: AndroidX Jetpack Compose + Material 3, Room 3.0, WorkManager, Kotlin coroutines; existing Next.js 16 App Router, Electron host, Prisma 7.10, SQLite, Vitest.

**Storage**: Room/SQLite on Android for workdays, intervals, activity snapshots, revisions, conflicts, and sync cursors; Android DataStore for the saved Mac IP/port. Existing desktop SQLite/Prisma remains authoritative for desktop records; add sync metadata and immutable revision/history records.

**Testing**: Kotlin/JUnit unit tests, Room and WorkManager tests, Android emulator/device notification-permission scenarios, sync contract/integration tests against a throwaway SQLite DB, and existing `npm test` + `npm run lint` checks.

**Target Platform**: Android API 26 minimum, with target SDK set to the current stable SDK (37 when Android 17 is stable); macOS desktop host. Local-network access permission and notification permission are runtime conditions, not sync setup options.

**Project Type**: Existing Next.js/Electron desktop plus a new, sibling native Android app in this repository.

**Performance Goals**: No numeric latency SLO is specified. Tracking state changes must commit locally before UI success; sync batches are bounded and retry-safe; reminders are best-effort rather than exact.

**Constraints**: Tracking must work offline and after process restart. Only a manual Android action exchanges data; the desktop does not initiate sync. The user manually enters and saves the Mac IP/port once. There is no QR pairing, HMAC, or other paired-device authentication; forgetting the saved endpoint is the MVP's endpoint-revocation action. Sync uses HTTP without TLS on a trusted private LAN only. This is an explicit accepted residual risk under the v1.1.0 constitution amendment: LAN peers able to reach the sync bridge may observe or submit data, and forgetting the endpoint only stops this Android app from using it; it does not revoke server-side access. Do not use sync on public or otherwise untrusted networks. Keep the listener sync-only and the ordinary desktop listener loopback-only. No Android SDK/Gradle project currently exists in the repository.

**Scale/Scope**: One primary Android phone and one existing desktop installation; single user; local data volume; no cloud, accounts, teams, iOS, or remote notifications.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Result | Evidence and plan |
|---|---|---|
| Local-first, single-user monolith; scoped Android sync exception | **Pass under Constitution v1.1.0** | The amendment record in `.specify/memory/constitution.md` authorizes manual saved-IP/port, Android-initiated full-data sync over a trusted private network without TLS, with no cloud service. The accepted residual risk is explicit: HTTP is unencrypted and the no-pairing/no-HMAC bridge cannot authenticate individual LAN clients; forgetting the Android endpoint does not revoke host-side reachability. Ordinary desktop routes remain loopback-only. |
| Server-owned desktop data access | **Pass** | Android owns its Room database. The Mac sync route remains a Next.js server-owned Prisma operation; the LAN bridge only forwards an allowlist of sync paths and never opens SQLite itself. Keep the existing app/API listener on `127.0.0.1:3060`. |
| Timezone-aware time logic (non-negotiable) | **Pass** | Persist interval instants in UTC, plus the IANA zone and offset captured at recording time. Display in the device's current local zone; use instant arithmetic across midnight/DST. |
| Test-first with real dependencies | **Pass** | Exercise Android persistence with Room and scheduler behavior with WorkManager tests; use throwaway SQLite for Next route tests. Keep regression coverage for existing session lifecycle, category and stats behavior. |
| Simplicity and framework trust | **Justified expansion** | The native companion, sync listener, immutable versions, and conflict UI are required by the offline, notification, bidirectional-sync, and preservation requirements. Keep the app one Android module and the host bridge limited to one versioned API surface. |
| Data/security constraints | **Pass with accepted residual risk under Constitution v1.1.0** | Use the saved IP/port over HTTP on a trusted private LAN only; no TLS, QR pairing, HMAC, or per-device authentication is required. Android exposes Sync as a user action and the desktop has no initiation control, but an unauthenticated bridge cannot prove that a reachable request came from that UI. Forgetting the saved endpoint only clears the Android configuration. Android local-network permission denial must fail safely. Expose only sync endpoints; keep all data local unless the user starts Sync. |

### Post-design re-check

The proposed Room database, Next.js sync routes, and dedicated Electron LAN proxy preserve local-first ownership and keep ordinary desktop endpoints loopback-only. The manual saved endpoint and Android-only Sync action implement the v1.1.0 exception. The explicitly accepted residual risk is plaintext, unauthenticated LAN access; the private-network restriction and narrow sync-only bridge limit exposure but do not provide confidentiality or client authentication. Concurrent edits are retained as immutable versions; overlap resolutions are reversible. The constitution amendment and backwards-compatibility assessment are recorded in `.specify/memory/constitution.md` v1.1.0.

## Project Structure

### Documentation (this feature)

```text
specs/004-android-time-tracking/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/sync-api.md
└── tasks.md                  # Produced by the tasks stage, not this plan
```

### Source Code (repository root)

```text
android/
├── app/src/main/java/.../
│   ├── data/local/            # Room entities, DAOs, migrations
│   ├── data/sync/             # HTTP client, exchange repository, cursor handling
│   ├── domain/                # Interval, workday, overlap and conflict rules
│   ├── notifications/         # WorkManager scheduling and notification actions
│   └── ui/                    # Today, timeline, check-in, sync/settings, conflicts
├── app/src/test/              # Domain, DAO, sync, and scheduler tests
└── app/src/androidTest/       # Room migration and notification integration tests

app/api/sync/v1/               # Next.js server-owned sync/status route handlers
app/server/sync/               # Validation, transactional exchange, conflict/version services
electron/sync-bridge.ts        # LAN-only allowlisted proxy to loopback Next.js routes
electron/runtime-config.ts     # Sync bridge lifecycle/default port configuration
prisma/schema.prisma           # Session/activity sync identity, versions, conflicts
prisma/migrations/             # SQLite-compatible additive migrations
tests/contract/                # Host API and end-to-end sync contract tests
```

**Structure Decision**: Add one native Android application under `android/`; keep desktop persistence and business rules in the existing Next.js server process. A separate Electron bridge exposes only the versioned sync endpoints on the LAN, while the existing UI/API origin remains loopback-only. Use Room locally rather than sharing code or storage with the web app.

## Complexity Tracking

| Necessary expansion | Why needed | Simpler alternative rejected because |
|---|---|---|
| Native Android project alongside the desktop monolith | Native offline storage, notifications, notification actions, and background scheduling are core requirements. | A PWA/WebView cannot provide the same persistent local timeline and OS notification behavior reliably while the app is closed; hybrid plugins add equivalent native complexity without a project precedent. |
| Dedicated LAN bridge plus sync API | Android must reach the Mac while the normal app server remains loopback-only. | Binding the full Next.js server to all interfaces would expose unrelated APIs and the UI; direct SQLite access from Electron would bypass server-owned data access. |
| Immutable revisions, sync cursors, and conflict records | Idempotent retries, concurrent-edit preservation, undo, and overlap review require durable history. | Last-write-wins or direct row overwrite would silently lose a device's edit and violate FR-016. |
