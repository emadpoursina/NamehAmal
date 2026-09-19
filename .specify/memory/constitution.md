# NamehAmal Constitution

> Single-process, local-first time tracking app (Next.js App Router + TypeScript + Prisma + SQLite).
> Migrated from specsmd FIRE (`.specsmd/` + `.specs-fire/`, retired 2026-09-19) to Spec Kit.
> All intents were completed and implemented; their standards were consolidated below.

## Core Principles

### I. Local-First, Single-User Monolith

One Next.js (App Router) server renders the UI and exposes JSON route handlers, backed by an
embedded SQLite file on the same host. No auth, no multi-tenancy, no cloud sync — by design.
A monolith minimizes operational complexity; internal layering (UI / API / server data access /
generated client) keeps Prisma access off the client. New features MUST follow this shape and
MUST NOT introduce remote services, shared caches, or multi-user machinery without a
constitution amendment.

### II. Server-Owned Data Access

All Prisma calls happen in route handlers (`app/api/*/route.ts`) or `app/server/*`; client
components fetch via the API, never import Prisma. Generated code in `app/generated/prisma` is
build output — regenerate via `bunx prisma generate`, never hand-edit. Prisma schema changes
MUST include field-level `///` doc comments. SQLite only (no Postgres/MySQL-isms).

### III. Timezone-Aware Time Logic (NON-NEGOTIABLE)

All session logic is timezone-aware. Sessions capture `timeZone` + `timeZoneOffsetMinutes`;
time/date inputs are validated and normalized to the configured default timezone
(`AppSettings`). A running timer is an `ActiveTimer` draft, NOT a `Session` — on stop the
server finalizes it into a `Session` (`kind: TIMER`, `endedAt` set) and deletes the draft, so
in-progress rows never pollute finalized session lists. Storing dates without timezone context
is forbidden.

### IV. Test-First with Real Dependencies

Vitest (`bunx vitest run` / `npm test`) is the runner. Prefer real dependencies over mocks:
data-layer tests use a throwaway SQLite file per run (never `dev.db`), route tests construct
`NextRequest` manually. Critical paths that MUST have coverage: tracker start → stop →
finalized `Session` lifecycle, `occurredAt`/duration derivation (MANUAL vs TIMER), timezone
normalization, stats week-defaulting, category uniqueness (409) and archive filtering.

### V. Simplicity & Framework Trust

URL search params for shareable/refresh-safe filters (Dashboard, Stats); React state for local
UI; server components fetch directly. Use Next.js/React/Tailwind features directly rather than
wrapping them. No speculative or "might need" features — every feature traces to a concrete
user story. Dev server runs in webpack mode (`npm run dev`); Turbopack panics on HMR here.
Keep the client bundle small: no Prisma in client components.

## Technology Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16.2.4 (App Router) + React 19 + Tailwind CSS 4 |
| Language | TypeScript 6.0.3, 2-space indent, double quotes, semicolons |
| Data | SQLite (better-sqlite3) + Prisma 7.8 (`@prisma/adapter-better-sqlite3`), output `app/generated/prisma` |
| API | Next.js Route Handlers returning JSON (`{ error }` + status: 400 validation, 404 missing, 409 conflict; never leak raw Prisma errors) |
| Tooling | Bun (lockfile) / npm, ESLint 9 (`eslint-config-next`), `tsx` for TS scripts |
| Hosting | Self-hosted behind nginx (`npm run build` + `npm run start`); dev on port 3060 |

## Development Workflow

- **Commits**: Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
  Feature branches merged via pull request into `master` (always deployable).
- **Review**: All changes require PR review (≥1 approval, no self-merge); security-sensitive
  changes require additional review. All PRs must pass lint + tests.
- **Spec-driven**: New features go through `/speckit.specify` → `/speckit.plan` →
  `/speckit.tasks` → `/speckit.implement` → `/speckit.converge`, with artifacts in `specs/NNN-name/`.
- **Docs**: Public APIs documented; breaking changes carry migration notes; README setup kept current.

## Security & Constraints

- No secrets in code — `.env` is local-only and gitignored; never commit credentials, keys, or tokens.
- Dependencies from trusted sources only; vulnerabilities addressed within SLA.
- Validate all API input server-side; never trust client timestamps blindly.
- Production nginx MUST proxy `/_next/static` or client JS 404s.
- Import order: external packages → generated/Prisma → app internals (`@/`) → relative, grouped with blank lines.

## Governance

This constitution supersedes all other practices. Amendments require documented rationale,
maintainer review, and a backwards-compatibility assessment. All PRs/reviews MUST verify
compliance; complexity MUST be justified. Runtime guidance: `AGENTS.md` (+ `node_modules/next/dist/docs/` per its rule).

**Version**: 1.0.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-09-19
