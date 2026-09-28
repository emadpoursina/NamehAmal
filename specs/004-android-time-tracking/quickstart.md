# Quickstart: Validate Android Time Tracking Companion

This is an end-to-end validation guide, not implementation instructions. It assumes the implementation adds the `android/` Gradle project and the desktop sync bridge described in [plan.md](plan.md). Keep test data in a throwaway SQLite database; do not use a valuable desktop profile for conflict/deletion tests.

> **Accepted residual risk (Constitution v1.1.0):** Sync is plain HTTP with no QR pairing, HMAC, or per-device authentication. Any client that can reach the sync bridge may observe or submit time data. Use a trusted private network only, never a public or otherwise untrusted network. Forgetting the endpoint in Android clears that app's saved address; it does not revoke host-side access.

## Final commands (implemented)

Desktop checks (from the repository root):

```bash
npm ci --no-audit --no-fund
# Only if .env is missing: cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm test
npm run lint
npm run desktop:compile
```

Android checks (Room 2.8.5, `targetSdk` 37):

```bash
cd android
./gradlew testDebugUnitTest
./gradlew connectedDebugAndroidTest
./gradlew assembleDebug
```

`ANDROID_HOME` must point at the Android SDK (for example `$HOME/Library/Android/sdk`).

## Bridge settings (actual)

- The desktop sync bridge listens on the LAN port from `NAMEHAMAL_SYNC_PORT` or the default `3061` (`electron/sync-bridge.ts`, `SYNC_DEFAULT_PORT`). It forwards **only** `GET /api/sync/v1/status` and `POST /api/sync/v1/exchange` to the loopback Next.js server.
- The normal desktop UI/API stays on `127.0.0.1:3060` and is never exposed on the LAN.
- Desktop Settings shows a sync bridge card (`app/settings/SyncBridgeCard.tsx`) with the Mac's current private IPv4 address(es) and the sync port plus trusted-private-network-only guidance. The desktop has no Sync button and cannot initiate sync.
- In Android, enter that IP and port once in the sync settings screen and tap Save; later syncs reuse it without asking again. No QR pairing or extra security setup exists. **Forget endpoint** clears only that app's configuration and is not host revocation.

## Permission steps (API 37)

- Grant notification permission when prompted for check-in reminders. Denying it keeps a notification-permission explanation plus in-app timeline/check-in review; tracking never stops.
- Grant local-network access when prompted before the first sync. Denying it makes Sync report a retryable connection error; all phone entries, pending revisions, and the cursor are preserved. Re-request access in system settings, then tap Sync again to retry.
- Exact alarm permission is never requested; reminders are best-effort and may drift.

## Prerequisites

- Node.js 22 and npm (per repository `AGENTS.md`).
- Android Studio/JDK and Android SDK for the configured target SDK; an API 37 emulator or Android 17 device for local-network permission coverage, plus an Android device/emulator for notification scenarios.
- Mac host and Android device on the same trusted private network; a network that permits peer-to-peer TCP traffic; macOS firewall access for the displayed sync port.
- No cloud account or internet connection is required for phone-only tracking.

> **Accepted residual risk (Constitution v1.1.0):** Sync is plain HTTP with no QR pairing, HMAC, or per-device authentication. Any client that can reach the sync bridge may observe or submit time data. Use a trusted private network only, never a public or otherwise untrusted network. Forgetting the endpoint in Android clears that app's saved address; it does not revoke host-side access.

## Prepare the desktop host

```bash
npm ci --no-audit --no-fund
# Only if .env is missing: cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm test
npm run lint
```

Start the Electron desktop host with `npm run desktop:dev`. Confirm the desktop reports its current private IP and sync listening port (default `3061`) in its sync/settings view. Enter and save that IP and port in Android; there is no QR pairing or additional security setup. The normal desktop UI must remain on `127.0.0.1:3060`; do not expose that port on the LAN. Use a disposable desktop profile/database for the conflict scenarios below.

## Build and test Android

```bash
cd android
./gradlew testDebugUnitTest
./gradlew connectedDebugAndroidTest
./gradlew assembleDebug
```

Install the debug APK on the device/emulator. Grant notification and local-network permissions when prompted. Also repeat relevant cases with notification permission denied and (on API 37+) local-network permission denied.

## Scenario A: Offline workday survives restart

1. Put the phone in airplane mode; leave the desktop unavailable.
2. Start a workday, choose a synced activity, switch activity, and start/end a break, leaving the workday active.
3. Force-stop/reopen the app while the workday is active and inspect the timeline/current interval.
4. Attempt a second Start while active, verify it is rejected, then end the workday.

**Expected**: Every transition is present locally after restart; adjacent intervals meet at transition instants; breaks are visibly distinct and excluded from work totals; only one workday is active; unavailable activities can be recorded as Unassigned. No network request occurs.

## Scenario B: Check-in and permission behavior

1. Start a workday with notifications allowed and use the scheduler test clock/WorkManager test driver to advance through a check-in.
2. Confirm one reminder with Same activity; ignore another; then review the timeline. Verify reminder delivery/missing does not split the current interval or create a continuation.
3. End the workday and advance past the next scheduled reminder.
4. Repeat with notifications denied/delayed and app process restarted.

**Expected**: A confirmed check-in marks its interval confirmed; a missed one remains present and Unconfirmed without changing interval boundaries; an in-app review remains available if notifications are denied; tracking continues; no reminder for an ended day is delivered. Real-device timing may drift because the reminder is explicitly best-effort.

## Scenario C: Successful, repeatable manual sync

1. Start the Mac desktop host; put Mac and phone on the same private LAN.
2. Enter the Mac's IP address and displayed sync port once in Android settings and save.
3. Tap Sync for the initial exchange. Verify the complete available desktop activity list and time-entry history are present on Android, and phone entries are represented on the desktop.
4. Tap Sync again without edits; then create one phone entry and one desktop session, sync again and verify both changes arrive.
5. Use **Forget endpoint** in Android, verify Sync cannot reuse the old address, then re-enter and save the IP/port.
6. Disable the desktop bridge/firewall path, tap Sync, restore it, and retry.

**Expected**: No QR, pairing credential, HMAC, or additional security option is required. Initial sync covers all available time entries and the desktop Activity snapshot; later syncs incrementally exchange new/edited entries without duplicate Sessions or inflated totals. Forgetting the endpoint clears the Android configuration only; it is not server-side revocation. A failed attempt reports incomplete and leaves all phone data and pending revisions intact. No exchange is initiated by the app while idle or before Sync is tapped.

## Scenario D: Conflicts, undo, overlap totals

1. Sync a shared interval to both devices. Edit it differently on phone and desktop before syncing either edit; then sync from Android.
2. Create same-Activity overlapping entries from both devices, sync, and inspect source attribution and totals.
3. Create different-Activity overlapping entries, sync, resolve them by keeping either source, splitting/editing, and Unassigned; undo one resolution.
4. Restart both apps and sync again.

**Expected**: Both concurrent versions remain visible in Review conflicts and neither silently overwrites the other. Same-Activity overlap is counted once while retaining both sources. Different-Activity shared time is not double-counted while unresolved; resolution creates a selected result and retains original versions/history; undo restores the unresolved choice state. Repeated sync remains idempotent.

## Scenario E: Platform/network failure and boundary cases

1. Try a malformed/public IP, invalid port, unavailable host, closed port, and changed Mac address.
2. On API 37, deny local-network permission, try Sync, then grant it and retry.
3. Test an interval crossing local midnight and a device time-zone change; test a batch requiring multiple response pages.

**Expected**: Invalid endpoint/permission/connection cases fail clearly without deleting local data or advancing the cursor. Permission can be explained/re-requested through settings. Timestamps remain the same instants and display in the current local zone. A paged sync completes only within the user-started operation.

## Regression checks

From the repository root, run:

```bash
npm test
npm run lint
cd android && ./gradlew testDebugUnitTest connectedDebugAndroidTest assembleDebug
```

Confirm existing desktop session creation, edits, tracker start/stop, category relationships, and statistics retain their pre-feature behavior; imported `BREAK` intervals do not contribute to work totals.

## Validation log (iteration 2, 2026-09-26)

Automated results on this branch (throwaway desktop databases; no `dev.db` touched by sync tests):

- `npm test`: 18 files, 152 tests passed (includes `tests/contract/sync/sync-api.test.ts` — 9 tests covering status shape, null-cursor full-history download plus complete activity snapshot, incremental phone-revision upload, ten idempotent retry cycles, 60-entry pagination with `hasMore`, malformed/oversized/unsupported-protocol rejections with unchanged cursor, and atomic rollback on database failure; `tests/contract/sync/conflicts.test.ts` — 3 tests covering concurrent-edit preservation, same-activity union totals, different-activity exclusion/resolution/undo/idempotent resync; `tests/electron/sync-bridge.test.ts` — 3 tests covering the two-route allowlist, 3061/3060 port separation, and retryable 503s).
- `npm run lint`: clean (0 errors, 0 warnings). `npm run desktop:compile`: clean.
- Android `testDebugUnitTest`: 23 tests passed (includes `EndpointAndRetryTest` — 7 tests: private-IP/port validation, DataStore save/reuse/forget, explicit-only network calls, transport/permission-failure preservation, multi-page atomicity; `ConflictAccountingTest` — 7 tests: duplicates, same-activity union, unresolved exclusion, resolution/undo, break/tombstone handling, adjacency).
- Android `connectedDebugAndroidTest` on `Medium_Phone_API_36.1` emulator: 6 tests passed (offline timeline persistence, scheduler/worker integration).
- Android `assembleDebug`: success.

Manual scenario mapping (A–E):

- A (offline workday survives restart): covered by `TimelinePersistenceTest` + `WorkdayTimelineTest` on emulator; manual airplane-mode walkthrough still recommended on a physical device.
- B (check-ins/permissions): covered by scheduler/worker unit + integration tests, including denied/delayed fallback; lock-screen text omits activity/project names by construction (`CheckInNotification`).
- C (repeatable manual sync): 10-cycle idempotency, failure preservation, cursor semantics, and Forget-endpoint behavior are asserted in `sync-api.test.ts` and `EndpointAndRetryTest`; physical phone↔Mac LAN walkthrough still recommended before release.
- D (conflicts/undo/totals): asserted in `conflicts.test.ts` and `ConflictAccountingTest`, including restart/resync idempotency.
- E (failure/boundary cases): malformed/public IP, invalid ports, closed ports, permission denial, multi-page sync, and timezone-instant handling are asserted; midnight-crossing display and device time-zone changes remain manual checks.
- Usability target SC-003 (90% one-action confirm, ≤3-action quick flow) and private-LAN-only field behavior require human participants and are not claimed by automation here.
- Existing Session/category/timezone regression suites pass unchanged (`npm test` above); `BREAK` exclusion is asserted on both platforms.
