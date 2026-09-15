# Data Model: Electron Desktop Delivery

## Existing persisted entities

The desktop conversion does not add a second application data store. Prisma
SQLite remains the source of truth, with the current schema and migration
history under `prisma/`.

### Category

- `id`: stable Prisma cuid identifier.
- `name`: required unique display name.
- `color`: optional display color.
- `sortOrder`: ordered position in forms and reports.
- `isArchived`: hides the category from new entries while retaining history.
- `weeklyTargetHours`: optional non-negative Monday-through-Sunday target.
- `createdAt`, `updatedAt`: record timestamps.
- Relationships: referenced by `Session`, `ActiveTimer`, and `Activity`.

Validation and behavior remain those implemented by the category API:
archiving is allowed, deletion is rejected when sessions reference the
category, and names remain unique.

### Activity preset

- `id`: stable Prisma cuid identifier.
- `title`: required unique preset title.
- `categoryId`: required category reference.
- `defaultDurationSeconds`: optional non-negative prefill duration.
- `color`: optional display color.
- `sortOrder`: ordered position.
- `isPinned`: whether the preset is prioritized.
- `isArchived`: whether it is hidden from active selection.
- `createdAt`, `updatedAt`: record timestamps.

Editing a preset changes future prefill behavior only; existing sessions keep
their stored values.

### Session

- `id`: stable Prisma cuid identifier.
- `kind`: `MANUAL` or finalized `TIMER`.
- `title`, `note`: optional user-entered text.
- `categoryId`: required category reference.
- `occurredAt`: canonical timestamp for day and range filtering.
- `startedAt`, `endedAt`: optional interval timestamps; finalized timers have
  both values.
- `durationSeconds`: positive stored duration.
- `timeZone`: IANA timezone captured for the session.
- `timeZoneOffsetMinutes`: offset at `occurredAt` for DST/audit context.
- `createdAt`, `updatedAt`: record timestamps.

Manual entry may calculate `occurredAt` and duration from a start/end range.
The existing API rejects invalid dates, invalid timezones, non-positive
durations, and an end before the start.

### Active timer

- `id`: stable identifier returned to the tracker UI.
- `categoryId`: required category reference.
- `title`: optional title.
- `timeZone`: IANA timezone captured for the running timer.
- `startedAt`: authoritative start timestamp.
- `timeZoneOffsetMinutes`: offset at start.
- `createdAt`, `updatedAt`: record timestamps.

There is at most one active draft by application behavior. Stopping it uses a
transaction to create exactly one finalized `Session` and delete the draft.
The legacy open `TIMER` session fallback remains readable for compatibility
with older local databases.

### App settings

- Singleton `id`: always `singleton`.
- `timeZone`: default IANA timezone for new entries and date-range filters.
- `createdAt`, `updatedAt`: record timestamps.

The desktop runtime supplies only the database location; it does not replace
this setting with the Mac system timezone.

### Pomodoro state

Pomodoro settings and the current run remain renderer-local data under the
existing `localStorage` keys:

- `nameh-amal:pomodoro:settings`
- `nameh-amal:pomodoro:run`

The Electron window always uses the fixed loopback origin
`http://127.0.0.1:3060`, so the renderer's persistent origin remains stable
between launches. The run snapshot keeps phase, remaining seconds,
running/paused state, completed focus count, and phase end timestamp. The
desktop backup JSON does not include these browser-local keys; desktop
settings/state are preserved within the desktop profile.

## Desktop runtime state

These values are runtime configuration, not Prisma entities:

- `userDataDirectory`: Electron's per-user writable directory.
- `databasePath`: `<userDataDirectory>/nameh-amal.db`.
- `databaseUrl`: `file:<databasePath>` passed only to the child server and
  migration process.
- `serverPort`: fixed `3060` to preserve the renderer origin.
- `serverHost`: `127.0.0.1`, never `0.0.0.0` in the packaged app.
- `migrationDirectory`: packaged copy of `prisma/migrations`.
- `standaloneDirectory`: packaged Next standalone server and static assets.

## Migration and compatibility rules

1. On first launch, create the user-data directory and let
   `prisma migrate deploy` create the SQLite database.
2. On later launches, apply only pending repository migrations; never reset,
   push, or recreate the database.
3. Do not copy a database into the installed `.app`; user data stays outside
   the application bundle.
4. If migration or database access fails, stop startup and show the absolute
   database path plus a recovery action. Do not report the application as
   ready.
5. To move an existing web/development profile, export the versioned JSON from
   Settings, install/open the desktop app, and import the file. Categories
   merge by name, weekly targets update as currently implemented, and valid
   sessions are created with warnings preserved.
6. The existing duplicate-session behavior on repeated imports is retained;
   the desktop conversion does not introduce silent deduplication.
