# Research: Electron Desktop Delivery

## Decision: Host the existing Next standalone server from Electron

The packaged application will keep the current Next.js App Router pages and
Node.js route handlers. A compiled Electron main process will start the
standalone server as a child process, wait for a loopback health response, and
load `http://127.0.0.1:3060` in a `BrowserWindow`.

Rationale:

- `next.config.ts` already uses `output: "standalone"`, and the generated
  `server.js` is the supported self-hosting entry point.
- Existing server-side fetches already use `PORT` and `127.0.0.1` through
  `app/server/internal-base-url.ts`.
- A fixed loopback port keeps the renderer origin stable, so the current
  Pomodoro `localStorage` settings and run state survive application restarts.
- A loopback-only listener avoids exposing the local database API to the
  network.

Alternatives considered:

- Rewriting the UI as a native Electron renderer: rejected because it would
  duplicate all existing workflows and validation.
- Loading the Next app from a random port: rejected because the port is part of
  the browser origin and would reset the existing Pomodoro localStorage on every
  launch.
- Running Next inside the Electron main process: rejected because Next's
  standalone server is the existing supported runtime boundary and a child
  process gives explicit startup, crash, and shutdown control.

Sources:

- Next standalone output guidance:
  https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Repository configuration: `next.config.ts`, `app/server/internal-base-url.ts`,
  and `Dockerfile`.

## Decision: Store production data under Electron's user-data directory

The main process will derive the database path from
`app.getPath("userData")`, create the directory if necessary, and pass
`DATABASE_URL=file:<absolute path>` to the standalone server. Development keeps
the existing `.env`/`DATABASE_URL` behavior.

Rationale:

- The packaged application cannot write inside its installed application
  bundle.
- The user-data directory is stable across launches and updates and is the
  correct per-user location for SQLite.
- SQLite sidecar files (WAL, SHM, and journals) remain beside the database.

Alternatives considered:

- A database beside the `.app`: rejected because the application bundle is not
  a writable user-data location and updates could replace it.
- A remote database or cloud sync: rejected by the local-first constitution and
  feature scope.
- A new database format: rejected because the existing Prisma SQLite schema and
  migrations are the source of truth.

## Decision: Apply Prisma migrations before starting Next

The desktop startup sequence will run `prisma migrate deploy` against the
user-data database before starting the standalone server. The packaged runtime
will include the migration folders, schema/config, Prisma CLI/runtime files,
and native/query/schema engines outside the ASAR where execution requires it.
The startup code will report migration failures with the database path and
backup/recovery guidance, then stop rather than opening an app that could
silently lose writes.

Rationale:

- Prisma documents `migrate deploy` as the production command that creates the
  SQLite file and applies pending migrations without resetting data.
- The repository already has ordered migrations for session timezone data,
  weekly targets, activity presets, and active timer drafts.
- Running migrations before accepting requests prevents the Next process from
  observing a partially upgraded schema.

Alternatives considered:

- `prisma db push`: rejected because it does not preserve the repository's
  migration history and is unsafe as an upgrade contract.
- A hand-written migration table/SQL runner: rejected because it would
  duplicate Prisma's migration semantics and add a second schema authority.
- Migrating only during packaging: rejected because each user's database can be
  at a different migration level.

Sources:

- Prisma deploy migrations:
  https://www.prisma.io/docs/cli/migrate/deploy
- Repository migrations: `prisma/migrations/`.

## Decision: Preserve browser workflows and use a narrow Electron boundary

The renderer will load only the local loopback origin with
`nodeIntegration: false`, `contextIsolation: true`, and sandboxing enabled.
No Node or filesystem API will be exposed to the page because the current
application can use HTTP routes, browser file selection, and normal downloads.
The main process will reject navigation to other origins and deny new windows.
If a future native capability is needed, it must be added as a single-purpose,
validated preload bridge rather than exposing `ipcRenderer` or Node globals.

Rationale:

- The current UI already uses `fetch`, `<input type="file">`, and download
  links; no native bridge is required for the first desktop release.
- Electron's security guidance recommends context isolation, sandboxing,
  disabled Node integration, and navigation restrictions.
- Keeping the database and migration work in the main/server boundary avoids
  giving renderer JavaScript direct filesystem access.

Sources:

- Electron security checklist:
  https://www.electronjs.org/docs/latest/tutorial/security
- Electron context isolation:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation

## Decision: Package DMG and ZIP for arm64 and x64

`electron-builder` will produce macOS DMG and ZIP artifacts for Apple Silicon
(`arm64`) and Intel (`x64`). The release documentation will describe supported
macOS versions, architecture-specific artifacts, unsigned/ad-hoc development
builds, Developer ID signing, hardened runtime, notarization, and verification
commands. Universal output can be added later if release size and build time
justify it.

Rationale:

- DMG is the normal drag-to-Applications installation path; ZIP is useful for
  direct distribution and CI smoke tests.
- Separate architecture artifacts are simpler to build and validate than a
  universal native-module bundle while covering both supported Mac CPU
  families.
- Signing and notarization are release concerns and require user-owned Apple
  credentials; they must not be faked or committed.

Alternatives considered:

- Mac App Store (`mas`): rejected because the feature is an independent
  distributable desktop application, not a sandboxed App Store submission.
- Universal-only packaging: deferred until native SQLite and Prisma engine
  behavior is proven for both architectures.
- Unsigned release artifacts: acceptable only for local development; rejected
  as the documented distribution path because Gatekeeper will warn or block
  them.

Sources:

- electron-builder macOS targets and signing:
  https://www.electron.build/docs/mac/

## Decision: Validate packaged behavior, not only source tests

The existing Vitest and lint/build checks remain required. New desktop checks
will cover deterministic path/environment construction, server readiness and
shutdown, migration failure handling, renderer navigation restrictions, and a
packaged-app smoke flow. The manual release checklist will exercise clean
install, restart persistence, active-timer recovery, offline workflows,
export/import, and a 1,000-session backup.

Rationale:

- Electron packaging can fail even when the Next development server works,
  especially for native `.node` files, Prisma engines, ASAR paths, and
  writable storage.
- Acceptance scenarios explicitly include restart, offline operation, failed
  import, and storage errors; each needs an executable or manual check.

Known compatibility boundary:

- The existing SQLite records are migrated directly when the desktop database
  is already in the Electron user-data location.
- A pre-existing web/development database can be moved losslessly through the
  current versioned JSON export/import workflow. Existing browser-only
  Pomodoro localStorage is not part of that JSON contract; desktop Pomodoro
  settings persist after they are configured in the desktop profile.
