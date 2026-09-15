# Desktop Validation Quickstart

This guide validates the packaged macOS application without changing the
existing web workflow.

## Prerequisites

- Supported current macOS version.
- Node.js version used by the repository's production image (Node 24 LTS).
- npm dependencies installed.
- Xcode Command Line Tools for native `better-sqlite3` builds.
- Apple Developer credentials only for signed/notarized release validation.

Install dependencies and generate the Prisma client:

```bash
npm ci
npx prisma generate
```

## Source checks

Run the existing checks before packaging:

```bash
npm test
npm run lint
npm run build
```

Expected result: tests pass, lint reports no errors, and Next creates
`.next/standalone/server.js`.

## Development desktop launch

Start the Electron host and the local Next server:

```bash
npm run desktop:dev
```

Expected result: one NamehAmal window opens to the Dashboard without a
separate browser tab. The server is reachable only at
`http://127.0.0.1:3060`.

## Packaged build

Build a local architecture-specific macOS artifact:

```bash
npm run desktop:dist -- --mac --arm64
# or:
npm run desktop:dist -- --mac --x64
```

Expected result: `release/` contains a DMG and ZIP with the architecture in
their names. Use the unpacked directory build first when iterating on native
packaging and Prisma/SQLite loading.

## Clean-profile acceptance run

1. Create a temporary profile directory.
2. Open the packaged app using that profile.
3. Confirm the first-launch empty state is usable and create a category.
4. Add a manual session and confirm its duration and timezone.
5. Start a live timer, close the app, reopen it, and confirm the timer is
   still active exactly once.
6. Stop it and confirm one finalized session appears.
7. Edit, delete, and record again from the dashboard.
8. Create multiple categories and dates, then verify Dashboard filters and
   Stats presets, custom ranges, percentages, and weekly targets.
9. Archive a category and activity preset; confirm history remains readable and
   the archived records are absent from new-entry choices.
10. Change the default timezone and test a date boundary and a daylight-saving
    transition with a per-session timezone.
11. Configure Pomodoro settings, start/stop/skip phases, quit, reopen, and
    confirm the saved settings and supported run state return.
12. Export a populated profile, import it into a separate clean profile, and
    compare categories, targets, and sessions.
13. Try malformed, unsupported, and unreadable import files; confirm no
    existing data changes and the error is actionable.
14. Repeat the restart test ten times. Confirm no saved records are lost and
    the active timer is neither duplicated nor discarded.

Existing web/development profiles move through the versioned Settings export
and desktop Settings import flow. The backup includes supported SQLite-backed
records, but not browser-local Pomodoro keys; configure Pomodoro settings again
after importing into the desktop profile. Repeated imports retain the
existing duplicate-session behavior.

If the window closes during an import or export, reopen the app and verify the
result before retrying. Import writes are transactional: a failed validation
or database write must leave existing records unchanged and show an error
instead of a success message.

## Offline run

With the Mac disconnected from the internet, repeat manual entry, live
tracking, Dashboard filters, Stats, Settings, export, and Pomodoro steps.
Only loopback traffic should be required.

## Large backup check

Prepare a version 2 JSON backup with at least 1,000 valid sessions, import it
into an empty profile, and verify the reported created count matches the valid
records. Include at least one invalid record to verify the rejection/warning
path used by the import contract.

## Storage and migration failure checks

- Start with a fresh profile and verify migrations create the database.
- Start again with the same profile and verify no reset occurs.
- Make the database directory unavailable or read-only in a disposable test
  profile and confirm startup shows the path and recovery guidance instead of
  claiming success.
- Place another process on port 3060 and confirm the app reports a port
  conflict instead of loading an unrelated service.

## Signing verification

For a signed build, verify the app before distribution:

```bash
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/NamehAmal.app"
spctl --assess --type execute --verbose=2 "release/mac-arm64/NamehAmal.app"
xcrun stapler validate "release/NamehAmal-arm64.dmg"
```

Unsigned or ad-hoc artifacts are for local testing only. Do not commit
certificates, private keys, Apple API keys, or notarization passwords.
