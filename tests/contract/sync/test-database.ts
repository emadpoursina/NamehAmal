import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export interface SyncTestDatabase {
  database: Database.Database;
  filePath: string;
  exists: () => boolean;
  close: () => void;
}

/** Creates a throwaway SQLite database that is never connected to dev.db. */
export function createSyncTestDatabase(): SyncTestDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), "namehamal-sync-test-"));
  const filePath = path.join(directory, "sync-test.sqlite");
  const database = new Database(filePath);
  database.pragma("foreign_keys = ON");
  let closed = false;

  return {
    database,
    filePath,
    exists: () => existsSync(filePath),
    close: () => {
      if (closed) return;
      closed = true;
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
