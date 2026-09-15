# Implementation Plan: Electron Desktop App

**Branch**: `001-electron-desktop` | **Date**: 2026-09-13
**Spec**: `specs/001-electron-desktop/spec.md`

## Summary

Convert the existing Next.js local-first application into a macOS desktop
application by packaging its existing standalone Next server inside an
Electron host. Electron will own the application window and child-server
lifecycle; the Next server will continue to own pages, route handlers, Prisma
queries, validation, and the current JSON import/export behavior. A fixed
loopback origin (`127.0.0.1:3060`) preserves browser-local Pomodoro state,
while Prisma migrations and the SQLite database move to Electron's stable
per-user data directory. `electron-builder` will produce architecture-specific
DMG and ZIP artifacts with documented signing and notarization steps.

## Technical Context

**Language/Version**: TypeScript 6.0.3; Node.js 24 LTS runtime; Electron
version pinned to the current supported stable release during implementation.

**Primary Dependencies**: Next.js 16.2.4 standalone output, React 19.2.4,
Prisma 7.8.0, `@prisma/adapter-better-sqlite3`, `better-sqlite3`,
Electron, and `electron-builder`. Avoid adding a desktop UI framework or
native bridge dependency.

**Storage**: Existing Prisma SQLite schema and migrations. Development keeps
`DATABASE_URL`; packaged builds use
`<Electron userData>/nameh-amal.db`. Pomodoro settings/run remain in
renderer-local storage at the stable loopback origin.

**Testing**: Existing Vitest tests, ESLint, and Next production build, plus
Electron runtime unit tests, migration/server lifecycle tests, packaged
directory smoke tests, and the manual macOS acceptance checklist in
`quickstart.md`.

**Target Platform**: Supported current macOS systems, with separate `arm64`
and `x64` DMG/ZIP artifacts. Windows and Linux are out of scope.

**Project Type**: Single-project web application with a macOS Electron
desktop host.

**Performance Goals**: Reach a usable Dashboard after install in under two
minutes; show the first window only after migrations and the local server
readiness check succeed; import/export a 1,000-session backup without data
loss; keep the existing one-second timer/Pomodoro update behavior.

**Constraints**: Offline core workflows; loopback-only server; no account,
cloud sync, or network dependency; writable per-user database outside the
app bundle; no renderer Node access; native SQLite and Prisma engines must
work from the packaged artifact; failures must be actionable and must not be
reported as successful saves.

**Scale/Scope**: One local user per app profile, the existing four primary
areas (Dashboard, Stats, Settings, Pomodoro), the current Prisma schema and
migration history, and one active live timer.

## Constitution Check

*GATE: Must pass before Phase 0 research and after Phase 1 design.*

- **I. Clear Project History — PASS.** The implementation will use
  Conventional Commits, update `CHANGELOG.md`, and keep `package.json` and
  release metadata aligned.
- **II. Reviewed Integration — PASS.** Work stays on
  `001-electron-desktop` and is intended for review before merging to
  `master`.
- **III. Local-First Data — PASS.** SQLite remains the source of truth; the
  server binds only to loopback; no authentication, cloud sync, or remote
  database is introduced.
- **IV. Safe Configuration — PASS.** Apple signing/notarization credentials
  remain in the local keychain or release environment. No secrets or
  certificate files are committed.
- **V. Documented Data Models — PASS.** The plan does not require a Prisma
  schema change. If a later implementation task changes a field, it must add
  the required `///` field comment and migration.

**Post-design gate:** PASS. The design artifacts preserve the existing data
model and API contracts, define the packaged runtime boundary, and document
the only compatibility fallback (versioned JSON export/import).

## Project Structure

### Documentation

```text
specs/001-electron-desktop/
├── spec.md
├── checklists/requirements.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── desktop-runtime.md
    └── http-api.md
```

### Source and build changes

```text
electron/
├── main.ts                    # single instance, window, lifecycle, errors
├── server-process.ts          # migrations, Next child process, readiness/shutdown
└── runtime-config.ts          # user-data, database, fixed loopback paths

scripts/
├── desktop-dev.mjs            # build/launch Electron with local Next dev server
└── prepare-desktop-runtime.mjs # stage standalone server and static assets

tests/electron/
├── runtime-config.test.ts
├── server-process.test.ts
└── packaged-app.test.ts

build/
└── entitlements.mac.plist

docs/
└── desktop-macos.md           # install, data location, migration, signing

electron-builder.yml           # DMG/ZIP targets and packaged resources
tsconfig.electron.json         # emitted main-process TypeScript
package.json                   # scripts, Electron/build dependencies, metadata
README.md                      # desktop development and user-facing setup
CHANGELOG.md                   # delivered version entry
```

**Structure Decision**: Keep the existing `app/` pages and `app/api/` route
handlers unchanged as the product surface. Add only a small `electron/`
process layer, build scripts, packaging configuration, focused tests, and
documentation. The server-process module is separate because child-process
startup/shutdown and migration failures need deterministic tests without
opening a window.

## Implementation Phases

### Phase 0: Runtime foundation

1. Add pinned Electron and `electron-builder` dependencies and an emitted
   Electron TypeScript build (`tsconfig.electron.json`).
2. Add the runtime config module for the fixed port, loopback host,
   per-user database path, packaged resource paths, and test-only profile
   override.
3. Add the server-process module that runs migrations before starting
   `.next/standalone/server.js`, polls `/api/settings`, captures child logs,
   and shuts the child down safely.
4. Add `main.ts` for the single-instance lock, macOS reactivation, window
   lifecycle, actionable startup failures, and bounded shutdown.

### Phase 1: Package the existing server

1. Add the desktop build script to run the existing Next production build,
   copy `public/` and `.next/static/` into the standalone runtime, compile the
   Electron process, and fail if `server.js` or required native files are
   missing.
2. Configure `electron-builder` with an explicit app id, DMG/ZIP targets for
   `arm64` and `x64`, architecture-labelled artifacts, ASAR/native-module
   handling, and packaged Prisma schema/migrations/engines.
3. Make the Prisma CLI/runtime available to the packaged migration step
   rather than leaving it only in development dependencies.
4. Add the macOS entitlements file and release documentation for unsigned,
   ad-hoc, signed, and notarized builds.

### Phase 2: Compatibility and failure behavior

1. Verify production database URL construction, migration ordering, existing
   SQLite sidecars, and repeated launches against the same profile.
2. Preserve the current API behavior and JSON backup contract; document
   export/import as the lossless path from an existing web/development
   profile.
3. Add actionable storage, migration, port-conflict, server-crash, and
   readiness-timeout errors without converting failures into success states.
4. Add close/shutdown handling so imports remain transactional and an
   in-progress operation either completes or is reported incomplete.

### Phase 3: Verification and release readiness

1. Run source checks and focused Electron unit tests.
2. Build an unpacked packaged app and run a clean-profile smoke test,
   including native SQLite loading and Prisma migration.
3. Run the full acceptance sequence in `quickstart.md`, including ten
   restarts, active-timer recovery, offline workflows, failed imports, DST
   boundaries, and the 1,000-session backup.
4. Validate architecture-specific artifacts and, when credentials are
   available, verify signing and notarization with `codesign`, `spctl`, and
   `xcrun stapler`.

## Execution Sequence and Parallelism

The implementation phase should execute these atomic work packages with fresh
isolated worker contexts. The registered ordinary route is
`generalPurpose` / `cursor-grok-4.6-medium` / Medium effort.

| ID | Work package | Depends on | Executor |
| --- | --- | --- | --- |
| E0 | Add Electron TypeScript/build scripts and runtime config | — | generalPurpose / cursor-grok-4.6-medium / Medium |
| E1 | Implement migration, Next child-server readiness, and shutdown | E0 | generalPurpose / cursor-grok-4.6-medium / Medium |
| E2 | Implement secure BrowserWindow and app lifecycle | E0, E1 | generalPurpose / cursor-grok-4.6-medium / Medium |
| E3 | Add standalone staging, electron-builder resources, native/Prisma packaging | E0 | generalPurpose / cursor-grok-4.6-medium / Medium |
| E4 | Add storage compatibility, close/error handling, and user documentation | E1, E2 | generalPurpose / cursor-grok-4.6-medium / Medium |
| E5 | Add unit, packaged smoke, and acceptance verification | E1, E2, E3, E4 | generalPurpose / cursor-grok-4.6-medium / Medium |

`E0` and the packaging configuration portion of `E3` can proceed in parallel.
`E1` must precede `E2`; `E1` and `E2` can proceed alongside the independent
packaging work. `E5` is the final gate and must use the exact packaged
artifact, not only the development server.

## Risks and Mitigations

- **ASAR/native engine loading:** stage Prisma engines and
  `better-sqlite3` outside ASAR or mark them for unpacking; fail the package
  smoke test if the native module cannot load.
- **Port collision:** use only the fixed loopback port and reject readiness if
  the port belongs to another process; never attach to an unrelated server.
- **Data migration failure:** migrate before server startup and show the
  absolute path plus backup guidance; never reset or `db push`.
- **Renderer compromise:** disable Node integration, enable isolation and
  sandboxing, restrict navigation, and expose no filesystem/IPC bridge.
- **Existing profile discovery:** do not guess at arbitrary browser database
  paths; document versioned JSON export/import as the supported lossless
  transfer path.
- **Signing availability:** keep signing optional for local builds but make
  signed/notarized release prerequisites and verification explicit.

## Complexity Tracking

No constitution violations or unnecessary architectural layers are required.
The Electron host is an integration boundary mandated by the desktop delivery
requirement; the existing Next server, route handlers, Prisma schema, and UI
remain the single application implementation.
