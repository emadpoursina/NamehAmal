import { Prisma } from "@/app/generated/prisma/client";
import { offsetMinutesAt, isValidIanaTimeZone } from "@/app/lib/timezone";
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

// Fetch the currently running timer session, if any.
async function getActiveTimerSession() {
  return prisma.session.findFirst({
    where: { kind: "TIMER", endedAt: null },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

// Return the currently active timer session (or null).
export async function GET() {
  const active = await getActiveTimerSession();
  return Response.json({ ok: true, data: active ?? null });
}

// Start/stop live tracking sessions.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const action =
    "action" in body && typeof body.action === "string" ? body.action : null;

  if (action === "start") {
    const categoryId =
      "categoryId" in body && typeof body.categoryId === "string"
        ? body.categoryId.trim()
        : "";
    const title =
      "title" in body && typeof body.title === "string" ? body.title.trim() : "";
    const timeZoneRaw =
      "timeZone" in body && typeof body.timeZone === "string" ? body.timeZone.trim() : "";

    if (!categoryId) return jsonError("`categoryId` is required.");

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return jsonError("Category not found.", 404);

    const defaultTimeZone = await getDefaultTimeZone();
    const timeZone = timeZoneRaw ? timeZoneRaw : defaultTimeZone;
    if (!isValidIanaTimeZone(timeZone)) {
      return jsonError("`timeZone` must be a valid IANA timezone (e.g. \"Asia/Yerevan\").");
    }

    const existing = await getActiveTimerSession();
    if (existing) {
      return Response.json(
        { ok: false, error: "A timer session is already running.", data: existing },
        { status: 409 },
      );
    }

    const startedAt = new Date();
    const timeZoneOffsetMinutes = offsetMinutesAt(startedAt, timeZone);

    try {
      const created = await prisma.session.create({
        data: {
          kind: "TIMER",
          title: title || null,
          note: null,
          categoryId,
          occurredAt: startedAt,
          startedAt,
          endedAt: null,
          durationSeconds: 0,
          timeZone,
          timeZoneOffsetMinutes,
        },
        include: { category: true },
      });

      return Response.json({ ok: true, data: created }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        return jsonError("Failed to start timer session.", 400);
      }
      return jsonError("Failed to start timer session.", 500);
    }
  }

  if (action === "stop") {
    const sessionId =
      "sessionId" in body && typeof body.sessionId === "string"
        ? body.sessionId.trim()
        : "";

    if (!sessionId) return jsonError("`sessionId` is required.");

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { category: true },
    });
    if (!session) return jsonError("Session not found.", 404);
    if (session.kind !== "TIMER") return jsonError("Session is not a TIMER session.", 400);
    if (!session.startedAt) return jsonError("TIMER session is missing `startedAt`.", 400);
    if (session.endedAt) {
      return jsonError("Timer session is already stopped.", 409);
    }

    const endedAt = new Date();
    const durationSeconds = Math.max(
      1,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );

    try {
      const updated = await prisma.session.update({
        where: { id: sessionId },
        data: { endedAt, durationSeconds },
        include: { category: true },
      });

      return Response.json({ ok: true, data: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") return jsonError("Session not found.", 404);
        return jsonError("Failed to stop timer session.", 400);
      }
      return jsonError("Failed to stop timer session.", 500);
    }
  }

  return jsonError("Invalid `action`. Expected `start` or `stop`.");
}

