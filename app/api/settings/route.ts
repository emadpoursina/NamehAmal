import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/server/db";
import { isValidIanaTimeZone } from "@/app/lib/timezone";

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

// Fetch (or create) the singleton app settings row.
async function getOrCreateSettings() {
  return prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", timeZone: "Asia/Yerevan" },
  });
}

// Read app settings.
export async function GET() {
  const settings = await getOrCreateSettings();
  return Response.json({ ok: true, data: settings });
}

// Update app settings.
export async function PATCH(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const timeZone =
    "timeZone" in body && typeof body.timeZone === "string" ? body.timeZone.trim() : undefined;

  if (timeZone !== undefined && !isValidIanaTimeZone(timeZone)) {
    return jsonError("`timeZone` must be a valid IANA timezone (e.g. \"Asia/Yerevan\").");
  }

  try {
    const updated = await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: {
        ...(timeZone !== undefined ? { timeZone } : {}),
      },
      create: {
        id: "singleton",
        timeZone: timeZone ?? "Asia/Yerevan",
      },
    });

    return Response.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonError("Failed to update settings.", 400);
    }
    return jsonError("Failed to update settings.", 500);
  }
}

