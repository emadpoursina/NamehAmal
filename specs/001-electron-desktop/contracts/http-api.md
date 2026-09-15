# HTTP API Contract

The Electron renderer talks to the same-origin Next.js route handlers over
`http://127.0.0.1:3060`. These routes remain internal to the installed
application: the server binds to loopback and the Electron window rejects
navigation away from that origin.

All JSON responses use the existing envelope:

- success: `{ "ok": true, "data": ... }`
- failure: `{ "ok": false, "error": "..." }`

The desktop conversion must not change these paths or their validation
semantics.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/settings` | Read the singleton default timezone. |
| `PATCH` | `/api/settings` | Validate and save an IANA default timezone. |
| `GET` | `/api/categories` | List active categories; `includeArchived=1` includes archived categories. |
| `POST` | `/api/categories` | Create a category with optional color, ordering, archive state, and weekly target. |
| `PATCH` | `/api/categories/:id` | Edit, archive, restore, reorder, or update a weekly target. |
| `DELETE` | `/api/categories/:id` | Delete only a category with no referenced sessions. |
| `GET` | `/api/activities` | List activity presets; archived records can be included. |
| `POST` | `/api/activities` | Create a title/category preset with optional duration, color, pin, ordering, and archive state. |
| `PATCH` | `/api/activities/:id` | Edit, reorder, pin, archive, or restore a preset. |
| `GET` | `/api/sessions` | List finalized sessions with optional category, ISO range, and limit filters. |
| `POST` | `/api/sessions` | Create a manual session or compatible finalized timer session. |
| `GET` | `/api/sessions/:id` | Read one session. |
| `PATCH` | `/api/sessions/:id` | Edit title, note, category, time range, duration, or timezone. |
| `DELETE` | `/api/sessions/:id` | Delete one session. |
| `GET` | `/api/tracker` | Return the current active timer draft or `null`. |
| `POST` | `/api/tracker` | `action=start` creates one draft; `action=stop` finalizes and removes it. |
| `GET` | `/api/stats/categories` | Aggregate finalized session seconds and percentages by category for an ISO range. |
| `GET` | `/api/data/export` | Return the versioned JSON backup as a download. |
| `POST` | `/api/data/import` | Validate and transactionally merge a version 1 or version 2 JSON backup. |

## Desktop-specific request rules

- Requests are made by the existing relative `fetch` calls, not by an
  Electron IPC replacement.
- The main process starts the server before the first page load and terminates
  it during application shutdown.
- A startup readiness check uses `GET /api/settings`; a non-success response
  prevents the window from being presented as ready.
- Database errors must remain errors. A failed save/import/export may not be
  converted to a successful response or a success toast.
- Import remains transactional. A malformed or unsupported payload is rejected
  before writes; a transaction failure leaves existing records unchanged.
- An active timer remains authoritative in SQLite, so a renderer reload or
  application restart reads the same draft through `GET /api/tracker`.

## Backup payload compatibility

The supported export contract is the current version 2 shape:

```json
{
  "version": 2,
  "exportedAt": "2026-09-13T00:00:00.000Z",
  "categories": [],
  "sessions": []
}
```

Category entries carry name, color, ordering, archive state, and optional
weekly target. Session entries carry kind, title, note, category name,
timestamps, positive duration, IANA timezone, and optional UTC offset. Import
continues to accept version 1 and version 2 according to the existing parser.
