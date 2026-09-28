# Research: Activity Management Fixes

**Date**: 2026-09-27
**Scope**: Android direct-session entry and removal, Settings insets, and desktop category/activity metadata over the already-authorized sync path.

## Decisions

### 1. Use Android's platform date and time dialogs

- **Decision**: Replace editable date/time text fields in the direct-session form with separately selectable date and time controls backed by Android `DatePickerDialog` and `TimePickerDialog`. Keep the current local `YYYY-MM-DD HH:MM` value in UI state and update it only after a picker confirms a choice.
- **Rationale**: The Android app already targets API 26+ and the current domain parser accepts local date-time strings. The platform dialogs require no dependency, return date/time components without converting a selected calendar day through UTC, support past-date selection, and naturally leave state unchanged on dismissal.
- **Alternatives considered**: A new picker dependency would add maintenance and versioning without a needed capability. Material text entry would keep the date/time typing problem. Storing dialog milliseconds directly would risk a date shifting across the device timezone boundary and bypass existing local-time validation.

### 2. Apply top insets to Settings only

- **Decision**: Wrap Settings content in a `Scaffold` and apply its supplied content padding in the same way as the existing tracking screen; keep the tracking screen and its layout untouched.
- **Rationale**: `TrackingScreen` already places its scrollable content inside a `Scaffold` and applies its supplied padding. `SyncSettingsScreen` is currently a bare full-size `Column` without that inset handling, so its first row/back control can render under the system/app top area. Scope the layout correction to Settings.
- **Alternatives considered**: Moving the shared window or activity content would shift the main page, which the user explicitly said is already positioned correctly. A hard-coded top spacer is device-size/status-bar dependent.

### 3. Keep category and saved-activity discovery on the sync-only status route

- **Decision**: Add `category-metadata` and `activity-metadata` capabilities and return category metadata plus saved Activity preset snapshots from the existing `GET /api/sync/v1/status` response. Android fetches and caches both only during explicit Sync, even when there are no event revisions to upload. Activity snapshots contain IDs, titles, category IDs, color, order, and archive state; the route still returns no sessions or timeline rows. Require both capabilities before refreshing either cache or uploading; preserve the previous cache on errors.
- **Rationale**: The Android client already communicates with the desktop over a deliberately narrow sync-only bridge. Ordinary desktop APIs are loopback-only, so mobile must not call them over the LAN. The existing status request is the authorized private-network path and validates protocol capabilities. Cached presets enable a title/category picker without downloading event data or opening another endpoint.
- **Alternatives considered**: Calling ordinary activity/category APIs from Android would cross the existing network boundary. Returning session/event data in upload-only exchange would violate its acknowledgement-only contract. The status response adds only preset metadata; no new endpoint or listener is needed.

### 4. Persist category and selected saved-activity identity on the local event and revision

- **Verified existing schema**: `EntryRevisionEntity` and `TimeIntervalEntity` already have nullable `activityId` fields; `EntryRevisionEntity` also has nullable `categoryId`, while `TimeIntervalEntity.categoryId` was added in Room v5.
- **Decision**: Require an active cached category for every new completed or running session. When a synced desktop preset is selected, persist its active `activityId` alongside its category; free-text titles remain custom session titles with a null activity ID. Preserve null IDs for historical/custom sessions. Restart carries a saved Activity ID only while that preset and category remain available. Category and Activity snapshots refresh transactionally from status metadata.
- **Rationale**: Persisting selected IDs on the source event and queued revision makes them survive process restarts and delayed uploads. Existing columns support this without a Room migration. The desktop Category and Activity catalog remain authoritative.
- **Alternatives considered**: Inferring an Activity or category from a title is ambiguous. Keeping selected IDs only in Compose state loses them across relaunch. Creating desktop Activity records from free-text session titles would conflate reusable presets with recorded sessions.

### 5. Implement bulk selection and Clear all as physical local deletes

- **Decision**: Keep selected entry IDs in screen/view-model state. Add individual selection, Select all, clear selection, confirmed removal of the selection, and a separate confirmed Clear all operation. Execute selected/all removals in a Room transaction that deletes local revision metadata and corresponding event rows; do not create sync tombstones or issue a network call. Clear all always targets the currently displayed Android-local event set regardless of selection state.
- **Rationale**: Existing single-event removal already physically deletes local sync revisions and event data and does not enqueue a deletion. Reusing that invariant in a transaction preserves the desktop copy and supports atomic bulk actions. Existing sync endpoint and category cache are separate data and remain untouched.
- **Alternatives considered**: Reusing “Clear synced” would omit pending events and would conflate distinct user actions. Soft deletion/tombstones would risk deleting desktop records on a later sync. Deleting category or endpoint storage would exceed the meaning of activity clearing.

### 6. Extend existing test seams and keep validation layered

- **Decision**: Use Android unit tests for category-required session rules and view-model/restart behavior, Room migration and delete tests against a real database, Compose/UI checks for pickers/settings/list actions, and existing Vitest contract/sync-service tests for category/activity metadata and desktop association. Run sync host tests with throwaway storage.
- **Rationale**: The Android Gradle project already configures JUnit, coroutines-test, Room testing, and Compose UI testing. The repo already has a dedicated upload-only contract and integration test seam, which can prove that category metadata is added without returning desktop events and that selected IDs reach persisted sessions.
- **Alternatives considered**: Mock-only tests would not prove migration survival, Room transactions, or server-side category association. Manual testing alone would not protect the device-local deletion/no-desktop-delete invariant.

## Resolved design constraints

- Category and saved-Activity discovery remain user-initiated through the existing trusted-private-network sync path. If the host lacks either metadata capability, Android stops before uploading and preserves the existing metadata cache.
- Only active categories appear as choices. Previously saved event category IDs are not rewritten when a category is archived or another category is selected.
- The new Android client always assigns category IDs to newly created/restarted sessions. It also carries an Activity ID when a synced saved preset is selected; custom titles remain free text. Historical nullable IDs are preserved.
- The upload-only event response stays acknowledgement-only; the status route returns only category and saved-Activity metadata, no desktop session/timeline data is downloaded, and Android removal is never sent to the host.
- No unresolved technical clarification remains after reviewing the Android app, current sync contract, host route/service, Room schema, and feature specification.

## Terminology and implementation sequencing

- In Android-facing language, **session/event/entry** means a recorded time entry; a custom title is free text. The desktop's capitalized Prisma `Activity` is a reusable preset that Android can select from a synced snapshot; free-text session titles do not create desktop Activity rows.
- T002 owns an isolated active-category fixture for its picker UI scenario; it does not wait for or read US2's desktop cache.
- Shared-file changes are serial: `TrackingScreen.kt` / `TrackingViewModel.kt` follow T003 → T016 → T020, and `SyncRepository.kt` follows T013 → T015.
