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

## Dashboard filters

The Dashboard lives at `/` and stores filters in the URL so they are shareable and refresh-safe:

- `date=YYYY-MM-DD`: the day to show (defaults to today)
- `categoryId=<id>`: optional category filter

These filters are translated into `/api/sessions` query params:

- `occurredFrom` = selected day at `00:00:00.000` (local time, sent as ISO)
- `occurredTo` = selected day at `23:59:59.999` (local time, sent as ISO)

### Categories

- **List**: `GET /api/categories` (default: non-archived)
  - `includeArchived=1` to include archived
- **Create**: `POST /api/categories`

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

Example:

```bash
curl -sS "http://localhost:3000/api/sessions?limit=20" | jq

curl -sS -X POST "http://localhost:3000/api/sessions" \
  -H "content-type: application/json" \
  -d '{
    "kind":"MANUAL",
    "title":"Reading",
    "categoryId":"<category-id>",
    "occurredAt":"2026-01-01T12:00:00.000Z",
    "durationSeconds":1500
  }' | jq

curl -sS -X PATCH "http://localhost:3000/api/sessions/<session-id>" \
  -H "content-type: application/json" \
  -d '{"title":"Updated title","durationSeconds":1800}' | jq

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

