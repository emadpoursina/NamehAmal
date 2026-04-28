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

## Common tasks

### Prisma Studio

```bash
bunx prisma studio
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

