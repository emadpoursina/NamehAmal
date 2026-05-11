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

// Extract `id` from route params.
function getId(params: { id?: string }) {
  const id = typeof params.id === "string" ? params.id : "";
  return id.trim();
}

// Fetch a session by id.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id?: string }> },
) {
  const id = getId(await params);
  if (!id) return jsonError("`id` is required.", 400);

  const session = await prisma.session.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!session) return jsonError("Session not found.", 404);

  return Response.json({ ok: true, data: session });
}

// Update an existing session by id.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id?: string }> },
) {
  const id = getId(await params);
  if (!id) return jsonError("`id` is required.", 400);

  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const title =
    "title" in body && typeof body.title === "string" ? body.title.trim() : undefined;
  const note =
    "note" in body && typeof body.note === "string" ? body.note.trim() : undefined;
  const categoryId =
    "categoryId" in body && typeof body.categoryId === "string"
      ? body.categoryId
      : undefined;
  const occurredAt =
    "occurredAt" in body && typeof body.occurredAt === "string"
      ? parseDate(body.occurredAt)
      : undefined;
  const durationSeconds =
    "durationSeconds" in body && typeof body.durationSeconds === "number"
      ? Math.trunc(body.durationSeconds)
      : undefined;
  const startedAtInBody = "startedAt" in body;
  const endedAtInBody = "endedAt" in body;
  const startedAtParsed =
    startedAtInBody && typeof body.startedAt === "string"
      ? parseDate(body.startedAt)
      : null;
  const endedAtParsed =
    endedAtInBody && typeof body.endedAt === "string"
      ? parseDate(body.endedAt)
      : null;
  const timeZoneRaw =
    "timeZone" in body && typeof body.timeZone === "string" ? body.timeZone.trim() : undefined;

  if (startedAtInBody !== endedAtInBody) {
    return jsonError("Provide both `startedAt` and `endedAt`, or neither.");
  }
  const useRange = startedAtInBody && endedAtInBody;
  if (useRange) {
    if (!startedAtParsed || !endedAtParsed) {
      return jsonError("`startedAt` and `endedAt` must be valid ISO dates.");
    }
    if (endedAtParsed.getTime() <= startedAtParsed.getTime()) {
      return jsonError("`endedAt` must be after `startedAt`.");
    }
  } else {
    if (durationSeconds !== undefined && (!durationSeconds || durationSeconds <= 0)) {
      return jsonError("`durationSeconds` must be > 0.");
    }
    if (occurredAt !== undefined && !occurredAt) {
      return jsonError("`occurredAt` must be a valid ISO date.");
    }
  }
  if (timeZoneRaw !== undefined && timeZoneRaw && !isValidIanaTimeZone(timeZoneRaw)) {
    return jsonError("`timeZone` must be a valid IANA timezone (e.g. \"Asia/Yerevan\").");
  }

  if (categoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return jsonError("Category not found.", 404);
  }

  try {
    const existing = await prisma.session.findUnique({ where: { id } });
    if (!existing) return jsonError("Session not found.", 404);

    const nextTimeZone =
      timeZoneRaw !== undefined
        ? timeZoneRaw || (await getDefaultTimeZone())
        : existing.timeZone;

    let nextOccurredAt = existing.occurredAt;
    let nextDurationSeconds = existing.durationSeconds;
    let nextStartedAt = existing.startedAt;
    let nextEndedAt = existing.endedAt;

    if (useRange && startedAtParsed && endedAtParsed) {
      nextOccurredAt = startedAtParsed;
      nextDurationSeconds = Math.floor(
        (endedAtParsed.getTime() - startedAtParsed.getTime()) / 1000,
      );
      if (!nextDurationSeconds) {
        return jsonError("Session length must be at least 1 second.");
      }
      nextStartedAt = startedAtParsed;
      nextEndedAt = endedAtParsed;
    } else {
      if (occurredAt) nextOccurredAt = occurredAt;
      if (durationSeconds !== undefined) nextDurationSeconds = durationSeconds;
    }

    const shouldRefreshOffset =
      useRange || occurredAt !== undefined || timeZoneRaw !== undefined;
    const timeZoneOffsetMinutes = shouldRefreshOffset
      ? offsetMinutesAt(nextOccurredAt, nextTimeZone)
      : undefined;

    const updated = await prisma.session.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title || null } : {}),
        ...(note !== undefined ? { note: note || null } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(useRange || occurredAt !== undefined ? { occurredAt: nextOccurredAt } : {}),
        ...(useRange || durationSeconds !== undefined ? { durationSeconds: nextDurationSeconds } : {}),
        ...(useRange ? { startedAt: nextStartedAt, endedAt: nextEndedAt } : {}),
        ...(timeZoneRaw !== undefined ? { timeZone: nextTimeZone } : {}),
        ...(shouldRefreshOffset ? { timeZoneOffsetMinutes } : {}),
      },
      include: { category: true },
    });

    return Response.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return jsonError("Session not found.", 404);
      return jsonError("Failed to update session.", 400);
    }
    return jsonError("Failed to update session.", 500);
  }
}

// Delete a session by id.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id?: string }> },
) {
  const id = getId(await params);
  if (!id) return jsonError("`id` is required.", 400);

  try {
    await prisma.session.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return jsonError("Session not found.", 404);
    }
    return jsonError("Failed to delete session.", 500);
  }
}

