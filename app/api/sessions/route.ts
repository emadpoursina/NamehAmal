import { Prisma } from "@/app/generated/prisma/client";
import { isValidIanaTimeZone, offsetMinutesAt } from "@/app/lib/timezone";
import { getDefaultTimeZone } from "@/app/server/app-settings";
import { prisma } from "@/app/server/db";

export const runtime = "nodejs";

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

// List sessions (optionally filtered by date/category).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get("categoryId");
  const occurredFrom = parseDate(url.searchParams.get("occurredFrom"));
  const occurredTo = parseDate(url.searchParams.get("occurredTo"));
  const limitRaw = url.searchParams.get("limit");
  const limit =
    typeof limitRaw === "string" && limitRaw.trim()
      ? Math.min(500, Math.max(1, Number.parseInt(limitRaw, 10) || 100))
      : 100;

  const sessions = await prisma.session.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(occurredFrom || occurredTo
        ? {
            occurredAt: {
              ...(occurredFrom ? { gte: occurredFrom } : {}),
              ...(occurredTo ? { lte: occurredTo } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: true },
  });

  return Response.json({ ok: true, data: sessions });
}

// Create a new session (manual or timer).
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const kind =
    "kind" in body && typeof body.kind === "string" ? body.kind : null;
  const title =
    "title" in body && typeof body.title === "string" ? body.title.trim() : null;
  const note =
    "note" in body && typeof body.note === "string" ? body.note.trim() : null;
  const categoryId =
    "categoryId" in body && typeof body.categoryId === "string"
      ? body.categoryId
      : null;
  const timeZoneRaw =
    "timeZone" in body && typeof body.timeZone === "string"
      ? body.timeZone.trim()
      : "";
  const occurredAt =
    "occurredAt" in body && typeof body.occurredAt === "string"
      ? parseDate(body.occurredAt)
      : null;
  const startedAt =
    "startedAt" in body && typeof body.startedAt === "string"
      ? parseDate(body.startedAt)
      : null;
  const endedAt =
    "endedAt" in body && typeof body.endedAt === "string"
      ? parseDate(body.endedAt)
      : null;
  const durationSeconds =
    "durationSeconds" in body && typeof body.durationSeconds === "number"
      ? Math.trunc(body.durationSeconds)
      : null;

  if (kind !== "MANUAL" && kind !== "TIMER") return jsonError("Invalid `kind`.");
  if (!categoryId) return jsonError("`categoryId` is required.");

  const defaultTimeZone = await getDefaultTimeZone();
  const timeZone = timeZoneRaw ? timeZoneRaw : defaultTimeZone;
  if (!isValidIanaTimeZone(timeZone)) {
    return jsonError("`timeZone` must be a valid IANA timezone (e.g. \"Asia/Yerevan\").");
  }

  const manualFromRange =
    kind === "MANUAL" && startedAt && endedAt;
  let occurredAtFinal: Date;
  let durationSecondsFinal: number;
  let startedAtFinal: Date | null;
  let endedAtFinal: Date | null;

  if (manualFromRange) {
    if (endedAt.getTime() <= startedAt.getTime()) {
      return jsonError("`endedAt` must be after `startedAt`.");
    }
    occurredAtFinal = startedAt;
    durationSecondsFinal = Math.floor(
      (endedAt.getTime() - startedAt.getTime()) / 1000,
    );
    if (!durationSecondsFinal) {
      return jsonError("Session length must be at least 1 second.");
    }
    startedAtFinal = startedAt;
    endedAtFinal = endedAt;
  } else {
    if (!occurredAt) return jsonError("`occurredAt` must be a valid ISO date.");
    if (!durationSeconds || durationSeconds <= 0) {
      return jsonError("`durationSeconds` must be > 0.");
    }
    occurredAtFinal = occurredAt;
    durationSecondsFinal = durationSeconds;
    startedAtFinal = startedAt ?? null;
    endedAtFinal = endedAt ?? null;
    if (kind === "TIMER") {
      if (!startedAtFinal) return jsonError("`startedAt` is required for TIMER.");
      if (endedAtFinal && endedAtFinal.getTime() < startedAtFinal.getTime()) {
        return jsonError("`endedAt` must be >= `startedAt`.");
      }
    }
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return jsonError("Category not found.", 404);

  const timeZoneOffsetMinutes = offsetMinutesAt(occurredAtFinal, timeZone);

  try {
    const created = await prisma.session.create({
      data: {
        kind,
        title: title || null,
        note: note || null,
        categoryId,
        occurredAt: occurredAtFinal,
        startedAt: startedAtFinal,
        endedAt: endedAtFinal,
        durationSeconds: durationSecondsFinal,
        timeZone,
        timeZoneOffsetMinutes,
      },
      include: { category: true },
    });

    return Response.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError("Failed to create session.", 400);
    }
    return jsonError("Failed to create session.", 500);
  }
}

