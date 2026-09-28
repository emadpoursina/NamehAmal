<!--
Sync Impact Report
- Version change: 1.1.0 → 1.1.1 (PATCH: extend the already-authorized 004 exception to its 005 simplification)
- Modified principles: I. Local-First, Single-User Monolith
- Updated sections: 004 Android time-tracking amendment record under Governance
- Removed sections: Separate Technology Stack and Security & Constraints headings; content retained
  under Technology Stack & Security Constraints.
- Follow-up TODOs: None.
-->
# NamehAmal Constitution

> Single-process, local-first time tracking app (Next.js App Router + TypeScript + Prisma + SQLite).
> Migrated from specsmd FIRE (`.specsmd/` + `.specs-fire/`, retired 2026-09-19) to Spec Kit.
> All intents were completed and implemented; their standards were consolidated below.

## Core Principles

### I. Local-First, Single-User Monolith

One Next.js (App Router) server renders the UI and exposes JSON route handlers, backed by an
embedded SQLite file on the same host. The app remains single-user and local-first: no general
authentication, no multi-tenancy, and no cloud sync. A monolith minimizes operational complexity;
internal layering (UI / API / server data access / generated client) keeps Prisma access off the
client. New features MUST follow this shape and MUST NOT introduce remote services, shared caches,
or multi-user machinery except under a documented constitution amendment.

The narrowly scoped exception for `specs/004-android-time-tracking` and its maintainer-authorized
simplification `specs/005-simple-android-tracking` permits the paired Android companion to connect
directly to the user's Mac over a trusted private network. The Android user manually saves the Mac
address and port and initiates Sync; hostnames MUST resolve only to private, loopback, or link-local
destinations before a connection is made. The transport uses plain HTTP; users MUST NOT use it on
untrusted or public networks. The 004 full-data mode retains user-mediated concurrent-edit
resolution. The narrower 005 mode uploads completed titled events only, accepts acknowledgements,
and MUST NOT download desktop events or propagate Android-local removals/deletions. No desktop
records are removed when Android storage is cleared. This exception authorizes no cloud or
third-party service and no general remote access: ordinary desktop endpoints MUST remain
loopback-only; only the dedicated sync path is permitted to accept this Android connection. No
other feature inherits this exception.

### II. Server-Owned Data Access

All Prisma calls happen in route handlers (`app/api/*/route.ts`) or `app/server/*`; client
components fetch via the API, never import Prisma. Generated code in `app/generated/prisma` is
build output — regenerate via `bunx prisma generate`, never hand-edit. Prisma schema changes MUST
include field-level `///` doc comments. SQLite only (no Postgres/MySQL-isms).

### III. Timezone-Aware Time Logic (NON-NEGOTIABLE)

All session logic is timezone-aware. Sessions capture `timeZone` + `timeZoneOffsetMinutes`;
time/date inputs are validated and normalized to the configured default timezone (`AppSettings`).
A running timer is an `ActiveTimer` draft, NOT a `Session` — on stop the server finalizes it into
a `Session` (`kind: TIMER`, `endedAt` set) and deletes the draft, so in-progress rows never pollute
finalized session lists. Storing dates without timezone context is forbidden.

### IV. Test-First with Real Dependencies

Vitest (`bunx vitest run` / `npm test`) is the runner. Prefer real dependencies over mocks:
data-layer tests use a throwaway SQLite file per run (never `dev.db`), route tests construct
`NextRequest` manually. Critical paths that MUST have coverage: tracker start → stop → finalized
`Session` lifecycle, `occurredAt`/duration derivation (MANUAL vs TIMER), timezone normalization,
stats week-defaulting, category uniqueness (409) and archive filtering.

### V. Simplicity & Framework Trust

URL search params for shareable/refresh-safe filters (Dashboard, Stats); React state for local UI;
server components fetch directly. Use Next.js/React/Tailwind features directly rather than wrapping
them. No speculative or "might need" features — every feature traces to a concrete user story. Dev
server runs in webpack mode (`npm run dev`); Turbopack panics on HMR here. Keep the client bundle
small: no Prisma in client components.

## Technology Stack & Security Constraints

| Layer | Choice |
|-------|--------|
| App | Next.js 16.2.4 (App Router) + React 19 + Tailwind CSS 4 |
| Language | TypeScript 6.0.3, 2-space indent, double quotes, semicolons |
| Data | SQLite (better-sqlite3) + Prisma 7.8 (`@prisma/adapter-better-sqlite3`), output `app/generated/prisma` |
| API | Next.js Route Handlers returning JSON (`{ error }` + status: 400 validation, 404 missing, 409 conflict; never leak raw Prisma errors) |
| Tooling | Bun (lockfile) / npm, ESLint 9 (`eslint-config-next`), `tsx` for TS scripts |
| Hosting | Self-hosted behind nginx (`npm run build` + `npm run start`); dev on port 3060 |

- No secrets in code — `.env` is local-only and gitignored; never commit credentials, keys, or tokens.
- Dependencies from trusted sources only; vulnerabilities addressed within SLA.
- Validate all API input server-side; never trust client timestamps blindly.
- Production nginx MUST proxy `/_next/static` or client JS 404s.
- Import order: external packages → generated/Prisma → app internals (`@/`) → relative, grouped
  with blank lines.

## Development Workflow

- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
  Feature branches merged via pull request into `master` (always deployable).
- **Review**: All changes require PR review (≥1 approval, no self-merge); security-sensitive
  changes require additional review. All PRs must pass lint + tests.
- **Spec-driven**: New features go through `/speckit.specify` → `/speckit.plan` →
  `/speckit.tasks` → `/speckit.implement` → `/speckit.converge`, with artifacts in
  `specs/NNN-name/`.
- **Docs**: Public APIs documented; breaking changes carry migration notes; README setup kept
  current.

## Governance

This constitution supersedes all other practices. Amendments require documented rationale,
maintainer review, and a backwards-compatibility assessment. Versioning follows semantic versioning:
MAJOR for backward-incompatible governance changes, MINOR for new principles or materially expanded
guidance, and PATCH for clarifications or non-semantic refinements. All PRs/reviews MUST verify
compliance; complexity MUST be justified. Runtime guidance: `AGENTS.md` (+
`node_modules/next/dist/docs/` per its rule).

### 004 Android Time-Tracking Amendment Record

**Date and direction**: Drafted on 2026-09-26 per the sole maintainer's direction in this session
(FLOW_ID `flow_20260926_a7f3k9`). No external approval document is claimed or referenced.

**Rationale**: Let the user's offline-capable Android companion transfer time-tracking data directly
to the existing Mac app on a trusted private network, without introducing cloud or third-party
services.

**Backwards-compatibility assessment**: The existing Mac-side SQLite store remains in place as the
desktop application's local data store; sync is additive and does not move ownership to a remote
service. Existing desktop-only workflows are unchanged, and ordinary desktop endpoints remain
loopback-only. The 005 simplification reuses this same path and narrows phone sync to title-bearing
uploads and acknowledgements; legacy 004 clients that omit the upload-only mode retain their
existing protocol behavior. Android-side removal is physical/local-only and cannot delete the
desktop copy. No other feature inherits this exception.

**005 extension direction**: Added on 2026-09-27 per the maintainer decision in FLOW_ID
`flow_1758944400_k7m2pq`: 005 is an authorized simplification of 004 on the same branch and does not
expand its trusted-LAN boundary. This records that direction; it does not claim external approval.

**Version**: 1.1.1 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-27
