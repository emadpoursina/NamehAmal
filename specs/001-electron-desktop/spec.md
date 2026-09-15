# Feature Specification: Electron Desktop App

**Feature Branch**: `001-electron-desktop`

**Created**: 2026-09-13

**Status**: Ready for planning

**Input**: User description: "Convert the existing local-first Next.js + Prisma + SQLite web app into a distributable macOS desktop application using Electron while preserving existing functionality. Electron is good; go with that."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install and open the desktop app (Priority: P1)

As a personal user, I want to install and open NamehAmal as a normal macOS application so I can track time without starting a development server, opening a terminal, or configuring a browser.

**Why this priority**: The desktop application is only useful if the conversion removes the setup and hosting work required by the web version.

**Independent Test**: Install the supplied macOS package on a clean supported Mac, open NamehAmal from the Applications folder, and confirm that the dashboard is usable without separate runtime or browser setup.

**Acceptance Scenarios**:

1. **Given** a clean supported macOS user account, **when** the user installs and opens the supplied application package, **then** NamehAmal opens to the dashboard without requiring a terminal command, a browser tab, or a separate local service.
2. **Given** the application has been closed, **when** the user opens it again, **then** the same application opens and the previously saved local data remains available.
3. **Given** the user has no internet connection, **when** the user creates or reviews local time-tracking data, **then** the core application remains usable.

---

### User Story 2 - Continue daily time tracking (Priority: P1)

As an existing user, I want the desktop version to retain the dashboard workflows so I can add manual sessions, run live timers, and review the day with the same low-friction experience.

**Why this priority**: Daily tracking is the primary value of NamehAmal and must not regress during the packaging change.

**Independent Test**: On a fresh desktop profile, create a manual session, start and stop a live timer, close and reopen the app, and verify both finalized sessions in the dashboard.

**Acceptance Scenarios**:

1. **Given** at least one active category, **when** the user adds a manual session with an optional title, activity preset, start and end times, date, and timezone, **then** the session is saved and appears in the selected day’s session list with the correct duration.
2. **Given** at least one active category, **when** the user starts a live timer with an optional title, activity preset, timezone, and optional backdated start time, **then** the running elapsed time is visible and only one live timer can run at a time.
3. **Given** a live timer is running, **when** the user stops it, **then** it becomes a finalized session with the elapsed duration and appears in the session list.
4. **Given** a live timer is running, **when** the user closes and reopens the application, **then** the timer state is recovered and the user can stop it without losing the recorded start time.
5. **Given** a finalized session in the list, **when** the user edits, deletes, or chooses “Record again,” **then** the selected action affects the intended session and does not alter unrelated sessions.

---

### User Story 3 - Organize and review recorded time (Priority: P1)

As a personal user, I want to filter, organize, and inspect my records so I can quickly understand what I did on a particular day or across a period of time.

**Why this priority**: Reliable review and organization are essential to trust the recorded data.

**Independent Test**: Create sessions in multiple categories and dates, then use the dashboard, category settings, and statistics views to verify the expected records and totals.

**Acceptance Scenarios**:

1. **Given sessions on different dates and categories,** when the user selects a day or category filter on the dashboard, **then** only matching finalized sessions are shown and the user can move between adjacent days.
2. **Given sessions in a selected range,** when the user opens Stats and chooses today, yesterday, this week, last week, a custom range, or a category, **then** totals and category percentages reflect the selected range.
3. **Given a complete Monday-through-Sunday week and configured weekly targets,** when the user opens Stats, **then** the app compares tracked time with each configured category target.
4. **Given a category with existing sessions,** when the user archives it, **then** it is hidden from new-entry choices while its historical sessions remain visible.
5. **Given a category with no sessions,** when the user deletes it, **then** it is removed; categories with sessions cannot be hard-deleted.
6. **Given saved activity presets,** when the user searches for, creates, edits, archives, restores, or reorders a preset, **then** the preset list and future session forms reflect the change.

---

### User Story 4 - Protect and move local data (Priority: P2)

As a personal user, I want to back up and restore my records so I can protect my local history or move it to another installation.

**Why this priority**: A local-only application must give the user a clear way to protect data without relying on cloud synchronization.

**Independent Test**: Export a populated profile, import it into a separate empty profile, and compare categories, activity targets, and sessions.

**Acceptance Scenarios**:

1. **Given** saved categories, activity presets, settings, and sessions, **when** the user exports data, **then** the application downloads a versioned JSON backup containing the supported local records.
2. **Given** a valid backup file, **when** the user imports it, **then** missing categories and sessions are added, matching categories are merged by name, included weekly targets are updated, and the result reports created records and warnings.
3. **Given** an invalid, unreadable, or unsupported file, **when** the user attempts an import, **then** the app explains the error and leaves existing local data unchanged.

---

### User Story 5 - Use the built-in focus timer (Priority: P2)

As a personal user, I want the Pomodoro page to remain available in the desktop app so I can use focus and rest cycles alongside time tracking.

**Why this priority**: Pomodoro is an existing workflow and should remain available even though it is separate from recorded work sessions.

**Independent Test**: Open Pomodoro, start and stop or skip a phase, change the focus and rest settings, and reopen the app to verify the saved settings.

**Acceptance Scenarios**:

1. **Given** the Pomodoro page is open, **when** the user starts, stops, or skips a phase, **then** the countdown and phase label update correctly.
2. **Given** valid focus, short-rest, long-rest, and interval values, **when** the user saves Pomodoro settings, **then** the new settings apply to subsequent phases.
3. **Given** the application is closed and reopened, **when** the user returns to Pomodoro, **then** the saved Pomodoro settings and supported timer state are available.

### Edge Cases

- On first launch, the app has no categories or local records; it must show a usable empty state and guide the user to create a category before adding time.
- The user starts the app while a timer is already active, or attempts to start a second timer; the existing timer remains authoritative and the app explains why another timer cannot start.
- The app is quit, suspended, or restarted while a live timer is running; reopening must not create duplicate finalized sessions or discard the active timer.
- A user enters an invalid timezone, malformed time, future start time, negative duration, or end time before start; the app rejects the input with a clear message and does not save a partial record.
- Day boundaries and daylight-saving transitions must use the configured timezone consistently for dashboard dates, session display, and statistics.
- The local data file is unavailable, locked, unreadable, or cannot be written; the app must show an actionable error and must not claim that unsaved changes succeeded.
- An archived category is referenced by historical data or an imported session; history remains readable and the category is not silently replaced.
- An import contains duplicate sessions or partial records; the app follows the existing merge behavior, reports warnings, and does not silently overwrite unrelated data.
- The user closes the app window while a save, import, or export is in progress; the app must either finish safely or report that the operation did not complete.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST be delivered as an installable macOS desktop application that opens from the Applications folder without requiring the user to run a terminal command, start a separate web server, or open a separate browser.
- **FR-002**: The system MUST provide access to the existing Dashboard, Stats, Settings, and Pomodoro areas from the desktop application.
- **FR-003**: The system MUST keep the user’s supported time-tracking data on the local Mac and MUST NOT require an account, cloud synchronization, or an internet connection for core workflows.
- **FR-004**: The system MUST preserve manual session creation with an optional title, activity preset, category, date, start time, end time, and timezone.
- **FR-005**: The system MUST preserve live tracking with start, stop, elapsed-time display, optional title and activity preset, category, timezone, and optional backdated start time that cannot be in the future.
- **FR-006**: The system MUST allow no more than one live timer at a time, MUST recover an active timer after an application restart, and MUST create one finalized session when that timer is stopped.
- **FR-007**: The system MUST show finalized sessions in the dashboard with date, time, title, category, kind, and duration, and MUST support day navigation, category filtering, editing, deletion, and recording again.
- **FR-008**: The system MUST preserve category management, including creation, color, ordering, archiving, restoring, weekly target hours, and hard deletion only when no session references the category.
- **FR-009**: The system MUST preserve activity preset management, including creation, search and prefill, editing, ordering, archiving, and restoring, without changing existing session history.
- **FR-010**: The system MUST preserve the configurable default timezone and per-session timezone behavior, including correct local-date filtering and display across daylight-saving transitions.
- **FR-011**: The system MUST preserve Stats range presets, custom date ranges, category filtering, category totals, percentages, and weekly goal comparisons for complete Monday-through-Sunday weeks.
- **FR-012**: The system MUST preserve versioned JSON export and merge import, including category-name matching, weekly-target updates when present, session creation, warning reporting, and safe rejection of invalid files.
- **FR-013**: The system MUST preserve Pomodoro start, stop, skip, phase transitions, configurable focus and rest lengths, long-rest interval, and supported local persistence of its settings and state.
- **FR-014**: The system MUST keep existing local records available when the desktop application is opened for an existing installation, or provide a documented, lossless path using the existing export and import workflow when direct reuse is not possible.
- **FR-015**: The system MUST display a clear, actionable error when local storage cannot be read or written, and MUST not report a failed save, import, or export as successful.
- **FR-016**: The system MUST provide a distributable macOS package suitable for installation on supported current macOS systems, with the supported CPU architectures and installation prerequisites documented.

### Key Entities

- **Desktop Application**: The installed NamehAmal application that provides the existing time-tracking and focus workflows in a macOS window.
- **Local Workspace**: The user’s on-device application data, including settings, categories, activity presets, sessions, active timers, and Pomodoro preferences.
- **Session**: A finalized manual or live-tracked block of time with its title, category, timestamps, duration, and timezone.
- **Active Timer**: The single in-progress live-tracking record that becomes a finalized session when stopped.
- **Category**: A named, ordered, optionally colored grouping for sessions, with archive state and optional weekly target.
- **Activity Preset**: A reusable title and category selection with optional default duration and presentation settings for faster session entry.
- **App Settings**: User-wide preferences such as the default timezone.
- **Pomodoro State**: The current focus/rest phase, countdown state, completed focus count, and user-selected cycle settings.
- **Backup File**: A versioned JSON representation of supported local records used for export and import.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean supported Mac, a user can install and open the application and reach a usable dashboard in under 2 minutes without opening a terminal or browser.
- **SC-002**: All existing primary workflows—manual entry, live tracking, dashboard review, stats, category and activity management, JSON backup/restore, timezone settings, and Pomodoro—pass their acceptance scenarios on the packaged application.
- **SC-003**: After closing and reopening the application 10 times, 100% of previously saved test records remain available and an active timer is neither duplicated nor lost.
- **SC-004**: With network access disabled, a test user can complete manual entry, live tracking, dashboard filtering, stats review, settings changes, export, and Pomodoro actions without a network-related failure.
- **SC-005**: A backup containing at least 1,000 sessions can be exported and imported into an empty profile with all valid records accounted for and any rejected records reported to the user.
- **SC-006**: At least 90% of first-time test users can install the app, create a category, and save a first session without assistance.
- **SC-007**: No critical or high-severity data-loss issue is found during packaged-app testing across fresh launch, restart during an active timer, failed import, and local-storage error scenarios.

## Assumptions

- The first release targets supported current macOS versions only; Windows, Linux, mobile, multi-user accounts, authentication, and cloud sync are out of scope.
- Electron is the approved desktop delivery approach; implementation details such as process boundaries, packaging tools, signing, and release automation belong in the implementation plan rather than this user-facing specification.
- The application remains single-user and local-first. Network access may be used for development or future optional features, but is not a dependency for the core product.
- Existing SQLite-backed records are the source of truth. The conversion must preserve them where practical; the existing versioned JSON export/import flow is the fallback for moving records between installations.
- The current JSON import behavior, including possible duplicate sessions when the same file is imported more than once, remains unchanged unless a separate deduplication feature is approved.
- The supplied distribution package will document supported macOS versions, CPU architectures, installation steps, data location or migration behavior, and any signing requirements.
- Automatic updates, cloud backup, cross-device synchronization, and new tracking or analytics features are not part of this conversion.
