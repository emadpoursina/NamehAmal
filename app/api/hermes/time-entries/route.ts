/**
 * Phase 3 read-only local API for Hermes.
 *
 * The Mac app's SQLite database is the source of truth for actual tracked
 * time. This route only reads finalized sessions in a [start, end) range so
 * Hermes can later compare actuals against Google Calendar planned time.
 * No write operations are exposed here; all non-GET methods return 405.
 */
import { handleHermesTimeEntries } from "@/app/server/hermes-time-entries";

export const runtime = "nodejs";

function readOnlyError(): Response {
  return Response.json(
    { ok: false, error: "This endpoint is read-only." },
    { status: 405, headers: { "cache-control": "no-store" } },
  );
}

/** GET /api/hermes/time-entries?start=ISO&end=ISO — the `get_time_entries` read. */
export async function GET(request: Request) {
  return handleHermesTimeEntries(request);
}

export async function POST() {
  return readOnlyError();
}

export async function PUT() {
  return readOnlyError();
}

export async function PATCH() {
  return readOnlyError();
}

export async function DELETE() {
  return readOnlyError();
}
