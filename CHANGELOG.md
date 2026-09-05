# Changelog

## [0.1.5] - 2026-09-05
### Fixed
- Cleared all remaining repository lint errors and warnings.

## [0.1.4] - 2026-09-05
### Fixed
- Pomodoro now waits for browser persistence to hydrate before rendering timer controls, preventing stale idle controls in a new tab.

## [0.1.3] - 2026-09-05
### Fixed
- Pomodoro timers now continue across refreshes and new tabs using their saved phase end time.

## [0.1.2] - 2026-09-05
### Added
- Cursor Cloud Agent development environment config (`.cursor/environment.json`): npm-based install, Prisma generate + migrate, and a dev-server terminal on port 3060.

## [0.1.1] - 2026-09-03
### Changed
- Pomodoro now plays the Mixkit game-success alert instead of a generated beep when a phase ends.

## [0.1.0] - 2026-04-28
### Added
- Initial project version tracked in package.json
