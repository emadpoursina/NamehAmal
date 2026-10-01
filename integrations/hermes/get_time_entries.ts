/**
 * Thin Hermes integration for Phase 3: `get_time_entries(start, end)`.
 *
 * Calls the read-only local API exposed by the Mac app (the source of truth
 * for actual tracked time) and returns the structured result unchanged. No
 * MCP, no writes, no new time-tracking system.
 */

export const DEFAULT_HERMES_BASE_URL = "http://127.0.0.1:3060";
export const HERMES_TIME_ENTRIES_PATH = "/api/hermes/time-entries";

export interface TimeEntry {
  id: string;
  title: string | null;
  categoryId: string;
  categoryName: string;
  kind: "MANUAL" | "TIMER";
  occurredAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  timeZone: string;
}

export interface GetTimeEntriesResult {
  start: string;
  end: string;
  count: number;
  totalDurationSeconds: number;
  truncated: boolean;
  entries: TimeEntry[];
}

export interface GetTimeEntriesOptions {
  start: string;
  end: string;
  limit?: number;
  /** Local app origin. Defaults to http://127.0.0.1:3060. */
  baseUrl?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

function buildUrl(options: GetTimeEntriesOptions): string {
  const base = (options.baseUrl ?? DEFAULT_HERMES_BASE_URL).replace(/\/+$/, "");
  const params = new URLSearchParams({ start: options.start, end: options.end });
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  return `${base}${HERMES_TIME_ENTRIES_PATH}?${params.toString()}`;
}

/** Fetch actual tracked time for [start, end) from the local Mac app. */
export async function get_time_entries(
  options: GetTimeEntriesOptions,
): Promise<GetTimeEntriesResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildUrl(options);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  const json = (await response.json()) as
    | { ok: true; data: GetTimeEntriesResult }
    | { ok: false; error: string };
  if (!response.ok || !json.ok) {
    throw new Error(
      (!json.ok && json.error) || `get_time_entries failed (${response.status}).`,
    );
  }
  return json.data;
}

export { buildUrl as buildGetTimeEntriesUrl };
