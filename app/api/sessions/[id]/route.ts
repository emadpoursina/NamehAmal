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
  const timeZoneRaw =
    "timeZone" in body && typeof body.timeZone === "string" ? body.timeZone.trim() : undefined;

  if (durationSeconds !== undefined && (!durationSeconds || durationSeconds <= 0)) {
    return jsonError("`durationSeconds` must be > 0.");
  }
  if (occurredAt !== undefined && !occurredAt) {
    return jsonError("`occurredAt` must be a valid ISO date.");
  }
  if (timeZoneRaw !== undefined && timeZoneRaw && !isValidIanaTimeZone(timeZoneRaw)) {
    return jsonError("`timeZone` must be a valid IANA timezone (e.g. \"Asia/Yerevan\").");
  }

  if (categoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return jsonError("Category not found.", 404);
  }

  try {
    const current =
      occurredAt !== undefined || timeZoneRaw !== undefined
        ? await prisma.session.findUnique({ where: { id }, select: { occurredAt: true, timeZone: true } })
        : null;

    const nextTimeZone =
      timeZoneRaw !== undefined
        ? timeZoneRaw || (await getDefaultTimeZone())
        : current?.timeZone;
    const nextOccurredAt = occurredAt !== undefined ? occurredAt : current?.occurredAt;
    const timeZoneOffsetMinutes =
      nextTimeZone && nextOccurredAt ? offsetMinutesAt(nextOccurredAt, nextTimeZone) : undefined;

    const updated = await prisma.session.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title || null } : {}),
        ...(note !== undefined ? { note: note || null } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(occurredAt !== undefined ? { occurredAt } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(timeZoneRaw !== undefined ? { timeZone: timeZoneRaw || (await getDefaultTimeZone()) } : {}),
        ...(timeZoneOffsetMinutes !== undefined ? { timeZoneOffsetMinutes } : {}),
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

