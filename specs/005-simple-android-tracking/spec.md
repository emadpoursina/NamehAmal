# Feature Specification: Simplified Android Tracking

**Feature Branch**: `android-time-tracking`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: Simplify Android time tracking: allow manual sessions with a title, start, and end; start recording with a title and start time; restart a prior activity; delete a session; save server connection information; remove split actions and Today/Timeline views; and show events newest first.

## Clarifications

### Session 2026-09-27

- Q: Should the simplified Android app retire the existing workday, break, and hourly check-in flows, leaving direct session entry/start-stop and the event list as the tracking workflow? → A: Retire workday, break, and check-in flows.
- Q: After an event has synced to the desktop, should removing it on Android also remove it from the desktop at the next sync, or only from Android? → A: Android is temporary storage: manual sync sends events to the desktop and marks successful sends as synced; users may then remove synced events locally, and that removal never deletes desktop records.
- Q: Should manual completed sessions support dates in the past, or be limited to today's date? → A: Allow past dates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an Activity Simply (Priority: P1)

As a person tracking my own work, I want to enter a completed activity with its title and start/end date-times or start recording one with a title and start time, so that I can track time directly without workday, break, or check-in workflows.

**Why this priority**: Creating a manual or running session is the core value of the Android app.

**Independent Test**: Create one completed session with a title and start/end date-times, including a past date, then create and stop a running session with a title and start time; verify each appears as one event with the expected times.

**Acceptance Scenarios**:

1. **Given** no session is being recorded, **When** the user enters a title, start date/time, and end date/time and saves, **Then** one completed event is created with those details.
2. **Given** no session is being recorded, **When** the user enters a title and start time and chooses Start, **Then** a running event appears and its elapsed time advances.
3. **Given** a session is running, **When** the user chooses Stop, **Then** the event ends at that time and remains in the event list as a completed session.
4. **Given** a required title or time is missing, or the end is not later than the start, **When** the user tries to save, **Then** the app explains what must be corrected and does not save an invalid session.
5. **Given** a session is already running, **When** the user tries to start another one, **Then** the app keeps the existing session active and explains that it must be stopped first.
6. **Given** the entered start time is in the future, **When** the user starts recording, **Then** the app explains that a future start cannot begin recording and does not create a running session.
7. **Given** the user wants to record a completed activity from an earlier date, **When** the user enters its title and past start/end date-times, **Then** the completed event is saved and appears in the all-events list in chronological order.
8. **Given** the user opens Android tracking, **When** the user creates or starts an event, **Then** the app does not present workday start/end, break-tracking, or check-in reminder flows.

---

### User Story 2 - Restart a Previous Activity and Review Events (Priority: P2)

As a person who often repeats activities, I want to start a previous activity again and see all recorded events newest first, so that I can resume familiar work quickly and find recent records without switching between day views.

**Why this priority**: Reusing a previous title avoids repetitive entry, and a single chronological list makes the app easier to navigate.

**Independent Test**: Record activities on different dates, start one again from the prior-activity list, and verify that a new event is created and all events appear in descending start-time order.

**Acceptance Scenarios**:

1. **Given** at least one saved activity title, **When** the user chooses Start again for that title, **Then** a new running event is created with that title and the prior event remains unchanged.
2. **Given** events from multiple dates, **When** the user opens the app, **Then** one event list shows all events from newest start time to oldest, without a Today or Timeline view.
3. **Given** the app is closed and reopened, **When** the user views events, **Then** saved events remain present in newest-to-oldest order and any running session remains available to stop.

---

### User Story 3 - Remove Unwanted Sessions (Priority: P2)

As a person correcting my records, I want to remove an unwanted session or clear sessions already synced from Android, so that Android keeps only the local records I still need.

**Why this priority**: A simple, reliable way to correct an unwanted event is essential to maintaining useful records.

**Independent Test**: Remove one event from a list containing several events, then clear synced events after a successful sync; verify the local removals persist after reopening and desktop records remain unchanged.

**Acceptance Scenarios**:

1. **Given** a saved event, **When** the user chooses Remove and confirms, **Then** that event is removed from the list and remains removed after the app is reopened.
2. **Given** the user begins removing an event, **When** the user cancels confirmation, **Then** the event and its details remain unchanged.
3. **Given** a running event, **When** the user chooses Remove and confirms, **Then** recording stops and that event is removed; canceling leaves it running.
4. **Given** one or more events are marked as synced, **When** the user chooses Clear synced events and confirms, **Then** those events are removed from Android only and their desktop copies remain.

---

### User Story 4 - Save Server Connection Information (Priority: P3)

As a person connecting the Android app to my existing server, I want to enter and save the server address and port in settings, so that I do not need to re-enter them for later user-initiated connections.

**Why this priority**: Saved connection details make the existing device connection convenient without making network setup part of everyday tracking.

**Independent Test**: Enter a server address and port, save the settings, close and reopen the app, and verify that the values remain available; manually sync a local event and verify it is marked synced, then remove it locally and verify the desktop copy remains.

**Acceptance Scenarios**:

1. **Given** the user opens connection settings, **When** the user enters a valid server address and port and saves, **Then** the settings are retained for later use.
2. **Given** saved connection settings, **When** the user reopens settings or starts the existing manual connection/sync action, **Then** the saved values are available without re-entry.
3. **Given** the address or port is invalid, **When** the user saves, **Then** the app identifies the invalid value and does not replace valid saved settings.
4. **Given** the server cannot be reached, **When** the user tries to connect, **Then** the app reports the failure while keeping locally saved sessions available.
5. **Given** a local event is successfully sent during a user-initiated sync, **When** that sync completes, **Then** the event is marked as synced on Android.
6. **Given** a synced event is removed or cleared from Android, **When** a later sync occurs, **Then** the removal is not sent as a deletion and the desktop copy is not removed.

### Edge Cases

- A title is blank or contains only whitespace; the session cannot be saved or started.
- A session end time is equal to or earlier than its start time; the app explains the problem and leaves the event list unchanged.
- A running session is active when the user attempts to start another session; the current session is not silently ended or replaced.
- The app is closed while a session is running; reopening the app shows the same running session with its elapsed time based on its start time.
- The user cancels session removal; no session data is changed.
- The saved server is unavailable or the connection settings are malformed; local session entry and review remain usable.
- Events have the same start time; their relative order remains stable when the list is refreshed.
- A running session is removed; it stops only after the user confirms removal.
- A start time is in the future; recording does not begin at an invalid future time.
- A server port is missing, non-numeric, or outside the allowed port range; the app rejects it without discarding previously saved settings.
- A manual completed session is entered for an earlier date; it is saved if its end is later than its start.
- A sync is interrupted; only events successfully sent are marked as synced, and events not successfully sent remain available on Android.
- A synced event is removed or cleared from Android; its desktop copy remains, and the local removal is not propagated as a desktop deletion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Android app MUST provide a manual session form with an activity title, start date/time, and end date/time, including dates in the past.
- **FR-002**: The Android app MUST let the user start a running session by providing an activity title and start time.
- **FR-003**: The Android app MUST let the user stop a running session and record its end time.
- **FR-004**: The Android app MUST validate required titles and times, reject a session whose end is not later than its start, and reject a running-session start time later than the current time.
- **FR-005**: The Android app MUST permit no more than one running session at a time and MUST NOT silently replace or stop a running session when another start is requested.
- **FR-006**: The Android app MUST retain a running session across app closure and reopening so the user can continue to see and stop it.
- **FR-007**: The Android app MUST let the user start a new session using the title of a previously recorded activity without changing the prior event.
- **FR-008**: The Android app MUST show all events in one list ordered by start time from newest to oldest, including events from earlier dates; events with the same start time MUST retain a stable relative order when refreshed.
- **FR-009**: The Android app MUST NOT require or present separate Today or Timeline views as the way to browse events.
- **FR-010**: The Android app MUST let the user remove a selected session, including a running one, request confirmation before removal, stop a running session only after removal is confirmed, and leave the event unchanged if removal is canceled. Removal is local to Android and MUST NOT request deletion of the corresponding desktop record.
- **FR-011**: The Android app MUST NOT offer a split-session action or workflow.
- **FR-012**: The Android app MUST provide settings where the user can enter and save the server address and port used by the existing user-initiated connection or sync flow.
- **FR-013**: The Android app MUST accept a non-empty IP address or host name and a whole-number port from 1 through 65535, and MUST retain previously saved valid values if new settings are invalid.
- **FR-014**: Failure to connect to the server MUST NOT prevent the user from recording, reviewing, or removing locally available sessions.
- **FR-015**: Session times MUST be entered and displayed in the user's device-local time zone, consistently with the existing tracker.
- **FR-016**: During user-initiated sync, the Android app MUST send local events to the configured desktop and mark an event as synced only after it has been successfully sent.
- **FR-017**: The Android app MUST let the user clear successfully synced events from Android local storage after confirmation. This action MUST NOT remove desktop records or be sent as a deletion; events not successfully synced remain available on Android.
- **FR-018**: The Android app MUST NOT present workday start/end, break-tracking, or check-in reminder flows; tracking MUST use direct session entry and start/stop actions.

### Key Entities *(include if feature involves data)*

- **Session**: A recorded activity with a title, start time, and end time when completed; an ongoing session has a start time and no end time until stopped. Android also tracks whether the event has been successfully sent to the desktop.
- **Activity Title**: The user-entered label for a session, which can be reused to start another session.
- **Server Connection Settings**: The saved server address and port used for a user-initiated connection or sync.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 90% of users in usability tests can create either a completed session or a running session without assistance on their first attempt.
- **SC-002**: In 100% of repeat-activity tests, starting a prior activity creates a new event while leaving its previous event unchanged.
- **SC-003**: In 100% of event-list tests, events from multiple dates appear newest first, and no separate Today or Timeline view is needed to browse them.
- **SC-004**: In 100% of removal tests, confirming removes only the selected session from Android, leaves its desktop copy unchanged, and canceling preserves the local session.
- **SC-005**: In 100% of settings persistence tests, valid server details remain available after reopening the app, and failed connections do not make local sessions unavailable.
- **SC-006**: In 100% of post-sync cleanup tests, successfully synced events can be cleared from Android while their desktop records remain; events not successfully synced remain available locally.

## Assumptions

- The feature is limited to the Android app; desktop and web workflows are not changed by this specification.
- Session titles are free text. Previously used titles are available for starting another session.
- The user's explicit Start action begins recording immediately using the entered start timestamp; a future timestamp does not schedule an automatic start.
- Only one session can be actively recorded at a time. A running session remains visible after app closure and can be stopped when the user returns.
- The event list is the main Android screen. It shows all dates together; the user does not need separate Today or Timeline screens, a split workflow, workday flow, break flow, check-in reminders, or day-based navigation to track and review sessions.
- Server settings use an address and port for user-initiated sync. Android sends events to the desktop and marks successfully sent events as synced; users may clear synced events from Android afterward. Clearing events is local and does not delete desktop records. This feature does not add automatic or cloud synchronization.
- Session times follow the device's local time zone, consistent with the existing tracker.
