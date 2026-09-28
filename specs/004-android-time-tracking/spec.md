# Feature Specification: Android Time Tracking Companion

**Feature Branch**: `android-time-tracking`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "/Users/emad/Projects/playground/nameh-amal/scratch/androidphone-tracker.md" (full PRD contents used)

## Clarifications

### Session 2026-09-26

- Q: How should the user configure and start sync, given the QR-pairing flow in the source PRD? → A: For the MVP, the user manually enters and saves the Mac's IP address and port once, then starts sync with Android's Sync button. This manual setup supersedes the source PRD's one-time QR pairing; no QR pairing step is required. Sync covers all phone and desktop time entries and the desktop activity list.
- Q: Which device may initiate sync? → A: Android only. This narrows the source PRD's “either app” initiation option; the desktop does not initiate sync.
- Q: What network and transport-security assumption applies? → A: Sync is for a trusted private network only; users must not use it on public or otherwise untrusted networks. The MVP uses no TLS and requires no additional transport-encryption setup.
- Q: If the phone and desktop both edit the same synced interval before either receives the other's edit, how should the app resolve the competing versions? → A: Ask the user to choose between the preserved versions; do not silently overwrite one.
- Q: What governance record authorizes this sync scope? → A: The v1.1.0 amendment record in `.specify/memory/constitution.md` (“004 Android Time-Tracking Amendment Record,” dated 2026-09-26) documents the sole maintainer's direction, rationale, and backwards-compatibility assessment for manual IP/port setup, full-data sync on a trusted private network, and no TLS. No separate external approval document is claimed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track a Workday Offline (Priority: P1)

As a person tracking my own work, I want to start a workday on my Android phone, choose what I am doing, and record changes, breaks, and the end of my day without a network connection, so that my work time remains useful when my desktop or internet is unavailable.

**Why this priority**: Independent phone tracking is the core value of the companion and addresses the problem of desktop time continuing while the user is away.

**Independent Test**: Put the phone offline, start a workday with a listed activity, change activities, record a break, end the day, and verify the complete timeline remains available after closing and reopening the app.

**Acceptance Scenarios**:

1. **Given** no workday is active and the phone is offline, **When** the user starts a workday and selects an available activity, **Then** the phone records a local workday and an interval for that activity.
2. **Given** an active interval, **When** the user changes activities, **Then** the current interval ends and an interval for the new activity begins at the same transition time, with no elapsed time lost.
3. **Given** an active workday, **When** the user starts a break, **Then** the activity interval ends and a distinct non-working break interval begins; when the break ends, a new activity interval begins.
4. **Given** an active workday, **When** the user ends it, **Then** the current interval closes and no further time is added to that workday.
5. **Given** an activity is unavailable in the most recently synced activity list, **When** the user starts or edits an interval, **Then** the user can assign it to Unassigned and resolve it later.
6. **Given** a saved timeline, **When** the user edits or splits an interval or assigns it to Unassigned, **Then** the revised timeline is saved locally and remains available after an app restart.
7. **Given** the user has not made a tracking action, **When** location, app or website usage, keyboard or mouse activity, or meeting state changes, **Then** the system does not infer work, a break, or an activity.

---

### User Story 2 - Confirm Work with Check-ins (Priority: P2)

As a person working through a day, I want an approximately hourly reminder to confirm what I have been doing or make a quick correction, so that forgotten activity changes and breaks can be reviewed without silently losing time.

**Why this priority**: Check-ins help keep a useful timeline current while respecting that only the user can determine whether they were working or taking a break.

**Independent Test**: Start a workday with notifications allowed, confirm one check-in, ignore another, and verify the confirmed and unconfirmed timeline states; then end the workday and verify reminders stop.

**Acceptance Scenarios**:

1. **Given** a manually started workday, **When** check-in reminders are enabled, **Then** the phone schedules best-effort reminders at approximately hourly intervals only for that workday.
2. **Given** a check-in notification, **When** the user chooses Same activity, **Then** the current activity interval is confirmed without changing its activity.
3. **Given** a check-in notification, **When** the user opens its quick flow, **Then** the user can change activity, record a break, or end the workday.
4. **Given** a check-in is missed, **When** the user later views the timeline, **Then** its interval is still present, visibly marked Unconfirmed, and available for review or editing.
5. **Given** notifications are denied or delayed, **When** the user opens the app, **Then** the app explains the notification state and provides an in-app timeline/check-in review without stopping or discarding tracking.
6. **Given** a workday ends, **When** its scheduled reminder time passes, **Then** no further check-in notification is sent for that workday.
7. **Given** a check-in is shown on the lock screen, **When** the notification is displayed by default, **Then** it does not include activity or project names.

---

### User Story 3 - Configure and Sync with the Desktop (Priority: P3)

As a person using both the Android companion and the existing desktop tracker, I want to save the Mac's network address in Android and manually sync all time data from there, so that both devices have the same records without relying on cloud sync.

**Why this priority**: Local manual sync connects the independent phone timeline to the existing desktop record while keeping the user in control of when data leaves either device.

**Independent Test**: Enter the Mac's IP address and listening port in Android, sync all time entries and activities with the running desktop, repeat the sync and verify the second attempt creates no duplicate time; then retry with the desktop unavailable and verify the phone retains its data.

**Acceptance Scenarios**:

1. **Given** the Mac's sync endpoint is available, **When** the user enters its IP address and listening port in Android, **Then** the app saves them for later syncs without asking again and does not require QR pairing.
2. **Given** the saved endpoint is reachable, **When** the user taps Sync in Android, **Then** all phone and desktop time entries and the desktop activity list are synchronized, including new and edited entries.
3. **Given** a sync has completed, **When** the user repeats it without new changes, **Then** no second copy of an entry is created and totals do not increase from retrying.
4. **Given** the Mac's sync endpoint is off, unreachable, or no longer at the saved address, **When** the user requests sync, **Then** sync reports that it did not complete, all phone data remains available, and the user can retry after restoring the connection.
5. **Given** the user has not tapped Sync, **When** Android is idle or the desktop is running without an Android request, **Then** neither device initiates an exchange and no time data is exchanged with a cloud service or another device.

---

### User Story 4 - Review and Resolve Sync Conflicts (Priority: P4)

As a person reviewing records from both devices, I want overlaps between different activities and competing edits to be shown explicitly and resolved by me, so that totals do not double-count time and neither device's changes are silently lost.

**Why this priority**: Explicit conflict handling preserves trustworthy totals and gives the user control when the two devices record different activities at the same time.

**Independent Test**: Provide overlapping phone and desktop entries and a synced interval edited independently on both devices; verify same-activity overlap is not counted twice, conflicts appear in Review conflicts, and user resolutions can be undone.

**Acceptance Scenarios**:

1. **Given** exact duplicates or overlapping entries for the same activity arrive from both devices, **When** totals are shown, **Then** the shared time is counted no more than once and source records remain identifiable.
2. **Given** entries from different activities overlap, **When** sync finishes, **Then** the overlap appears in Review conflicts, remains visible until resolved, and does not inflate totals while unresolved.
3. **Given** an unresolved overlap, **When** the user reviews it, **Then** the user can keep either device's entry, split or edit the interval, or assign the result to Unassigned.
4. **Given** the user resolves an overlap, **When** the resolved timeline is displayed, **Then** the selected result is used without double-counting, original records and the resolution are retained, and the user can undo the resolution.
5. **Given** the same synced interval is edited independently on the phone and desktop before either edit is received by the other, **When** sync completes, **Then** both versions remain available in Review conflicts and the user is asked which version to keep; neither version is silently overwritten.

### Edge Cases

- A second Start workday action occurs while a workday is already active; it must not create a second simultaneous active workday or overlapping local intervals.
- The phone is offline or the activity list has not yet been synced; the user can still track and use Unassigned.
- A check-in is delayed, missed, or denied by notification settings; the current interval remains intact and is reviewable in the app.
- The app is closed or restarted during a workday; the locally saved active workday and timeline remain available, and tracking resumes without losing recorded time.
- The user ends a workday while a break or activity interval is active; the open interval closes and no later reminder is sent for that workday.
- The Mac endpoint is off, unreachable on the local network, or no longer at the saved address during a sync attempt; phone records remain unchanged and retryable.
- A sync is retried after a timeout or partial exchange; stable entry identity prevents duplicate records and does not silently discard edits.
- The same interval is edited independently on the phone and desktop before either update is received; both versions remain available and the user resolves the conflict rather than one edit being silently overwritten.
- Two devices have exact duplicate intervals, same-activity overlaps, or different-activity overlaps; different-activity overlaps and competing edits require a user conflict decision, and no shared time is counted twice.
- A user edits or splits an interval that participates in an unresolved conflict; the conflict remains visible until the overlapping time is resolved.
- An interval crosses midnight or the device's local time zone changes; its recorded time remains consistent and is displayed in the user's local time zone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user manually start and end a workday, with no more than one active workday at a time.
- **FR-002**: The system MUST let the user select an activity from the most recently synced desktop activity list, and MUST offer Unassigned when the desired activity is unavailable.
- **FR-003**: The system MUST record activity changes as consecutive intervals, closing the prior interval and starting the new one at the transition without losing elapsed time.
- **FR-004**: The system MUST record breaks as distinct non-working intervals and exclude them from tracked work time.
- **FR-005**: The system MUST store the timeline on the phone so workday tracking and review remain available offline and after an app restart.
- **FR-006**: The system MUST let the user edit, split, and assign an interval to Unassigned.
- **FR-007**: The system MUST retain a missed check-in's interval and mark it Unconfirmed until the user reviews it; missing a check-in MUST NOT stop tracking or remove time.
- **FR-008**: During a manually active workday, the system MUST schedule best-effort check-in notifications at approximately hourly intervals, send none outside an active workday, and stop scheduling them when the workday ends.
- **FR-009**: The system MUST clearly request notification permission and provide in-app check-in or timeline review when notifications are denied or delayed.
- **FR-010**: The system MUST provide a Same activity notification action and a quick flow that lets the user change activity, record a break, or end the workday.
- **FR-011**: The system MUST provide a Sync action in Android and let the user enter the Mac's IP address and listening port once; the app MUST save and reuse that endpoint for later syncs without asking again, and MUST NOT require QR pairing for the MVP.
- **FR-012**: The system MUST let the user manually initiate sync from Android; sync can complete only while the saved Mac endpoint is running and reachable, and a failed attempt MUST preserve all phone data and allow retry.
- **FR-013**: The system MUST synchronize all phone and desktop time entries and the desktop activity list, incrementally exchanging new and edited records; each entry MUST retain a stable identity, source device, and update information so retries do not create duplicate records.
- **FR-014**: The system MUST prevent exact duplicate entries and overlapping entries for the same activity from counting the same minutes more than once, while keeping their source records identifiable.
- **FR-015**: The system MUST show overlaps for different activities in a Review conflicts list, keep unresolved conflicts visible, and prevent their shared time from being double-counted.
- **FR-016**: The system MUST show competing edits to the same synced entry in Review conflicts and ask the user which version to keep; for overlap conflicts, the user can keep either device's entry, split or edit the interval, or assign it to Unassigned. The system MUST preserve the original versions and enough resolution history to undo the choice.
- **FR-017**: The system MUST exchange time data only during sync initiated by the user in Android with the saved Mac endpoint over a trusted private network; the desktop MUST NOT initiate sync, and the system MUST NOT upload that data to a cloud service or exchange it with another device.
- **FR-018**: Each time interval MUST retain a stable ID, activity ID or Unassigned status, start and end timestamps, source device, confirmation state, and update information needed for sync; timestamps MUST be shown in the user's local time zone.
- **FR-019**: By default, lock-screen check-in text MUST NOT include activity or project names.
- **FR-020**: The system MUST NOT use location, app or website usage, keyboard or mouse activity, or meeting detection to infer the user's work.

### Key Entities *(include if feature involves data)*

- **Workday**: A user-started period of tracking with a start and optional end time; at most one can be active at a time.
- **Time Interval**: A bounded activity or break interval with stable identity, activity or Unassigned value, timestamps, source device, confirmation state, and sync update information.
- **Activity**: A named work category supplied by the desktop activity list and available for selection on the phone after sync.
- **Saved Desktop Endpoint**: The Mac's IP address and listening port entered once in Android and reused for later syncs.
- **Sync Record**: The incremental exchange state for entry and activity changes, allowing safe retry without duplicate records.
- **Conflict and Resolution**: An overlap between device records or competing edits to one synced entry requiring user choice, plus the selected result and history needed to preserve original versions and support undo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of offline test workdays, a user can start tracking, change activities, record a break, end the workday, and find the complete timeline after restarting the app.
- **SC-002**: In 100% of missed-check-in tests, the interval remains present and Unconfirmed; in 100% of end-of-workday tests, no later check-in is sent for that workday.
- **SC-003**: In usability tests, at least 90% of users confirm a check-in with one action and complete a change, break, or end action in no more than three actions after opening its quick flow.
- **SC-004**: Across 10 repeated-sync test cycles, each new or edited entry is represented once, same-activity overlaps do not inflate totals, and sync failure leaves every phone entry available for retry.
- **SC-005**: In 100% of different-activity overlap tests, unresolved shared time is not double-counted; in 100% of overlap and concurrent-edit conflict tests, the conflict is visible before resolution, original versions are preserved, and the resolution can be undone.
- **SC-006**: In 100% of privacy tests, time data is exchanged only during Android-initiated sync with the saved Mac endpoint, is never uploaded to a cloud service, and default lock-screen reminders omit activity and project names.
- **SC-007**: In 100% of sync usability tests on the assumed private, secure network, the user can sync without configuring additional security options beyond the saved Mac address and port.

## Assumptions

- The MVP is for one person using one primary Android phone and the existing desktop tracker; accounts, teams, cloud sync, and iOS are out of scope.
- A workday begins only when the user explicitly starts it. The phone does not infer work, inactivity, breaks, location, or activity from device usage.
- The activity list available offline is the most recently synced desktop list; Unassigned is the fallback until a later review.
- Hourly reminders are approximate and best-effort; operating-system notification delivery may be delayed, and exact-to-the-hour delivery is not required.
- Sync requires the phone and Mac to be available on a trusted private network; the user initiates it from Android using the saved Mac IP address and port, and there is no remote desktop notification dependency. The MVP uses no TLS or other additional transport encryption; users must not use sync on public or otherwise untrusted networks.
- A Mac-side sync endpoint is a dependency; failed or unavailable sync never prevents phone-only tracking.
- The narrow authorization for this feature is recorded in `.specify/memory/constitution.md` v1.1.0, under “004 Android Time-Tracking Amendment Record.” It documents the sole maintainer's direction, rationale, and backwards-compatibility assessment for manual IP/port setup, full-data sync, a trusted private network, and no TLS; no separate external approval document is claimed. This specification does not itself amend the constitution.
- Time intervals represent consistent points in time and are displayed in the user's local time zone; a break is not counted as work time.
