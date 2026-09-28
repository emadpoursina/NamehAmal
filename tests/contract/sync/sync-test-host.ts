/** Throwaway Prisma-backed sync test host (T021/T035). Never touches dev.db. */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaHostStore } from "@/app/server/sync/prisma-store";

export interface SyncTestHost {
  client: PrismaClient;
  store: PrismaHostStore;
  filePath: string;
  close: () => Promise<void>;
}

function migrationsDirectory(): string {
  return path.resolve(process.cwd(), "prisma", "migrations");
}

/** Apply every migration SQL file in order to a fresh SQLite file. */
export function applyMigrationsToFile(filePath: string): void {
  const directory = migrationsDirectory();
  const names = readdirSync(directory)
    .filter((name) => !name.startsWith(".") && name !== "migration_lock.toml")
    .sort();
  const database = new Database(filePath);
  try {
    database.pragma("foreign_keys = OFF");
    for (const name of names) {
      const sql = readFileSync(path.join(directory, name, "migration.sql"), "utf8");
      database.exec(sql);
    }
    database.pragma("foreign_keys = ON");
  } finally {
    database.close();
  }
}

/** Create an isolated Prisma host store backed by a throwaway SQLite file. */
export async function createSyncTestHost(): Promise<SyncTestHost> {
  const directory = mkdtempSync(path.join(tmpdir(), "namehamal-sync-host-"));
  const filePath = path.join(directory, "sync-host.sqlite");
  applyMigrationsToFile(filePath);
  if (filePath.endsWith("dev.db")) {
    throw new Error("Refusing to open dev.db as a sync test database.");
  }
  const adapter = new PrismaBetterSqlite3({ url: `file:${filePath}` });
  const client = new PrismaClient({ adapter });
  const store = new PrismaHostStore(client);
  let closed = false;
  return {
    client,
    store,
    filePath,
    close: async () => {
      if (closed) return;
      closed = true;
      await client.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export interface SeededHost {
  host: SyncTestHost;
  categoryId: string;
  activityId: string;
}

/** Seed one category and one activity; returns their ids. */
export async function seedCategoryAndActivity(
  host: SyncTestHost,
  title = "Planning",
): Promise<SeededHost> {
  const category = await host.client.category.create({
    data: { name: `Category ${title}` },
  });
  const activity = await host.client.activity.create({
    data: { title, categoryId: category.id },
  });
  return { host, categoryId: category.id, activityId: activity.id };
}
