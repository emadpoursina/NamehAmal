# NamehAmal

Minimal, local-first time tracking app built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **SQLite**.

## Prerequisites

- Bun (recommended) or Node.js (LTS)

## Environment variables

1. Create your local env file:

```bash
cp .env.example .env
```

2. Update `.env` as needed.

### `DATABASE_URL`

SQLite database file path used by Prisma.

Example:

```bash
DATABASE_URL="file:./dev.db"
```

## Setup (recommended: Bun)

Install dependencies:

```bash
bun install
```

Generate Prisma Client:

```bash
bunx prisma generate
```

Run migrations (creates/updates `dev.db`):

```bash
bunx prisma migrate dev
```

## Run the app

```bash
bun run dev
```

Open `http://localhost:3000`.

## Server-side CRUD (minimal)

This project exposes minimal server endpoints (create + list) for **categories** and **sessions**.

## Stats filters

The Stats page at `/stats` uses `from`, `to` (`YYYY-MM-DD` in your configured **default timezone**), and optional `categoryId`. If `from` / `to` are missing or invalid, the range defaults to the **current week** (Monday through Sunday) in the default timezone. A **Range** dropdown sets quick presets: **Today**, **Yesterday**, **This week**, **Last week**; otherwise use the date inputs for a custom range.

## Dashboard filters

The Dashboard lives at `/` and stores filters in the URL so they are shareable and refresh-safe:

- `date=YYYY-MM-DD`: the day to show (defaults to today)
- `categoryId=<id>`: optional category filter

Sessions in the table include a **Record again** action that starts a new live timer with the same category and title.

These filters are translated into `/api/sessions` query params:

- `occurredFrom` = selected day at `00:00:00.000` (default timezone, sent as ISO)
- `occurredTo` = selected day at `23:59:59.999` (default timezone, sent as ISO)

### Categories

- **List**: `GET /api/categories` (default: non-archived)
  - `includeArchived=1` to include archived
- **Create**: `POST /api/categories` (optional `weeklyTargetHours`: number ≥ 0 or `null`)
- **Update**: `PATCH /api/categories/:id` (optional `weeklyTargetHours` to set or clear weekly hour targets)

Example:

```bash
curl -sS "http://localhost:3000/api/categories" | jq

curl -sS -X POST "http://localhost:3000/api/categories" \
  -H "content-type: application/json" \
  -d '{"name":"Work","color":"#2563EB","sortOrder":1}' | jq
```

### Sessions

- **List**: `GET /api/sessions`
  - Optional filters: `categoryId`, `occurredFrom`, `occurredTo`, `limit`
- **Create**: `POST /api/sessions`
- **Update**: `PATCH /api/sessions/:id`
- **Delete**: `DELETE /api/sessions/:id`

Timezone notes:
- The app stores a per-session `timeZone` (IANA, e.g. `Asia/Yerevan`) and an optional `timeZoneOffsetMinutes` for audit/DST history.
- You can configure the **default timezone** in Settings; new sessions will use it unless you override the timezone in the session form/tracker.

Creating a **manual** session:
- **Create (POST)** or **update (PATCH)** with `startedAt` and `endedAt` (ISO timestamps): duration is derived and `occurredAt` is set to `startedAt`. For PATCH, send both fields together.
- Or send `occurredAt` and `durationSeconds` (legacy): no start/end times updated unless you also pass `startedAt` / `endedAt`.

Example:

```bash
curl -sS "http://localhost:3000/api/sessions?limit=20" | jq

curl -sS -X POST "http://localhost:3000/api/sessions" \
  -H "content-type: application/json" \
  -d '{
    "kind":"MANUAL",
    "title":"Reading",
    "categoryId":"<category-id>",
    "timeZone":"Asia/Yerevan",
    "startedAt":"2026-01-01T09:00:00.000Z",
    "endedAt":"2026-01-01T09:25:00.000Z"
  }' | jq

curl -sS -X PATCH "http://localhost:3000/api/sessions/<session-id>" \
  -H "content-type: application/json" \
  -d '{
    "title":"Updated title",
    "timeZone":"Asia/Yerevan",
    "startedAt":"2026-01-01T09:00:00.000Z",
    "endedAt":"2026-01-01T10:00:00.000Z"
  }' | jq

curl -sS -X DELETE "http://localhost:3000/api/sessions/<session-id>" | jq
```

## Common tasks

### Prisma Studio

```bash
bunx prisma studio
```

### Seed local database

```bash
bunx tsx prisma/seed.ts
```

### Reset local database

This project is local-first; your SQLite DB file is ignored by git (`*.db`).

```bash
rm -f dev.db
bunx prisma migrate dev
```

### Lint

```bash
bun run lint
```

## Notes

- Prisma Client is generated into `app/generated/prisma` (see `prisma/schema.prisma`).
- The DB is SQLite and fully local (no auth, no cloud sync by design).

