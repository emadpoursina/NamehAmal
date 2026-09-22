# Feature Specification: Sync Pomodoro Timers

**Feature Branch**: `sync-timers`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "sync them together"

## Clarifications

### Session 2026-09-22

- Q: When a pomodoro is already running and the user presses start in either view, what should happen? → A: The menu bar and the in-app page are the same timer shown in two places: start/pause/stop in either surface applies to the shared clock and the other surface must reflect it. Sync does not have to be live/real-time — it takes effect on refresh or when the user returns to a view (e.g., tab switch); a menu-bar refresh button is acceptable. A focus-time change made in the app followed by start applies to the menu bar too.
- Q: When the pomodoro page loads in desktop mode before the desktop host is ready, should the page wait or fall back? → A: Wait — the page stays idle/placeholder until the desktop host connects; it never starts a local engine in desktop mode.
- Q: Should browser-mode settings and desktop-mode settings stay independent or converge on desktop launch? → A: Independent — the browser-local settings store and the desktop settings store never merge.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One Shared Clock Across Menu Bar and App (Priority: P1)

As a desktop user, I want the menu-bar pomodoro timer and the in-app pomodoro page to show and control the same single pomodoro clock, so that starting, pausing, resuming, or stopping a session in either place applies to that one clock and is reflected in the other (sync may be eventual — applied on refresh or when a view is revisited) and no two timers can ever disagree or run in parallel.

**Why this priority**: Today the two timers can drift apart or even run simultaneously, which produces wrong countdowns, missed activity names, and contradictory state. A single shared clock is the foundation; settings sync (Story 2) and web-mode behavior (Story 3) build on it.

**Independent Test**: Start a pomodoro from the menu bar, then open the app's pomodoro page and verify it shows the identical remaining time and activity; then stop it from the app page and verify the menu bar reverts to idle (after refresh, if the menu bar requires one).

**Acceptance Scenarios**:

1. **Given** the desktop app is running, **When** the user starts a pomodoro from the menu bar, **Then** the in-app pomodoro page shows the same running countdown (same remaining time, same phase, same activity label) once it loads/refreshes or is revisited.
2. **Given** a pomodoro is running and was started from the menu bar, **When** the user pauses or stops it from the in-app page, **Then** the menu-bar countdown pauses or reverts to idle accordingly (live, or on menu-bar refresh), with no divergence.
3. **Given** a pomodoro is running and was started from the in-app page, **When** the user pauses or stops it from the menu bar, **Then** the in-app page shows the same paused/idle state once it loads/refreshes or is revisited.
4. **Given** a pomodoro is running under the shared clock, **When** it reaches zero and advances to a break (or completes), **Then** both the menu bar and the in-app page show the same new phase and countdown (live while a view is visible; otherwise on its next refresh/revisit).
5. **Given** the user starts a pomodoro in one place while another would be running, **When** they press start, **Then** there is only ever one active pomodoro clock — the action applies to the shared clock rather than starting a second, independent timer.

---

### User Story 2 - Shared Pomodoro Settings (Priority: P2)

As a desktop user, I want my pomodoro settings (durations, auto-start preferences, and similar options) to be the same whether I view or edit them from the menu bar or the in-app page, so that I never have to configure the timer twice and both views always honor the same configuration.

**Why this priority**: Inconsistent settings would silently reintroduce divergence even with a shared clock (e.g., menu bar counts down 25 minutes while the app page expects 50). Settings sync keeps the single clock meaningful.

**Independent Test**: Change the focus duration from the in-app settings, then inspect the menu-bar pomodoro controls and verify they use the new duration for the next session; repeat in the reverse direction.

**Acceptance Scenarios**:

1. **Given** the desktop app is running, **When** the user changes any pomodoro setting in the in-app page, **Then** the menu-bar pomodoro reflects the same settings for subsequent sessions.
2. **Given** the desktop app is running, **When** the user changes a pomodoro setting via the menu bar (where such a control exists), **Then** the in-app settings view shows the same value.
3. **Given** a pomodoro countdown is currently in progress, **When** the user changes a duration setting, **Then** the in-progress countdown continues to its originally displayed end (it is not cut short or reset mid-count), and the new setting takes effect for the next phase or next session.
4. **Given** the user changes settings, **When** they quit and relaunch the app, **Then** the same settings are still in effect in both places (settings persist across restarts).

---

### User Story 3 - Consistent Behavior Without the Desktop Host (Priority: P3)

As a user running the app in a plain browser (without the desktop host), I want the pomodoro page to behave the same way it does on desktop — one clock, one set of settings, persisted across reloads — so that the experience is predictable regardless of how the app is opened.

**Why this priority**: The web-only mode must not regress, but it cannot sync with a menu bar that does not exist there. It is a consistency guarantee rather than the core sync feature.

**Independent Test**: Open the app in a plain browser, run a pomodoro, reload the page, and verify the timer and settings resume/remain from persisted state with no menu-bar dependency.

**Acceptance Scenarios**:

1. **Given** the app is open in a plain browser (no desktop host available), **When** the user starts a pomodoro, **Then** a single timer runs and is visible on the pomodoro page.
2. **Given** a pomodoro is running in a plain browser, **When** the user reloads the page, **Then** the timer state (running countdown or idle) and settings are restored from persisted state.
3. **Given** settings were changed in a plain browser, **When** the app is later opened in desktop mode, **Then** the desktop mode uses its own settings store: the browser-local settings and desktop settings remain independent and the two stores are never merged or silently conflated.

---

### Edge Cases

- What happens when the in-app page is open on two views (or the app window is reopened) mid-session? Both must show the same shared clock; no second engine may start.
- What happens when the desktop host is unavailable while the pomodoro page believes it is in desktop mode (e.g., host not yet ready at page load)? The page must wait for or fall back to the host rather than silently starting its own competing clock.
- What happens if a stored clock state is missing or corrupted at startup? The app must fall back to an idle pomodoro with default/last-valid settings rather than crashing or showing a nonsensical countdown.
- What happens when the system sleeps and wakes mid-countdown? The shared clock must recompute the remaining time from wall-clock elapsed time so both views show a truthful countdown after wake.
- What happens when a settings change arrives while the user is simultaneously editing settings in both places? Last change wins, and both views converge to the same final values.
- What happens when a phase completes while the app window is closed (menu-bar-only mode)? The shared clock still advances, records the transition, and the in-app page shows the correct phase when reopened.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain exactly one authoritative pomodoro clock per running app instance, shared by the menu-bar presence and the in-app pomodoro page.
- **FR-002**: The system MUST reflect any clock transition (start, pause, resume, stop, phase completion) initiated in either view in the other view, treating both surfaces as the same timer; synchronization may be eventual rather than real-time — convergence occurs when the other view refreshes or is revisited (e.g., via a menu-bar refresh control) — but must never leave the two surfaces acting on different clocks.
- **FR-003**: The system MUST prevent a second, independent pomodoro countdown from starting while the shared clock is running; start actions in any view apply to the shared clock.
- **FR-004**: The system MUST use a single pomodoro settings store shared by both views within each mode: the desktop store shared by the menu bar and the in-app page in desktop mode, and a single browser-local store in plain-browser mode. The two stores are independent and MUST NOT be merged or converged.
- **FR-005**: The system MUST persist pomodoro settings across app restarts.
- **FR-006**: The system MUST persist the clock's run state (so an in-progress or most-recent session survives a window close, app window reopen, and page reload in web mode).
- **FR-007**: The system MUST NOT apply a changed duration setting to a countdown already in progress; the in-progress phase continues to its original end, and the new setting applies from the next phase or session.
- **FR-008**: The system MUST recompute countdowns after system sleep/wake using elapsed real time, so remaining time shown in both views is truthful.
- **FR-009**: The system MUST handle an absent or not-yet-ready desktop host gracefully: in desktop mode the pomodoro page stays idle/placeholder until the host connects and MUST NOT start a local engine in desktop mode; only in plain-browser mode does the page run its own single standalone clock with persisted state.
- **FR-010**: The system MUST fall back to an idle pomodoro with valid settings when stored clock state is missing or unreadable, rather than failing.
- **FR-011**: The system MUST keep phase advancement (focus → break → focus, per current settings) working identically regardless of which view initiated the session, including when the app window is closed.
- **FR-012**: The system MUST keep the activity label (the recorded activity name shown next to the countdown) consistent between the menu bar and the in-app page for the shared session.

### Key Entities *(include if feature involves data)*

- **Shared Pomodoro Clock**: The single running pomodoro state — phase (focus/break), remaining time or target end time, running/paused/idle status, and the associated activity label. Owned by one component per app instance and observed by both views.
- **Pomodoro Settings**: One shared configuration — focus duration, break duration(s), long-break behavior, auto-start preferences, and similar options. Single source of truth for both views; persisted.
- **Persisted Clock/Settings Store**: The durable location where clock run state and settings are saved so both views and app restarts see the same data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Starting, pausing, resuming, or stopping a pomodoro in either the menu bar or the in-app page always applies to the same single timer, and the other view converges on refresh/revisit in 100% of manual test runs (eventual synchronization is sufficient; live propagation is not required).
- **SC-002**: At no point during a test session can two pomodoro countdowns with different remaining times be observed simultaneously between the menu bar and the in-app page (0 divergent-clock occurrences across a scripted 30-minute scenario).
- **SC-003**: A settings change made in one view is reflected in the other view's next-session behavior 100% of the time, without requiring the user to change it twice.
- **SC-004**: After an app restart, both views restore the same persisted settings and the same idle/most-recent clock state (verified on 3 consecutive restart cycles).
- **SC-005**: A mid-session settings change never shortens or resets the current countdown (verified by observing the original target end time is honored in every trial).
- **SC-006**: In plain-browser mode, a page reload restores the correct timer state and settings in 100% of trials, with no dependency on a desktop host.

## Assumptions

- The desktop host remains the authoritative owner of the shared clock when it is present (it already persists state to the user data directory); the in-app page becomes a view and controller of that clock rather than an independent engine.
- When no desktop host exists (plain browser), the pomodoro page continues to run its own single clock with persisted browser-local state; the "sync" requirement applies between menu bar and app only in desktop mode, while the settings semantics (single store per environment) apply in both modes.
- Settings changed mid-countdown apply from the next phase or next session, matching current behavior where an in-progress countdown is not altered until the timer is idle; no mid-phase re-targeting is introduced.
- Synchronization between the menu bar and the in-app page is eventual rather than real-time: convergence happens when a view refreshes or is revisited (e.g., after a tab switch), and a menu-bar refresh button is an acceptable mechanism.
- Existing pomodoro phase semantics (focus/break sequence, reminders, activity labeling from the current tracker session) are unchanged by this feature; only clock and settings unification is in scope.
- Browser-mode and desktop-mode settings stores remain permanently independent; no migration, merge, or convergence between them occurs on desktop launch or at any other time.
