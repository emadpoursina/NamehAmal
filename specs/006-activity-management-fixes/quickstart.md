# Quickstart: Activity Management Fixes

## Prerequisites

- Java 17, Android SDK/platform tools, and an Android API 26+ device or emulator.
- For category/activity choices and sync scenarios, a desktop build advertising `entry-title`, `upload-only`, `category-metadata`, and `activity-metadata`, reachable only on a trusted private network.
- No desktop connection is needed to review existing local events or test Settings positioning, selection state, picker cancellation, or confirmed local removal. A category must first be loaded by an explicit successful Sync before a new session can be saved or started.

## Automated validation

From `android/`:

```sh
./gradlew testDebugUnitTest
./gradlew assembleDebug
```

With an emulator/device available:

```sh
./gradlew connectedDebugAndroidTest
```

From the repository root, run host/API regression checks:

```sh
npm test
npm run lint
```

Expected result: Android session/view-model tests, real Room migration and persistence checks, and UI tests pass. Host tests prove category and Activity metadata are returned only by the sync status route, selected IDs reach persisted sessions, upload-only responses do not return desktop events, and Android removal does not delete desktop records. Tests use throwaway storage, not the developer's live desktop database.

## End-to-end scenarios

1. **Settings and main-screen layout**: Open Settings at compact 360×800 dp and expanded 600×960 dp emulator sizes. Verify Back is wholly visible within the Settings `Scaffold` content area below system/app insets and returns to tracking. Reopen tracking and verify its existing header/content position is unchanged.
2. **Completed activity using pickers**: After syncing categories and Activities, choose a saved Activity and verify its title/category are filled in; also enter a custom title. Choose start/end date and time exclusively through the pickers, save a valid past interval, and verify the title/category and optional Activity ID are retained. Try canceling each picker and verify the prior selection is unchanged. Set end equal to or before start and verify validation leaves the list unchanged.
3. **Running activity using pickers**: Choose a saved Activity or enter a custom title, choose a local start date/time no later than now, and Start. Verify the running event has the selected category/optional Activity ID and survives app relaunch; verify a future start and missing category are rejected.
4. **Restart with category and Activity**: Choose Start again on a logged event. Verify its title/category and still-active Activity preset are preselected on the new-session flow, then start it. Change the category before creating another session and verify only the new record uses the changed category. For an event whose category is archived/unavailable, verify another available category is required and the prior event is unchanged. Confirm there is no separate duplicate Start again list.
5. **Individual/bulk selection**: Select two of several records, cancel removal and verify all remain. Confirm selected removal and verify only those rows disappear. Select all, clear selection, and verify no rows were removed by changing selection alone.
6. **Clear all and running removal**: With only some rows selected, choose Clear all. Cancel and verify all rows remain; confirm and verify every Android-local list record is removed, including unselected rows. Separately include a running record in selected removal, cancel and verify it continues running; confirm and verify it is stopped/removed. Confirm the saved endpoint and category metadata remain.
7. **Desktop metadata contract**: Sync with the updated host and verify categories and active saved Activities appear in desktop order. On a fresh install, try an unsupported host or a host with no active categories; verify new sessions remain blocked until a category is loaded. With previously cached metadata, verify offline local entry remains possible, but an unsupported host is rejected before upload. Upload a completed session and verify the desktop record uses the selected category and optional Activity. Remove/clear it on Android and verify the desktop record remains and no deletion is transmitted.
8. **Room upgrade**: Upgrade a v4 database containing completed/running events, pending and acknowledged revisions, and saved endpoint settings to v5. Verify existing IDs, times, zones, running state, acknowledgement data, and settings survive; legacy category IDs remain null rather than being fabricated; category snapshots are added without destructive table clearing.

## Manual review points

- Date and time fields are controls, not editable text inputs; activity title remains text input.
- Settings alone gains top-inset handling; the main tracking layout is not shifted.
- New sessions cannot be saved or started without a selected, currently available desktop category; saved desktop Activity selection fills in its title/category, while custom titles remain editable and reusable from recent titles.
- Start again carries the source category forward by default; changing the new category never mutates the source event.
- Start again appears on logged records only; there is no separate duplicate restart list.
- Clear all is distinct from Clear synced and from remove selected, and it always applies to the full local activity list after confirmation.
- No category refresh or event sync occurs in the background; Android session removals never propagate to desktop.
