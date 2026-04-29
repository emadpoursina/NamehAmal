import { Prisma } from "@/app/generated/prisma/client";
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

// Extract `id` from route params.
function getId(params: { id?: string }) {
  const id = typeof params.id === "string" ? params.id : "";
  return id.trim();
}

// Update an existing category by id.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id?: string }> },
) {
  const id = getId(await params);
  if (!id) return jsonError("`id` is required.", 400);

  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const name =
    "name" in body && typeof body.name === "string" ? body.name.trim() : undefined;
  const colorRaw =
    "color" in body && typeof body.color === "string" ? body.color.trim() : undefined;
  const colorNull =
    "color" in body && body.color === null ? null : undefined;
  const sortOrder =
    "sortOrder" in body && typeof body.sortOrder === "number"
      ? Math.trunc(body.sortOrder)
      : undefined;
  const isArchived =
    "isArchived" in body && typeof body.isArchived === "boolean"
      ? body.isArchived
      : undefined;
  const weeklyTargetHours =
    "weeklyTargetHours" in body &&
    typeof body.weeklyTargetHours === "number" &&
    Number.isFinite(body.weeklyTargetHours)
      ? body.weeklyTargetHours
      : "weeklyTargetHours" in body && body.weeklyTargetHours === null
        ? null
        : undefined;

  if (name !== undefined && !name) return jsonError("`name` must be non-empty.");
  if (
    typeof weeklyTargetHours === "number" &&
    (weeklyTargetHours < 0 || !Number.isFinite(weeklyTargetHours))
  ) {
    return jsonError("`weeklyTargetHours` must be >= 0 or null.");
  }

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(colorRaw !== undefined ? { color: colorRaw || null } : {}),
        ...(colorNull === null ? { color: null } : {}),
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
        ...(typeof isArchived === "boolean" ? { isArchived } : {}),
        ...(weeklyTargetHours !== undefined ? { weeklyTargetHours } : {}),
      },
    });
    return Response.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return jsonError("Category not found.", 404);
      if (err.code === "P2002") return jsonError("Category name must be unique.", 409);
      return jsonError("Failed to update category.", 400);
    }
    return jsonError("Failed to update category.", 500);
  }
}

