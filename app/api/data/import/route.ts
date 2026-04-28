import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/server/db";

export const runtime = "nodejs";

type ImportV1 = {
  version: 1;
  exportedAt?: string;
  categories: Array<{
    name: string;
    color?: string | null;
    sortOrder?: number;
    isArchived?: boolean;
  }>;
  sessions: Array<{
    kind: "MANUAL" | "TIMER";
    title?: string | null;
    note?: string | null;
    categoryName: string;
    occurredAt: string;
    startedAt?: string | null;
    endedAt?: string | null;
    durationSeconds: number;
  }>;
};

// Build a consistent JSON error response.
function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

// Parse a JSON body safely.
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Parse an ISO date safely.
function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Narrow unknown to an object record.
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

// Parse an import payload (v1) with validation.
function parseImportV1(value: unknown): { ok: true; data: ImportV1 } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "Invalid JSON body." };
  if (value.version !== 1) return { ok: false, error: "`version` must be 1." };

  const categoriesRaw = value.categories;
  const sessionsRaw = value.sessions;
  if (!Array.isArray(categoriesRaw)) return { ok: false, error: "`categories` must be an array." };
  if (!Array.isArray(sessionsRaw)) return { ok: false, error: "`sessions` must be an array." };

  const categories: ImportV1["categories"] = [];
  for (const item of categoriesRaw) {
    if (!isRecord(item)) return { ok: false, error: "Invalid category entry." };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return { ok: false, error: "Category `name` is required." };
    categories.push({
      name,
      color:
        "color" in item && (typeof item.color === "string" || item.color === null)
          ? (typeof item.color === "string" ? item.color.trim() : null)
          : undefined,
      sortOrder:
        "sortOrder" in item && typeof item.sortOrder === "number"
          ? Math.trunc(item.sortOrder)
          : undefined,
      isArchived:
        "isArchived" in item && typeof item.isArchived === "boolean"
          ? item.isArchived
          : undefined,
    });
  }

  const sessions: ImportV1["sessions"] = [];
  for (const item of sessionsRaw) {
    if (!isRecord(item)) return { ok: false, error: "Invalid session entry." };

    const kind = item.kind === "MANUAL" || item.kind === "TIMER" ? item.kind : null;
    if (!kind) return { ok: false, error: "Session `kind` must be MANUAL or TIMER." };

    const categoryName = typeof item.categoryName === "string" ? item.categoryName.trim() : "";
    if (!categoryName) return { ok: false, error: "Session `categoryName` is required." };

    const occurredAt =
      typeof item.occurredAt === "string" ? parseDate(item.occurredAt) : null;
    if (!occurredAt) return { ok: false, error: "Session `occurredAt` must be a valid ISO date." };

    const startedAt =
      "startedAt" in item
        ? typeof item.startedAt === "string"
          ? parseDate(item.startedAt)
          : item.startedAt === null
            ? null
            : undefined
        : undefined;
    if (startedAt === null && kind === "TIMER") {
      return { ok: false, error: "Session `startedAt` is required for TIMER." };
    }
    if (startedAt === undefined && kind === "TIMER") {
      return { ok: false, error: "Session `startedAt` is required for TIMER." };
    }

    const endedAt =
      "endedAt" in item
        ? typeof item.endedAt === "string"
          ? parseDate(item.endedAt)
          : item.endedAt === null
            ? null
            : undefined
        : undefined;
    if (endedAt && startedAt && endedAt.getTime() < startedAt.getTime()) {
      return { ok: false, error: "Session `endedAt` must be >= `startedAt`." };
    }

    const durationSeconds =
      typeof item.durationSeconds === "number" ? Math.trunc(item.durationSeconds) : 0;
    if (!durationSeconds || durationSeconds <= 0) {
      return { ok: false, error: "Session `durationSeconds` must be > 0." };
    }

    const title =
      "title" in item && (typeof item.title === "string" || item.title === null)
        ? typeof item.title === "string"
          ? item.title.trim() || null
          : null
        : undefined;
    const note =
      "note" in item && (typeof item.note === "string" || item.note === null)
        ? typeof item.note === "string"
          ? item.note.trim() || null
          : null
        : undefined;

    sessions.push({
      kind,
      categoryName,
      occurredAt: occurredAt.toISOString(),
      startedAt: startedAt ? startedAt.toISOString() : null,
      endedAt: endedAt ? endedAt.toISOString() : null,
      durationSeconds,
      ...(title !== undefined ? { title } : {}),
      ...(note !== undefined ? { note } : {}),
    });
  }

  return {
    ok: true,
    data: {
      version: 1,
      exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : undefined,
      categories,
      sessions,
    },
  };
}

// Import a v1 JSON export payload and merge into the local DB.
export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = parseImportV1(body);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  const warnings: string[] = [
    "Re-importing the same file may create duplicate sessions (v1 does not de-duplicate).",
  ];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const categoryNameToId = new Map<string, string>();
      const existingCategories = await tx.category.findMany({
        select: { id: true, name: true },
      });
      for (const c of existingCategories) categoryNameToId.set(c.name, c.id);

      let categoriesCreated = 0;
      for (const c of parsed.data.categories) {
        if (categoryNameToId.has(c.name)) continue;
        const created = await tx.category.create({
          data: {
            name: c.name,
            color: c.color ?? null,
            sortOrder: typeof c.sortOrder === "number" ? c.sortOrder : 0,
            isArchived: typeof c.isArchived === "boolean" ? c.isArchived : false,
          },
          select: { id: true, name: true },
        });
        categoriesCreated += 1;
        categoryNameToId.set(created.name, created.id);
      }

      let sessionsCreated = 0;
      for (const s of parsed.data.sessions) {
        const categoryId = categoryNameToId.get(s.categoryName);
        if (!categoryId) {
          throw new Error(`Category not found for session: ${JSON.stringify(s.categoryName)}`);
        }

        await tx.session.create({
          data: {
            kind: s.kind,
            title: s.title ?? null,
            note: s.note ?? null,
            categoryId,
            occurredAt: new Date(s.occurredAt),
            startedAt: s.startedAt ? new Date(s.startedAt) : null,
            endedAt: s.endedAt ? new Date(s.endedAt) : null,
            durationSeconds: s.durationSeconds,
          },
        });
        sessionsCreated += 1;
      }

      return { categoriesCreated, sessionsCreated };
    });

    return Response.json({ ok: true, data: { ...result, warnings } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return jsonError("Import would violate a uniqueness constraint.", 409);
      return jsonError("Failed to import data.", 400);
    }
    return jsonError(err instanceof Error ? err.message : "Failed to import data.", 500);
  }
}

