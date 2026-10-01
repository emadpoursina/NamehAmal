# Hermes integration — Phase 3 (`get_time_entries`)

Read-only bridge between the NamehAmal Mac app and Hermes. The Mac app's
SQLite database stays the source of truth for actual tracked time; Hermes
only reads finalized entries in a `[start, end)` range so it can later
compare actuals against planned time (e.g. Google Calendar).

No MCP, no new time-tracking system, no write operations in this phase.

## Local API (served by the Mac app)

```text
GET http://127.0.0.1:3060/api/hermes/time-entries?start=ISO&end=ISO[&limit=N]
```

- `start` (required): inclusive ISO-8601 datetime.
- `end` (required): exclusive ISO-8601 datetime, must be after `start`.
- `limit` (optional): 1–500, default 500. Entries come back chronological
  (`occurredAt` ascending). When `truncated` is true, narrow the range.
- Filtering is on the canonical `occurredAt` timestamp (the same field the
  dashboard and stats group "by date" on). In-progress timers (`endedAt`
  null) and tombstoned deletions (`deletedAt` set) are excluded.
- Every other method returns `405 { ok: false, error: "This endpoint is read-only." }`.
- Responses are `cache-control: no-store`.

Example:

```bash
curl -sG 'http://127.0.0.1:3060/api/hermes/time-entries' \
  --data-urlencode 'start=2026-09-29T00:00:00+04:00' \
  --data-urlencode 'end=2026-09-30T00:00:00+04:00' | head -c 800
```

```json
{
  "ok": true,
  "data": {
    "start": "2026-09-28T20:00:00.000Z",
    "end": "2026-09-29T20:00:00.000Z",
    "count": 2,
    "totalDurationSeconds": 5400,
    "truncated": false,
    "entries": [
      {
        "id": "cm…",
        "title": "Deep work",
        "categoryId": "cm…",
        "categoryName": "Work",
        "kind": "TIMER",
        "occurredAt": "2026-09-29T05:00:00.000Z",
        "startedAt": "2026-09-29T05:00:00.000Z",
        "endedAt": "2026-09-29T06:00:00.000Z",
        "durationSeconds": 3600,
        "timeZone": "Asia/Yerevan"
      }
    ]
  }
}
```

## Thin Hermes tool

- [`tool.json`](./tool.json) — the `get_time_entries(start, end, limit?)`
  function-calling schema to register with Hermes.
- [`get_time_entries.ts`](./get_time_entries.ts) — a dependency-free
  `fetch` wrapper (`get_time_entries({ start, end, limit?, baseUrl? })`)
  that calls the endpoint above and returns the structured `data` payload.
- `scripts/hermes-time-entries.mjs` — shell fallback for agents that can
  run commands: prints the same JSON to stdout.

```bash
node scripts/hermes-time-entries.mjs \
  --start 2026-09-29T00:00:00+04:00 \
  --end 2026-09-30T00:00:00+04:00
```

Only add more capabilities (filters, writes, MCP) after real usage shows
they are needed.
