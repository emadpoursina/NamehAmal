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

function parseIncludeArchived(url: URL) {
  const raw = url.searchParams.get("includeArchived");
  return raw === "true" || raw === "1";
}

const activityInclude = { category: true } as const;

// List activities (default: non-archived with active categories).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeArchived = parseIncludeArchived(url);

  const activities = await prisma.activity.findMany({
    where: includeArchived
      ? undefined
      : {
          isArchived: false,
          category: { isArchived: false },
        },
    include: activityInclude,
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
  });

  return Response.json({ ok: true, data: activities });
}

async function findCategoryForActivity(categoryId: string) {
  return prisma.category.findUnique({ where: { id: categoryId } });
}

// Create a new activity.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const title =
    "title" in body && typeof body.title === "string" ? body.title.trim() : "";
  const categoryId =
    "categoryId" in body && typeof body.categoryId === "string"
      ? body.categoryId.trim()
      : "";
  const defaultDurationSeconds =
    "defaultDurationSeconds" in body &&
    typeof body.defaultDurationSeconds === "number" &&
    Number.isFinite(body.defaultDurationSeconds)
      ? Math.trunc(body.defaultDurationSeconds)
      : "defaultDurationSeconds" in body && body.defaultDurationSeconds === null
        ? null
        : undefined;
  const color =
    "color" in body && typeof body.color === "string" ? body.color.trim() : null;
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

  if (!title) return jsonError("`title` is required.");
  if (!categoryId) return jsonError("`categoryId` is required.");
  if (
    typeof defaultDurationSeconds === "number" &&
    defaultDurationSeconds < 0
  ) {
    return jsonError("`defaultDurationSeconds` must be >= 0 or null.");
  }

  const category = await findCategoryForActivity(categoryId);
  if (!category) return jsonError("Category not found.", 404);

  const existingTitle = await prisma.activity.findUnique({
    where: { title },
    select: { id: true },
  });
  if (existingTitle) {
    return jsonError("Activity title must be unique.");
  }

  try {
    const created = await prisma.activity.create({
      data: {
        title,
        categoryId,
        defaultDurationSeconds:
          defaultDurationSeconds !== undefined ? defaultDurationSeconds : null,
        color: color || null,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isPinned: typeof isPinned === "boolean" ? isPinned : false,
        isArchived: typeof isArchived === "boolean" ? isArchived : false,
      },
      include: activityInclude,
    });

    return Response.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return jsonError("Activity title must be unique.");
    }
    return jsonError("Failed to create activity.", 500);
  }
}
