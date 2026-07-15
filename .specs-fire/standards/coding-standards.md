# Coding Standards

## Overview

TypeScript-first Next.js App Router monolith. Server components and route handlers own data access; client components stay thin and UI-focused. All time/session logic is timezone-aware and local-first.

## Code Formatting

**Tool**: Prettier (via `eslint-config-next`)
**Config**: inherited from `eslint-config-next`
**Enforcement**: `bun run lint`

### Key Settings

- **Indentation**: 2 spaces
- **Semicolons**: required
- **Quotes**: double quotes
- **Trailing commas**: es5+

## Linting

**Tool**: ESLint 9 (flat config)
**Base Config**: `eslint-config-next`
**Strictness**: Next.js recommended + core-web-vitals

### Key Rules

- `@typescript-eslint/no-unused-vars`: warn — keep imports lean
- `react/no-unescaped-entities`: error — escape text content
- `@next/next/no-img-element`: warn — prefer `next/image`
- No `any` without justification — prefer explicit types

## Naming Conventions

### Variables and Functions

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `categoryId` |
| Functions | camelCase | `getSessionsForDay` |
| React components | PascalCase | `ActiveTimer` |
| Constants | camelCase or UPPER_SNAKE | `defaultTimezone` |
| Types/Interfaces | PascalCase | `SessionPayload` |
| API route params | camelCase | `occurredFrom` |
| DB fields | camelCase (Prisma) | `occurredAt`, `durationSeconds` |

### Files and Folders

- **Route handlers**: `app/api/<resource>/route.ts` (and `[id]/route.ts` for item routes)
- **Pages**: `app/<route>/page.tsx` (App Router file conventions)
- **Components**: `app/components/<Name>.tsx` (PascalCase filename)
- **Lib/server code**: `app/lib/`, `app/server/`
- **Generated code**: `app/generated/prisma` — never hand-edit

## File Organization

### Project Structure

```
app/
├── api/              # Route handlers (categories, sessions, tracker)
├── components/       # Shared React components
├── dashboard/        # Home page + tracker UI
├── settings/         # App settings (default timezone)
├── stats/            # Stats page with date/category filters
├── lib/              # Shared client/server utilities
├── server/           # Server-only data access / business logic
├── generated/prisma # Prisma Client output (generated)
├── layout.tsx
├── page.tsx
└── globals.css
prisma/
├── schema.prisma      # Schema source of truth
├── migrations/
└── seed.ts
docs/                 # PRD, nginx proxy notes
```

### Conventions

- **Server-only code**: keep Prisma access in `app/server/` or route handlers; never import the client into client components.
- **Generated code**: `app/generated/prisma` is build output — regenerate via `bunx prisma generate`, do not edit.
- **Local-first**: no auth/session middleware; assume single local user.

## Import Order

```typescript
// 1. Node/external packages
import { NextRequest, NextResponse } from "next/server";

// 2. Prisma / generated
import { prisma } from "@/app/server/db";

// 3. App internals (lib, server, components)
import { getSessionsForDay } from "@/app/server/sessions";
import { ActiveTimer } from "@/app/components/ActiveTimer";

// 4. Relative / co-located
import { formatDuration } from "./utils";
```

**Rules**:
- External packages first
- Then generated/Prisma
- Then app internals using `@/` alias
- Relative imports last
- Group with blank lines between groups

## Error Handling

### Pattern

**Approach**: Route handlers return structured `NextResponse.json({ error }, { status })`. Client code reads `ok`/`error` and surfaces user-friendly messages. Server-side validation rejects bad input with 400 before touching the DB.

### Guidelines

- Validate input shape and ranges before DB writes (400 for bad input)
- Return 404 for missing resources, 409 for conflicts (e.g. duplicate category name)
- Never leak raw Prisma error messages to the client
- Use `try/catch` around DB operations in route handlers
- Time/date inputs are validated and normalized to the configured default timezone

### Example

```typescript
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const category = await prisma.category.create({ data: { name: body.name.trim() } });
    return NextResponse.json(category, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
```

## Logging

**Tool**: `console` (no structured logger configured)
**Format**: plain text to server stdout

### Log Levels

| Level | Usage |
|-------|-------|
| `console.error` | Unexpected failures, caught exceptions in route handlers |
| `console.warn` | Recoverable issues, deprecated paths |
| `console.log` | Local dev diagnostics only (remove before shipping) |

### Guidelines

**Always log**:
- Unexpected server errors with request context
- Failed DB operations

**Never log**:
- Secrets, tokens, full `.env` values
- Full user session data

## Comments and Documentation

### When to Comment

- Explain non-obvious timezone/DST handling logic
- Document why a workaround exists (e.g. webpack dev mode, `router.refresh` limitations)
- Prisma schema fields use `///` doc comments to explain intent
- Do not narrate obvious code

### Documentation Format

**Functions**: brief JSDoc for exported server functions with non-obvious params
**Classes**: not used (functional style preferred)

## Code Patterns

### Preferred Patterns

#### URL-stored filters

Dashboard and Stats keep filters (`date`, `categoryId`, `from`, `to`) in search params so views are shareable and refresh-safe.

```typescript
const searchParams = useSearchParams();
const date = searchParams.get("date") ?? todayInDefaultTz();
```

#### Live timer draft

A running timer is stored as an `ActiveTimer` draft, not a `Session`. On stop, the server finalizes it into a `Session` (`kind: TIMER`, `endedAt` set) and deletes the draft.

#### Server-owned data access

All Prisma calls happen in route handlers or `app/server/*`; client components fetch via the API.

### Anti-Patterns to Avoid

- **Importing Prisma into client components**: leaks server code into the bundle — use the API instead
- **Editing `app/generated/prisma`**: regenerated by `prisma generate`, edits are lost
- **Storing dates without timezone context**: always capture `timeZone` and `timeZoneOffsetMinutes` per session
- **Using `next dev` (Turbopack) as default**: it panics on HMR here; use `bun run dev` (webpack)

---
*Generated by specs.md - fabriqa.ai FIRE Flow*
