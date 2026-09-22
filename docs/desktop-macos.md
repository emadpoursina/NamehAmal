# NamehAmal for macOS

NamehAmal is distributed as a local-first Electron application. The desktop
app starts its bundled Next.js server on `127.0.0.1:3060`, then opens the
dashboard in its own window. No browser tab, terminal, account, or internet
connection is required for the core workflows.

## Supported builds

- Supported current macOS releases.
- `arm64` for Apple Silicon Macs.
- `x64` for Intel Macs.
- The `DMG` is the normal drag-to-Applications installer.
- The `ZIP` is available for direct extraction and smoke testing.

Local artifacts are unsigned unless the release environment provides Apple
Developer ID credentials. Unsigned or ad-hoc builds are for local testing and
may trigger a Gatekeeper warning.

## Install and run

1. Download the artifact matching the Mac's CPU architecture.
2. Open the DMG and drag `NamehAmal.app` to `Applications`.
3. Open NamehAmal from `Applications`.

On first launch, the app creates or upgrades the SQLite database before
showing the window. A failed migration stops startup and displays the database
path and recovery guidance.

## Local data and migration

The SQLite database is stored outside the application bundle:

```text
~/Library/Application Support/NamehAmal/nameh-amal.db
```

SQLite sidecar files remain beside it. Runtime logs are written to the
`logs/desktop-runtime.log` file in the same application-data directory.
Updates apply only pending repository migrations; they never reset or replace
the database.

To move an existing web or development profile:

1. Use Settings to export the versioned JSON backup.
2. Install and open the desktop app once.
3. Import the backup in the desktop app.
4. Confirm categories, weekly targets, and sessions.

The import keeps the existing merge and duplicate-session behavior. Browser
localStorage is not part of the backup, so Pomodoro settings and run state
must be configured in the desktop profile after migration. The fixed
`http://127.0.0.1:3060` origin keeps those renderer-local values stable across
desktop relaunches.

## Development and packaging

Prerequisites are Node.js 24 LTS, installed npm dependencies, and Xcode
Command Line Tools for the native SQLite module.

```bash
npm ci
npx prisma generate
npm run desktop:dev
```

Build local architecture-specific artifacts with:

```bash
npm run desktop:dist -- --mac --arm64
npm run desktop:dist -- --mac --x64
```

Artifacts are written to `release/` with the architecture in each filename.
`desktop:prepare` builds the Next standalone server and stages its static
assets, Prisma migrations, Prisma engines, and native SQLite module before
Electron Builder packages the app.

Local packaging disables automatic certificate selection, so these artifacts
are unsigned unless signing is explicitly enabled. A release environment with
Developer ID credentials can opt in with
`CSC_IDENTITY_AUTO_DISCOVERY=true` and its protected keychain/notarization
settings.

## Pomodoro (menu bar and in-app page)

The macOS menu-bar pomodoro and the in-app `/pomodoro` page show and control
the same single clock. The clock lives in the desktop main process and is
persisted to `userData/pomodoro.json`; the page is a view and controller over
that host clock — it never runs a second, independent countdown.

- On launch (or refresh), the page shows a neutral "Waiting for desktop
  host…" placeholder until the first host snapshot arrives; controls stay
  disabled and no default durations are fabricated. Once connected, the page
  mirrors the tray: same phase, remaining time, and activity label.
- Settings changed in either surface apply to both for the next phase or
  session. A change made mid-countdown never alters the countdown in progress.
- The desktop store (`userData/pomodoro.json`) and the plain-browser
  localStorage store stay fully independent; the two are never merged.

## Recovery messages

- **Local data directory unavailable**: check that the application-data
  directory is writable. Do not delete the database before making a backup.
- **Database migration failed**: keep a copy of `nameh-amal.db`, check the
  runtime log, and repair the file or permissions before restarting.
- **Port 3060 is already in use**: stop the other local service. NamehAmal
  will not connect to an unrelated process on that port.
- **Server did not become ready**: inspect the runtime log and retry after
  correcting the reported storage or migration problem.
- **Server stopped unexpectedly**: reopen the app after checking the runtime
  log. A stale dashboard is never presented as healthy.

Import validation and database writes remain transactional. An invalid or
interrupted import reports an error and does not claim success or partially
replace existing records.

## Signing and notarization

Release signing is intentionally external to the repository. A release
environment should provide Developer ID credentials through the local keychain
or its protected CI secret store. Do not commit certificates, private keys,
Apple API keys, or notarization passwords.

Verify a signed release with:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/NamehAmal.app"
spctl --assess --type execute --verbose=2 "release/mac-arm64/NamehAmal.app"
xcrun stapler validate "release/NamehAmal-arm64.dmg"
```
