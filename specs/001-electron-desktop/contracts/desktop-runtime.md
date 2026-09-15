# Desktop Runtime Contract

## Startup

1. Acquire the Electron single-instance lock. If another instance owns it,
   focus the existing window and exit the second process.
2. Resolve the per-user database path from `app.getPath("userData")`.
3. Ensure the directory exists and construct the SQLite
   `DATABASE_URL=file:<absolute path>`.
4. Run packaged Prisma migrations with `prisma migrate deploy`.
5. Start the packaged Next standalone `server.js` as a child process with:
   `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, `PORT=3060`, the database URL,
   and telemetry disabled.
6. Poll the loopback server until `GET /api/settings` succeeds or a bounded
   startup timeout expires.
7. Create a `BrowserWindow` and load only
   `http://127.0.0.1:3060/`.

The window must not be shown before steps 1–6 succeed. A failure must show an
actionable native error explaining whether the failure was database migration,
server startup, port conflict, or readiness timeout.

## Browser window security

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- No remote URLs or remote scripts.
- `will-navigate` allows only the exact loopback origin.
- `setWindowOpenHandler` denies new windows unless a future requirement adds a
  validated external-link action.
- No direct `fs`, `child_process`, `ipcRenderer`, or database bridge is exposed
  to renderer JavaScript.

The current application uses same-origin HTTP, browser file selection, and
browser downloads, so a privileged preload API is not required for the first
release.

## Shutdown

- On `before-quit`, stop accepting new lifecycle work and terminate the Next
  child process.
- Wait for a normal child exit for a short bounded period, then terminate it
  forcefully if necessary.
- Closing the final window must not leave a server process or SQLite handle
  running.
- A renderer operation in progress must either finish before the window closes
  or be reported as incomplete. Import writes remain transactionally atomic.

## Failure handling

- If the child server exits unexpectedly, surface a clear error and close or
  offer a controlled restart; never continue presenting a stale UI as healthy.
- If the database directory is unavailable, unreadable, locked, or unwritable,
  show its path and an actionable recovery message.
- If the fixed port is occupied, report the conflict and do not connect to an
  unrelated process.
- Log startup, migration, readiness, child exit, and shutdown failures to the
  user-data log directory without logging backup contents or secrets.

## Packaging contract

The packaged application must contain:

- Electron main-process output.
- Next standalone `server.js` and traced runtime dependencies.
- `public/` and `.next/static/` assets.
- Prisma schema/config and all migration folders.
- Native SQLite and Prisma engine files in a location executable outside ASAR
  when required by the target architecture.

The build must produce DMG and ZIP artifacts for `arm64` and `x64`, with
architecture included in artifact names. Signed/notarized builds use
Developer ID credentials supplied by the release environment; local builds may
be unsigned or ad-hoc and must be labeled as such.
