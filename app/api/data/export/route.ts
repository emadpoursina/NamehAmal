import { prisma } from "@/app/server/db";

export const runtime = "nodejs";

type ExportV1 = {
  version: 1;
  exportedAt: string;
  categories: Array<{
    name: string;
    color: string | null;
    sortOrder: number;
    isArchived: boolean;
  }>;
  sessions: Array<{
    kind: "MANUAL" | "TIMER";
    title: string | null;
    note: string | null;
    categoryName: string;
    occurredAt: string;
    startedAt: string | null;
    endedAt: string | null;
    durationSeconds: number;
  }>;
};

// Export all categories and sessions as a versioned JSON payload.
export async function GET() {
  const [categories, sessions] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, color: true, sortOrder: true, isArchived: true },
    }),
    prisma.session.findMany({
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: { category: { select: { name: true } } },
    }),
  ]);

  const payload: ExportV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: categories.map((c) => ({
      name: c.name,
      color: c.color ?? null,
      sortOrder: c.sortOrder ?? 0,
      isArchived: Boolean(c.isArchived),
    })),
    sessions: sessions.map((s) => ({
      kind: s.kind,
      title: s.title ?? null,
      note: s.note ?? null,
      categoryName: s.category?.name ?? "Unknown",
      occurredAt: s.occurredAt.toISOString(),
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      durationSeconds: Math.max(1, Math.trunc(s.durationSeconds ?? 0)),
    })),
  };

  const yyyyMmDd = payload.exportedAt.slice(0, 10);
  const filename = `nameh-amal-export-${yyyyMmDd}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

