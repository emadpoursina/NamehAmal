import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  PrismaClient,
  type PrismaClient as PrismaClientType,
} from "@/app/generated/prisma/client";

/** Maximum rows returned per call. Keeps the local read cheap and predictable. */
export const HERMES_TIME_ENTRIES_LIMIT_DEFAULT = 500;
export const HERMES_TIME_ENTRIES_LIMIT_MAX = 500;

export interface HermesTimeEntry {
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

export interface HermesTimeEntriesResult {
  start: string;
  end: string;
  count: number;
  totalDurationSeconds: number;
  truncated: boolean;
  entries: HermesTimeEntry[];
}

export interface HermesTimeEntriesOptions {
  start: Date;
  end: Date;
  limit?: number;
}

type PrismaForHermes = Pick<PrismaClientType, "session">;

let defaultClient: PrismaClientType | null = null;

/**
 * Lazily create the production Prisma client from DATABASE_URL.
 * Kept in this module (instead of app/server/db) so contract tests can import
 * the service without pulling in the server-only marker.
 */
function getDefaultClient(): PrismaClientType {
  if (!defaultClient) {
    const url = process.env.DATABASE_URL ?? "";
    if (!url.startsWith("file:")) {
      throw new Error("DATABASE_URL must be a sqlite file: URL.");
    }
    const adapter = new PrismaBetterSqlite3({ url });
    defaultClient = new PrismaClient({ adapter });
  }
  return defaultClient;
}

// Parse one ISO-8601 datetime query value.
export function parseInstant(value: string | null): Date | null {
  if (!value || !value.trim()) return null;
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date;
}

// Validate and normalize the `start` / `end` range for `get_time_entries`.
export function parseTimeRange(
  startRaw: string | null,
  endRaw: string | null,
  limitRaw: string | null,
): { options: HermesTimeEntriesOptions } | { error: string } {
  const start = parseInstant(startRaw);
  if (!start) return { error: "`start` must be a valid ISO-8601 datetime." };
  const end = parseInstant(endRaw);
  if (!end) return { error: "`end` must be a valid ISO-8601 datetime." };
  if (start.getTime() >= end.getTime()) {
    return { error: "`start` must be before `end`." };
  }

  let limit = HERMES_TIME_ENTRIES_LIMIT_DEFAULT;
  if (typeof limitRaw === "string" && limitRaw.trim() !== "") {
    const parsed = Number.parseInt(limitRaw.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > HERMES_TIME_ENTRIES_LIMIT_MAX) {
      return {
        error: `\`limit\` must be an integer between 1 and ${HERMES_TIME_ENTRIES_LIMIT_MAX}.`,
      };
    }
    limit = parsed;
  }

  return { options: { start, end, limit } };
}

/**
 * Read-only fetch of finalized time entries whose canonical `occurredAt`
 * falls in [start, end). The Mac app's SQLite database remains the source of
 * truth; this function never writes.
 *
 * Excluded: in-progress TIMER rows (`endedAt` null, still living in
 * ActiveTimer until stop) and tombstoned rows (`deletedAt` set).
 */export async function getHermesTimeEntries(
  options: HermesTimeEntriesOptions,
  client: PrismaForHermes | undefined = undefined,
): Promise<HermesTimeEntriesResult> {
  const store = client ?? getDefaultClient();  const limit = Math.min(
    Math.max(1, Math.trunc(options.limit ?? HERMES_TIME_ENTRIES_LIMIT_DEFAULT)),
    HERMES_TIME_ENTRIES_LIMIT_MAX,
  );

  const rows = await store.session.findMany({
    where: {
      deletedAt: null,
      // In-progress live timers are not finalized actual time yet.
      NOT: { kind: "TIMER", endedAt: null },
      occurredAt: { gte: options.start, lt: options.end },
    },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    take: limit + 1,
    include: { category: { select: { name: true } } },
  });

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  const entries: HermesTimeEntry[] = page.map((session) => ({
    id: session.id,
    title: session.title ?? null,
    categoryId: session.categoryId,
    categoryName: session.category?.name ?? "Unknown",
    kind: session.kind,
    occurredAt: session.occurredAt.toISOString(),
    startedAt: session.startedAt ? session.startedAt.toISOString() : null,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    durationSeconds: Math.max(1, Math.trunc(session.durationSeconds ?? 0)),
    timeZone: session.timeZone || "Asia/Yerevan",
  }));

  return {
    start: options.start.toISOString(),
    end: options.end.toISOString(),
    count: entries.length,
    totalDurationSeconds: entries.reduce((sum, entry) => sum + entry.durationSeconds, 0),
    truncated,
    entries,
  };
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}

/**
 * Testable handler for GET /api/hermes/time-entries. Pass a client in tests;
 * production callers omit it to use the app database.
 */
export async function handleHermesTimeEntries(
  request: Request,
  client?: PrismaClientType,
): Promise<Response> {
  const url = new URL(request.url);
  const parsed = parseTimeRange(
    url.searchParams.get("start"),
    url.searchParams.get("end"),
    url.searchParams.get("limit"),
  );
  if ("error" in parsed) {
    return Response.json(
      { ok: false, error: parsed.error },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const data = await getHermesTimeEntries(parsed.options, client);
    return Response.json({ ok: true, data }, { headers: noStoreHeaders() });
  } catch {
    return Response.json(
      { ok: false, error: "Time entries are temporarily unavailable; retry." },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}
