# Quickstart: Simplified Android Tracking

## Prerequisites

- Java 17, Android SDK/platform tools, and an Android API 26+ device or emulator.
- For sync scenarios, a desktop build that exposes the existing sync-only bridge and advertises `entry-title` plus `upload-only`; phone and desktop must be on a trusted private network.
- No server is needed for local tracking, removal, ordering, or persistence scenarios.

## Build and automated validation

From the repository root:

```sh
cd android
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

With an emulator/device available, additionally run:

```sh
./gradlew connectedDebugAndroidTest
```

From the repository root, run host contract/regression checks:

```sh
npm test
npm run lint
```

Expected result: Android unit and Room integration tests pass; host sync contract tests prove title projection into `Session.title`, idempotent retries, upload-only acknowledgements, and that no host delta or deletion is returned. Tests use throwaway databases, never the developer's live desktop database.

## End-to-end scenarios

1. **Manual and past session**: Open the single tracking screen, enter a nonblank title and local start/end values in `YYYY-MM-DD HH:MM` format on a past date, then choose **Save completed**. Verify one completed row appears in the all-dates feed, newest first. Try a blank title and an end equal to/before the start; verify validation and no new row.
2. **Running session and restart**: Enter a title and a local start time no later than now, then choose **Start**. Verify elapsed time advances and the row survives force-stop/relaunch. Choose **Stop** and verify the end is persisted. While it is running, try another Start and verify the active event is not replaced. Try a future running start and verify it is rejected.
3. **Previous title**: Choose a title from a prior event's Start again action. Verify a new running event gets a new ID and the source event remains unchanged.
4. **Ordering and removal**: Create several events on different dates and with equal start times. Verify the list is newest-first with deterministic ties. Remove one event, cancel another removal, then confirm removal of a running event; verify only confirmed local rows disappear after reopening.
5. **Connection settings**: Save a valid IP address or hostname and port while offline, reopen settings, and verify values persist. Try malformed host input and ports outside `1..65535`; verify the last valid setting remains. At connection time, verify public DNS results are rejected. With the desktop unavailable, request Sync and verify the error leaves local events usable.
6. **Upload-only acknowledgement and local cleanup**: Choose **Sync** for a completed titled event. Verify the desktop has one Session with the same title and times and Android marks it synced only after its revision ID is acknowledged. Retry and verify no duplicate. Remove or clear the synced event on Android, then Sync again; verify the Android row is gone while the desktop Session remains. Confirm no desktop events are downloaded and no deletion/tombstone is sent. Keep an unaccepted event through a failed/partial sync and verify it remains pending.
7. **Upgrade migration**: Start with a v3 Room database containing a completed event, a running interval, a break, acknowledged and pending revision rows, a sync cursor, and saved endpoint settings. Upgrade to v4. Verify IDs/times/timezones/revisions/cursor/settings remain, titles are backfilled from activity snapshots or `Break`/`Unassigned`, acknowledgement timestamps are preserved/derived, the running interval remains stoppable, and old check-in work is canceled.

## Manual review points

- The main screen is one flat all-events list with completed-entry inputs and running Start/Stop controls; it has no Today/Timeline selector, workday start/end, break creation, check-in reminder/review, or split action.
- Connection settings and Sync are user-invoked; Sync uploads completed titled events only and never downloads desktop changes.
- Sync stays on the existing trusted-private-network boundary. A failed server connection never blocks local event entry, review, or removal; confirmed removals are Android-local only.
