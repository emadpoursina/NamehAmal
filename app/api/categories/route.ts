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

// List categories (default: non-archived).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  const categories = await prisma.category.findMany({
    where: includeArchived ? undefined : { isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return Response.json({ ok: true, data: categories });
}

// Create a new category.
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || typeof body !== "object") return jsonError("Invalid JSON body.");

  const name =
    "name" in body && typeof body.name === "string" ? body.name.trim() : "";
  const color =
    "color" in body && typeof body.color === "string" ? body.color.trim() : null;
  const sortOrder =
    "sortOrder" in body && typeof body.sortOrder === "number"
      ? body.sortOrder
      : undefined;
  const isArchived =
    "isArchived" in body && typeof body.isArchived === "boolean"
      ? body.isArchived
      : undefined;

  if (!name) return jsonError("`name` is required.");

  try {
    const created = await prisma.category.create({
      data: {
        name,
        color: color || null,
        sortOrder: typeof sortOrder === "number" ? Math.trunc(sortOrder) : 0,
        isArchived: typeof isArchived === "boolean" ? isArchived : false,
      },
    });

    return Response.json({ ok: true, data: created }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return jsonError("Category name must be unique.", 409);
    }
    return jsonError("Failed to create category.", 500);
  }
}

