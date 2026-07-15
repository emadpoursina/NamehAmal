import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/server/db";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function getId(params: { id?: string }) {
  const id = typeof params.id === "string" ? params.id : "";
  return id.trim();
}

const activityInclude = { category: true } as const;

async function assertUniqueTitle(title: string, excludeId: string) {
  const existing = await prisma.activity.findUnique({
    where: { title },
    select: { id: true },
  });
  if (existing && existing.id !== excludeId) {
    return jsonError("Activity title must be unique.");
  }
  return null;
}

// Update an existing activity by id.
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
  const categoryId =
    "categoryId" in body && typeof body.categoryId === "string"
      ? body.categoryId.trim()
      : undefined;
  const defaultDurationSeconds =
    "defaultDurationSeconds" in body &&
    typeof body.defaultDurationSeconds === "number" &&
    Number.isFinite(body.defaultDurationSeconds)
      ? Math.trunc(body.defaultDurationSeconds)
      : "defaultDurationSeconds" in body && body.defaultDurationSeconds === null
        ? null
        : undefined;
  const colorRaw =
    "color" in body && typeof body.color === "string" ? body.color.trim() : undefined;
  const colorNull = "color" in body && body.color === null ? null : undefined;
  const sortOrder =
    "sortOrder" in body && typeof body.sortOrder === "number"
      ? Math.trunc(body.sortOrder)
      : undefined;
  const isPinned =
    "isPinned" in body && typeof body.isPinned === "boolean"
      ? body.isPinned
      : undefined;
  const isArchived =
    "isArchived" in body && typeof body.isArchived === "boolean"
      ? body.isArchived
      : undefined;

  if (title !== undefined && !title) return jsonError("`title` must be non-empty.");
  if (categoryId !== undefined && !categoryId) {
    return jsonError("`categoryId` must be non-empty.");
  }
  if (
    typeof defaultDurationSeconds === "number" &&
    defaultDurationSeconds < 0
  ) {
    return jsonError("`defaultDurationSeconds` must be >= 0 or null.");
  }

  if (title !== undefined) {
    const titleError = await assertUniqueTitle(title, id);
    if (titleError) return titleError;
  }

  if (categoryId !== undefined) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) return jsonError("Category not found.", 404);
  }

  try {
    const updated = await prisma.activity.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(categoryId !== undefined ? { categoryId } : {}),
        ...(defaultDurationSeconds !== undefined
          ? { defaultDurationSeconds }
          : {}),
        ...(colorRaw !== undefined ? { color: colorRaw || null } : {}),
        ...(colorNull === null ? { color: null } : {}),
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
        ...(typeof isPinned === "boolean" ? { isPinned } : {}),
        ...(typeof isArchived === "boolean" ? { isArchived } : {}),
      },
      include: activityInclude,
    });
    return Response.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") return jsonError("Activity not found.", 404);
      if (err.code === "P2002") {
        return jsonError("Activity title must be unique.");
      }
      return jsonError("Failed to update activity.", 400);
    }
    return jsonError("Failed to update activity.", 500);
  }
}
