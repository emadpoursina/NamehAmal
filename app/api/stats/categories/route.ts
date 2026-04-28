import { prisma } from "@/app/server/db";

export const runtime = "nodejs";

// Build a consistent JSON error response.
function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

// Parse an ISO date safely.
function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Aggregate total session seconds by category for a date range.
export async function GET(request: Request) {
  const url = new URL(request.url);

  const occurredFrom = parseDate(url.searchParams.get("occurredFrom"));
  const occurredTo = parseDate(url.searchParams.get("occurredTo"));
  const categoryId = url.searchParams.get("categoryId");
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  if (!occurredFrom || !occurredTo) {
    return jsonError("`occurredFrom` and `occurredTo` are required ISO dates.");
  }
  if (occurredTo.getTime() < occurredFrom.getTime()) {
    return jsonError("`occurredTo` must be >= `occurredFrom`.");
  }

  const categories = await prisma.category.findMany({
    where: includeArchived ? undefined : { isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, color: true, isArchived: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryOrder = new Map(categories.map((c, idx) => [c.id, idx]));

  const rows = await prisma.session.groupBy({
    by: ["categoryId"],
    where: {
      ...(categoryId ? { categoryId } : {}),
      occurredAt: { gte: occurredFrom, lte: occurredTo },
    },
    _sum: { durationSeconds: true },
  });

  const byCategory = rows
    .map((r) => {
      const c = categoryById.get(r.categoryId);
      const seconds = Math.max(0, Math.trunc(r._sum.durationSeconds ?? 0));
      return {
        categoryId: r.categoryId,
        name: c?.name ?? "Unknown",
        color: c?.color ?? null,
        seconds,
      };
    })
    .filter((r) => r.seconds > 0)
    .sort((a, b) => {
      const aOrder = categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });

  const totalSeconds = byCategory.reduce((acc, r) => acc + r.seconds, 0);
  const withPercent = byCategory.map((r) => ({
    ...r,
    percent: totalSeconds > 0 ? Math.round((r.seconds / totalSeconds) * 1000) / 10 : 0,
  }));

  return Response.json({
    ok: true,
    data: {
      from: occurredFrom.toISOString(),
      to: occurredTo.toISOString(),
      totalSeconds,
      byCategory: withPercent,
    },
  });
}

