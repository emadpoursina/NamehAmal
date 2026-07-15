# System Architecture

## Overview

NamehAmal is a single-process, local-first time tracking application. One Next.js (App Router) server renders the UI and exposes JSON route handlers, backed by an embedded SQLite database file on the same host. There is no authentication, no multi-tenancy, and no cloud sync — by design the app serves one local user.

## System Context

The app runs on the user's own machine (dev) or a self-hosted box behind nginx (prod). The only external boundary is the HTTP client (browser) talking to the Next.js server, which reads/writes a local SQLite file.

### Context Diagram

```
+----------+        HTTP        +-------------------+        sync        +--------------+
|  Browser |  <--------------> |  Next.js Server   |  <--------------> |  SQLite file |
|  (user)  |   (App Router UI  |  (App Router +    |   (better-sqlite3) |  (dev.db)    |
+----------+    + /api JSON)    |   Route Handlers) |                    +--------------+
                              +-------------------+
```

### Users

- **Local user**: single person tracking time, managing categories, and reviewing stats. No auth — the app trusts the local host.

### External Systems

- **nginx (prod only)**: reverse proxy forwarding all traffic (including `/_next/static`) to the Node process, setting `X-Forwarded-Proto`/`X-Forwarded-Host`.
- None otherwise — fully self-contained.

## Architecture Pattern

**Pattern**: Modular monolith (single Next.js app) with layered internal separation (UI / API / server data access / generated client).
**Rationale**: Local-first single-user app — a monolith minimizes operational complexity while internal layers keep Prisma access off the client.

## Component Architecture

### Components

#### App Router UI

- **Purpose**: Render pages and client interactivity.
- **Responsibilities**: Dashboard (`/`), Stats (`/stats`), Settings (`/settings`); URL-stored filters; live tracker card.
- **Dependencies**: `/api/*` route handlers, `app/components/*`, `app/dashboard/active-timer-refresh-bus.ts`.

#### Route Handlers (API)

- **Purpose**: JSON endpoints for categories, sessions, and the live tracker.
- **Responsibilities**: Input validation, CRUD, tracker start/stop lifecycle, timezone normalization.
- **Dependencies**: `app/server/*` (Prisma access).

#### Server Data Layer

- **Purpose**: Encapsulate Prisma access and business rules.
- **Responsibilities**: Session finalization, duration derivation, date-range computation in the default timezone.
- **Dependencies**: `app/generated/prisma` (Prisma Client).

#### Prisma + SQLite

- **Purpose**: Persistence.
- **Responsibilities**: Store `Category`, `Session`, `ActiveTimer`, `AppSettings`; enforce indexes and uniqueness.
- **Dependencies**: `better-sqlite3` driver adapter, local `dev.db` file.

### Component Diagram

```
+-------------------+      +-------------------+
|   App Router UI   | ---> |  Route Handlers   |
| (dashboard/stats/ |      |  (categories/     |
|  settings)        |      |   sessions/       |
+-------------------+      |   tracker)        |
                           +---------+---------+
                                     |
                                     v
                        +-----------------------+
                        |  Server Data Layer    |
                        |  (app/server, lib)    |
                        +-----------+-----------+
                                    |
                                    v
                        +-----------------------+
                        |  Prisma Client        |
                        |  (app/generated)      |
                        +-----------+-----------+
                                    |
                                    v
                        +-----------------------+
                        |  SQLite (dev.db)      |
                        +-----------------------+
```

## Data Flow

User actions in the browser hit `/api/*` route handlers. Handlers validate input, call the server data layer, which uses Prisma to read/write the local SQLite file. Responses return as JSON; the UI updates (often via `router.refresh()` or the active-timer refresh bus).

```
Start timer:  POST /api/tracker {action:start}  -> create ActiveTimer draft
Stop timer:   POST /api/tracker {action:stop}   -> finalize Session (kind:TIMER, endedAt), delete draft
List day:     GET  /api/sessions?occurredFrom&occurredTo  -> finalized sessions only (in-progress excluded)
Manual add:   POST /api/sessions {kind:MANUAL, startedAt, endedAt}  -> derive duration + occurredAt
```

```
+--------+   action    +--------+   call    +--------+   query    +--------+
| Browser| ---------> | Route  | --------> | Server | ---------> | Prisma |
+--------+            | Handler|           | Data   |            +---+----+
   ^ JSON              +--------+           | Layer  |                |
   |                        ^              +--------+                v
   |                        |                  ^              +--------+
   +------------------------+                  |              | SQLite |
                                               +--------------+--------+
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI | React 19 + Next.js App Router 16 | Pages, client components, URL-stored filters |
| API | Next.js Route Handlers | JSON CRUD + tracker lifecycle |
| Data Access | Prisma 7.8 + `@prisma/adapter-better-sqlite3` | Type-safe schema-first queries |
| Storage | SQLite (local file) | Single-user persistence |
| Styling | Tailwind CSS 4 | Utility-first styling |
| Tooling | Bun, TypeScript 6, ESLint 9 | Build, types, lint |

## Non-Functional Requirements

### Performance

- **Page load**: local network; first contentful paint < 1s on dev box
- **API latency**: sub-100ms for typical reads against local SQLite
- **Bundle**: keep client bundle small — no Prisma in client components

### Security

- No auth by design — assume trusted local host
- `.env` is gitignored; never commit secrets
- Validate all API input server-side; never trust client timestamps blindly
- Production behind nginx must proxy `/_next/static` or client JS 404s

### Scalability

Single-user, single-process. Not designed to scale horizontally. If multi-user is ever needed, auth and a shared DB would be required (out of current scope).

## Constraints

- Local-first: no cloud sync, no remote DB
- SQLite only (no Postgres/MySQL) — no array/JSON column reliance beyond SQLite capabilities
- Dev server must run in webpack mode (`next dev --webpack`); Turbopack panics on HMR in this environment
- Prisma Client output path is fixed at `app/generated/prisma` (per `schema.prisma`)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | Embedded SQLite | Local-first, zero-ops, single user |
| ORM | Prisma 7.8 + driver adapter | Type safety + schema-as-source-of-truth |
| Timer model | `ActiveTimer` draft → `Session` | Avoids in-progress rows polluting finalized session lists |
| Timezone handling | Per-session `timeZone` + `timeZoneOffsetMinutes` | DST audit history; default from `AppSettings` |
| Filters | URL search params | Shareable, refresh-safe views |
| Dev mode | webpack (not Turbopack) | Turbopack HMR panics in this env |

---
*Generated by specs.md - fabriqa.ai FIRE Flow*
