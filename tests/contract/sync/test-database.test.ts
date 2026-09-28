import { describe, expect, it } from "vitest";

import { createSyncTestDatabase } from "./test-database";

describe("sync test database fixture", () => {
  it("creates isolated temporary SQLite databases and removes them on close", () => {
    const first = createSyncTestDatabase();
    const second = createSyncTestDatabase();
    try {
      expect(first.filePath).not.toBe(second.filePath);
      expect(first.filePath).not.toMatch(/(?:^|\/)dev\.db$/);
      first.database.exec("CREATE TABLE sample (id TEXT PRIMARY KEY)");
      expect(() => second.database.prepare("SELECT * FROM sample").all()).toThrow();
    } finally {
      first.close();
      second.close();
    }
    expect(first.exists()).toBe(false);
    expect(second.exists()).toBe(false);
  });
});
