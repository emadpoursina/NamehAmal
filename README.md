# NamehAmal

Minimal, local-first time tracking app built with **Next.js (App Router)**, **TypeScript**, **Prisma**, and **SQLite**.

## Prerequisites

- Node.js **LTS**
- A single package manager (recommend **pnpm**)

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

## Setup

Install dependencies:

```bash
pnpm install
```

Add Prisma + SQLite (first time only):

```bash
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init --datasource-provider sqlite
```

Generate Prisma client (and run migrations once you have a schema):

```bash
npx prisma generate
npx prisma migrate dev
```

## Run the app

```bash
pnpm dev
```

Open `http://localhost:3000`.

