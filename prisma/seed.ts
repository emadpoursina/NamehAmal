import "dotenv/config";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client";

// Create a PrismaClient wired to the SQLite file via driver adapter.
function createPrismaClient() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL must be a sqlite file: URL (got: ${JSON.stringify(url)})`,
    );
  }

  const adapter = new PrismaBetterSqlite3({ url });
  const prisma = new PrismaClient({ adapter });

  return { prisma };
}

// Seed local dev data into SQLite database.
async function main() {
  const { prisma } = createPrismaClient();

  try {
    await prisma.appSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton", timeZone: "Asia/Yerevan" },
    });

    await prisma.session.deleteMany();
    await prisma.category.deleteMany();

    const categories = await prisma.category.createMany({
      data: [
        { name: "Work", color: "#2563EB", sortOrder: 1 },
        { name: "Study", color: "#7C3AED", sortOrder: 2 },
        { name: "Life", color: "#16A34A", sortOrder: 3 },
      ],
    });

    const createdCategories = await prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const work = createdCategories.find((c) => c.name === "Work");
    const life = createdCategories.find((c) => c.name === "Life");
    if (!work || !life) {
      throw new Error("Seed categories not found after insertion.");
    }

    const now = new Date();
    const ninetyMinutesAgo = new Date(now.getTime() - 90 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    await prisma.session.createMany({
      data: [
        {
          kind: "TIMER",
          title: "Deep work",
          note: "Seeded sample session",
          categoryId: work.id,
          occurredAt: ninetyMinutesAgo,
          startedAt: ninetyMinutesAgo,
          endedAt: thirtyMinutesAgo,
          durationSeconds: 60 * 60,
          timeZone: "Asia/Yerevan",
        },
        {
          kind: "MANUAL",
          title: "Reading",
          note: "Seeded sample session",
          categoryId: life.id,
          occurredAt: now,
          startedAt: null,
          endedAt: null,
          durationSeconds: 25 * 60,
          timeZone: "Asia/Yerevan",
        },
      ],
    });

    return { categoriesInserted: categories.count };
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((result) => {
    console.log("Seed completed.", result);
  })
  .catch((err) => {
    console.error("Seed failed.", err);
    process.exitCode = 1;
  });
