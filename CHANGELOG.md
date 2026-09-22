# Changelog

## [0.2.8] - 2026-09-21
### Fixed
- Menu bar and in-app Pomodoro now stay in sync without waiting on tracker
  HTTP: start/stop state is pushed to every window and the tray immediately,
  while draft binding/finalization continues in the background.

### Added
- The in-app Pomodoro settings page mirrors the menu bar "Remind me to start a
  pomodoro" toggle (both directions), and the settings form re-syncs when
  settings change from another surface.

## [0.2.7] - 2026-09-20
### Added
- Added a macOS menu bar extra for the desktop app: live pomodoro countdown
  and activity name, Start/Resume/Stop plus Open App and Quit, hide-to-tray
  on window close (Dock icon hidden, app stays running), and a 5-minute idle
  reminder banner with a persisted on/off toggle. Tracker drafts bind only
  when Start comes from the menu bar.

## [0.2.6] - 2026-09-16
### Added
- Added activity check-in to the Pomodoro phase-complete popup: when a phase
  ends naturally, the app asks whether the currently recorded activity is
  still ongoing and offers to start or switch the tracked activity inline.
  Skip and Stop no longer trigger the popup.

## [0.2.5] - 2026-09-14
### Fixed
- Fixed packaged macOS startup by materializing Next.js traced native-module
  links inside the application instead of retaining project-machine paths.

## [0.2.4] - 2026-09-14
### Fixed
- Fixed packaged macOS startup migrations by including Prisma CLI's complete
  runtime dependency tree, including `effect`.

## [0.2.3] - 2026-09-14
### Fixed
- Fixed macOS packaging so the Prisma CLI and its runtime dependencies are included for startup migrations.

## [0.2.2] - 2026-09-13
### Added
- Added packaged-profile coverage for relaunch persistence, occupied-port
  rejection, active-timer recovery, date ranges, weekly targets, category and
  activity management, import merging, duplicate compatibility, and failure
  atomicity.
- Added close-during-import coverage to verify that interrupted operations
  leave either a complete backup or no partial session rows.
### Fixed
- Cancelled desktop server startup when shutdown begins during migration or
  readiness, preventing a closed app from launching a late child server.

## [0.2.1] - 2026-09-13
### Fixed
- Fixed deterministic native SQLite staging for Electron architecture builds.
- Fixed packaged-test child cleanup and final-window server shutdown.

## [0.2.0] - 2026-09-13
### Added
- Added the Electron macOS desktop host with a secure loopback BrowserWindow,
  single-instance behavior, and bounded Next server startup/shutdown.
- Added per-user SQLite storage, migration-before-startup, packaged standalone
  runtime staging, native SQLite rebuilding, and architecture-specific DMG/ZIP
  packaging configuration.
- Added runtime, lifecycle, packaged API, backup/import, timezone, timer, and
  large-backup tests plus macOS installation and recovery documentation.

## [0.1.7] - 2026-09-06
### Added
- Optional Pomodoro browser notifications for phase completions while the app
  is in another tab, with local persistence and click-to-focus behavior.

## [0.1.6] - 2026-09-06
### Added
- FIRE plan for Pomodoro background notifications: when a phase ends, the user
  can get a system notice even if they are in another tab.

## [0.1.5] - 2026-09-05
### Fixed
- Cleared all remaining repository lint errors and warnings.

## [0.1.4] - 2026-09-05
### Fixed
- Pomodoro now waits for browser persistence to hydrate before rendering timer
  controls, preventing stale idle controls in a new tab.

## [0.1.3] - 2026-09-05
### Fixed
- Pomodoro timers now continue across refreshes and new tabs using their saved
  phase end time.

## [0.1.2] - 2026-09-05
### Added
- Cursor Cloud Agent development environment config
  (`.cursor/environment.json`): npm-based install, Prisma generate + migrate,
  and a dev-server terminal on port 3060.

## [0.1.1] - 2026-09-03
### Changed
- Pomodoro now plays the Mixkit game-success alert instead of a generated beep
  when a phase ends.

## [0.1.0] - 2026-04-28
### Added
- Initial project version tracked in package.json
