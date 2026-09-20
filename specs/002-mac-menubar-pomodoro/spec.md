# Feature Specification: macOS Menu Bar Pomodoro

**Feature Branch**: `mac-menubar-pomodoro`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "1. We need a top menu bar for mac version. 2. when i close it, instead of quitting the app, remove its icon from Dock but keep it available from top menu bar. 3. on the top menu bar, I should be able to see status of the pomodoro clock with a timer running when there is an active pomodoro clock. 4. Next to the pomodoro timer, just write the name of the activity that is being recorded or a simple 'x' icon if nothing is being recorded. 5. on click on the top menu bar there should be options for controlling the pomodoro on the select box that opens + open app option + quit app option. 6. every 5 minute check and if no pomodoro timer is being run, show an alert and remind me to start a pomodoro timer."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Menu Bar Presence & Persistence (Priority: P1)

As a macOS user of the desktop app, I want the app to live in the top menu bar, so that the pomodoro tracker is always reachable without keeping a window (and a Dock icon) on screen.

**Why this priority**: The menu bar presence is the foundation every other capability depends on. Without it, none of the timer display, controls, or reminders can exist.

**Independent Test**: Launch the app on macOS, close the main window, and verify the app remains running and reachable from the menu bar with no Dock icon.

**Acceptance Scenarios**:

1. **Given** the app is running on macOS, **When** the app launches, **Then** an item (icon/label) appears in the top menu bar.
2. **Given** the main app window is open, **When** the user closes the window, **Then** the app does NOT quit, the Dock icon disappears, and the app remains available via the top menu bar.
3. **Given** the window is closed and the app lives only in the menu bar, **When** the user selects "Open App" from the menu bar, **Then** the main app window reopens and behaves normally.
4. **Given** the window is closed, **When** the user selects "Quit App" from the menu bar, **Then** the app exits completely, the menu bar item disappears, and any running pomodoro is stopped.

---

### User Story 2 - Live Timer Status in the Menu Bar (Priority: P2)

As a macOS user, I want the menu bar to show the live state of the pomodoro clock, so that I can track my focus session at a glance without opening the app.

**Why this priority**: Real-time visibility is the core value of a menu bar pomodoro; it keeps the user informed without context switching.

**Independent Test**: Start a pomodoro in the app and verify the menu bar shows a running countdown; stop it and verify the display changes accordingly.

**Acceptance Scenarios**:

1. **Given** no pomodoro timer is running, **When** the user looks at the menu bar, **Then** the item shows an "x" icon next to (or instead of) any timer text, with no countdown.
2. **Given** a pomodoro timer is running with a recorded activity, **When** the user looks at the menu bar, **Then** the item shows the running countdown in MM:SS format plus the name of the activity being recorded.
3. **Given** a pomodoro timer is running, **When** the timer advances, **Then** the menu bar display updates every second (the MM:SS countdown ticks visibly) without opening the app window.
4. **Given** a pomodoro timer finishes (reaches zero) or is stopped, **When** that happens, **Then** the menu bar item reverts to the idle display ("x" icon, no countdown).

---

### User Story 3 - Pomodoro Controls from the Menu Bar (Priority: P3)

As a macOS user, I want to control the pomodoro directly from the menu bar dropdown, so that I can start, pause, or stop a session without switching to the app window.

**Why this priority**: Convenient controls complete the menu bar experience, but the same actions are already possible inside the app window, so this is an enhancement rather than a foundation.

**Independent Test**: Click the menu bar item and verify the dropdown contains pomodoro control actions plus "Open App" and "Quit App", and that each control affects the running timer.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the user clicks the menu bar item, **Then** a dropdown menu opens containing pomodoro control options and, separately, "Open App" and "Quit App" options.
2. **Given** no timer is running, **When** the user selects the start pomodoro option in the dropdown, **Then** a pomodoro timer begins and the menu bar status (Story 2) reflects it.
3. **Given** a timer is running, **When** the user selects pause/stop (and, where applicable, resume) options in the dropdown, **Then** the timer state changes accordingly and the menu bar display updates.
4. **Given** the menu bar dropdown offers pomodoro controls, **When** the user interacts with them, **Then** the state shown in the main app window stays consistent with the menu bar (no divergence between the two views).

---

### User Story 4 - Idle Reminders (Priority: P4)

As a macOS user, I want to be reminded to start a pomodoro timer when I have been idle from tracking, so that I do not lose focus habits during long untracked stretches.

**Why this priority**: The reminder is valuable but secondary; it only matters once the menu bar, timer display, and timer lifecycle exist.

**Independent Test**: Leave the app running with no pomodoro timer for more than 5 minutes and verify a reminder notification appears; start a timer and verify reminders stop.

**Acceptance Scenarios**:

1. **Given** the app is running on macOS, the idle reminder setting is on, and no pomodoro timer is active, **When** 5 minutes elapse since the last check (or last timer stop), **Then** the system shows a dismissible, non-blocking macOS notification banner reminding the user to start a pomodoro timer.
2. **Given** a reminder notification is shown, **When** the user starts a pomodoro timer (from the menu bar or app window), **Then** further reminders stop while the timer runs.
3. **Given** a pomodoro timer is actively running, **When** a 5-minute check fires, **Then** no reminder notification is shown. (A paused timer counts as idle for this purpose.)
4. **Given** the user dismisses a reminder without starting a timer, **When** another 5 minutes pass without an active timer, **Then** a new reminder is shown (reminders repeat every 5 minutes while idle).
5. **Given** the user has turned the idle reminder setting off, **When** any 5-minute check fires, **Then** no reminder notification is shown, regardless of timer state.

### Edge Cases

- What happens when the user closes the window while a pomodoro timer is running? The app must keep running in the menu bar and the timer must keep counting down (closing the window must not terminate tracking).
- What happens when the timer finishes while the window is closed? The menu bar should reflect the completed/idle state, and the session must still be recorded by the existing tracking lifecycle.
- What happens when the user quits via "Quit App" with a timer running? The app exits; the running timer is not preserved after relaunch (an abandoned in-progress timer is not finalized silently).
- What happens when two reminders are due while the user is away for a long time? Reminders repeat on the 5-minute cycle rather than stacking into multiple simultaneous notifications.
- What happens when the activity being recorded has no name or a very long name? The menu bar shows a sensible fallback and truncates overly long names so the menu bar item stays readable.
- What happens on non-macOS desktop platforms? The menu bar tray behavior is macOS-specific for this feature; the main app window behavior is unchanged elsewhere.
- What happens when the user pauses the timer? The countdown stops in the menu bar, and the paused state counts as idle for the reminder cycle — reminders resume after 5 idle minutes.
- What happens if the system blocks notifications? The app must not crash; the 5-minute check continues silently and reminders simply are not visible.

## Clarifications

### Session 2026-09-20

- Q: How should the idle reminder be delivered on macOS? → A: A macOS system notification banner — dismissible and non-blocking, never a modal dialog that interrupts the user.
- Q: How often should the menu bar countdown update? → A: Every second — the MM:SS remaining time ticks visibly each second.
- Q: Should the menu bar dropdown include an activity picker for starting a pomodoro? → A: No — the menu bar is only for controlling the pomodoro (start/pause/stop/resume plus Open App and Quit App). The activity is display-only text in the menu bar; activities are selected only inside the app window.
- Q: When a pomodoro timer is paused, does it count as running or idle for the 5-minute reminder check? → A: A paused timer counts as idle; the 5-minute idle cycle resumes (reminders return after 5 idle minutes).
- Q: Can the user turn the idle reminders off? → A: Yes — a simple on/off setting for idle reminders is provided; when off, no reminders are shown.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a menu bar item in the macOS top menu bar whenever the desktop app is running.
- **FR-002**: System MUST, upon closing the main app window, keep the application running with its icon removed from the Dock while remaining accessible via the menu bar item.
- **FR-003**: System MUST allow the user to reopen the main app window from the menu bar ("Open App" option).
- **FR-004**: System MUST allow the user to fully quit the application from the menu bar ("Quit App" option), which removes the menu bar item and terminates all tracking.
- **FR-005**: System MUST display, in the menu bar item, the running pomodoro countdown in MM:SS format when a pomodoro timer is active, updating every second so the remaining time ticks visibly.
- **FR-006**: System MUST display, next to the running countdown, the name of the activity being recorded. The activity name in the menu bar is display-only; the menu bar MUST NOT offer activity selection or any activity picker/submenu.
- **FR-007**: System MUST display an "x" icon in the menu bar item, with no countdown, when no pomodoro timer is being recorded.
- **FR-008**: System MUST provide pomodoro control options (at minimum: start a pomodoro; pause/stop and resume where the underlying timer supports it) in the menu bar dropdown. The dropdown is strictly for pomodoro control plus "Open App" and "Quit App"; starting a pomodoro from the menu bar records the app's currently selected activity without offering a picker.
- **FR-009**: System MUST keep the menu bar timer state consistent with the timer state shown in the main app window at all times.
- **FR-010**: System MUST check every 5 minutes whether a pomodoro timer is running and, if none is, show a dismissible, non-blocking macOS system notification banner prompting the user to start a pomodoro timer. A paused timer counts as NOT running for this check.
- **FR-011**: System MUST stop the 5-minute reminder notifications while a pomodoro timer is actively running, and resume the cycle once no timer is running again (including when a timer is paused) — the first reminder in a new idle period appears 5 idle minutes after the idle state begins.
- **FR-012**: System MUST continue running the pomodoro countdown and the 5-minute idle check while the main window is closed (menu bar-only mode).
- **FR-013**: System MUST ensure that closing the main window never finalizes or discards an in-progress timer — the session lifecycle rules of the app (finalize on stop) remain intact.
- **FR-014**: System MUST provide a simple on/off setting for the idle reminders; when the setting is off, no reminder notifications are shown, and when on, reminders follow FR-010/FR-011.

### Key Entities *(include if feature involves data)*

- **Pomodoro Timer (existing active timer)**: The in-progress pomodoro draft, with a start time, duration, and the activity name it is recording; drives both the menu bar display and the main app display. Its running, paused, and stopped states determine reminder behavior (paused and stopped both count as idle for reminders).
- **Activity (existing recorded item)**: The named activity the running pomodoro is attributed to; its name is surfaced in the menu bar next to the countdown as display-only text (never selectable from the menu bar).
- **Reminder Cycle**: The repeating 5-minute check that triggers idle reminders only when no timer is active (a paused timer counts as idle) and the reminder setting is on; not persisted data, purely runtime behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of window-close events leave the app running in menu bar-only mode (no Dock icon, no app termination) on macOS.
- **SC-002**: A user can start, pause/stop, and resume a pomodoro entirely from the menu bar without ever opening the app window.
- **SC-003**: The menu bar countdown visibly updates every second while a pomodoro runs (MM:SS ticks each second), staying consistent with the in-app timer (no visible divergence at any point).
- **SC-004**: When no pomodoro has been running for 5 consecutive minutes (a paused timer counts as idle), a dismissible, non-blocking notification banner appears within 5 minutes of the idle state starting, and repeats every 5 minutes until a timer starts or the reminder setting is turned off.
- **SC-005**: Zero reminder notifications are shown during any period in which a pomodoro timer is actively running, and zero are shown when the reminder setting is off.
- **SC-006**: Quitting from the menu bar fully exits the app (process ends, menu bar item and Dock icon gone) with no orphaned background activity.

## Assumptions

- The "pomodoro clock" refers to the app's existing timer/tracking mechanism (start → run → stop → finalize into a recorded session); this feature surfaces and controls it from the menu bar rather than introducing a second, parallel timer engine.
- The menu bar timer text shows "MM:SS remaining" and ticks every second; activity names longer than a few characters are truncated for menu bar readability.
- The "x" icon requirement is interpreted as a static idle-state glyph shown when nothing is being recorded.
- The 5-minute idle check starts counting when the app launches, when a running timer stops, or when a running timer is paused (paused counts as idle), and repeats every 5 minutes while idle; it applies only while the desktop app is running on macOS.
- Reminder notifications are macOS system notification banners — dismissible and non-blocking (never modal dialogs); users who have disabled system notifications simply do not see reminders, and this is accepted behavior for v1.
- The menu bar item shows both a pomodoro-start control and generic controls; per the description, the dropdown contains pomodoro controls plus "Open App" and "Quit App". The menu bar is purely a control-and-display surface: the activity recorded by a menu-bar-started pomodoro is the app's currently selected activity, and activity selection happens only in the app window (no activity picker or submenu in the menu bar).
- Window-close behavior changes apply to the macOS desktop version only; web/self-hosted deployments are unaffected.
