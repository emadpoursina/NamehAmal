import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildServerEnvironment,
  createRuntimeConfig,
  resolveDatabasePath,
} from "../../electron/runtime-config";

describe("desktop runtime configuration", () => {
  it("normalizes development database URLs to absolute paths", () => {
    const config = createRuntimeConfig({
      projectRoot: "/tmp/nameh-amal",
      databaseUrl: "file:./dev.db",
    });

    expect(config.databasePath).toBe("/tmp/nameh-amal/dev.db");
    expect(config.databaseUrl).toBe("file:/tmp/nameh-amal/dev.db");
    expect(config.standaloneDirectory).toBe(
      "/tmp/nameh-amal/.next/standalone",
    );
  });

  it("uses the packaged profile and resource locations", () => {
    const config = createRuntimeConfig({
      isPackaged: true,
      projectRoot: "/Applications/NamehAmal.app/Contents/Resources/app",
      resourcesPath: "/Applications/NamehAmal.app/Contents/Resources",
      userDataDirectory: "/Users/test/Library/Application Support/NamehAmal",
    });

    expect(config.databasePath).toBe(
      "/Users/test/Library/Application Support/NamehAmal/nameh-amal.db",
    );
    expect(config.runtimeDirectory).toBe(
      "/Applications/NamehAmal.app/Contents/Resources/desktop-runtime",
    );
    expect(config.prismaCliPath).toContain(
      path.join("desktop-runtime", "node_modules", "prisma"),
    );
  });

  it("supports an isolated test profile without changing the loopback origin", () => {
    const config = createRuntimeConfig({
      projectRoot: "/tmp/nameh-amal",
      profileDirectory: "/tmp/nameh-amal-test-profile",
    });
    const environment = buildServerEnvironment(config, { CUSTOM: "value" });

    expect(config.databasePath).toBe(
      "/tmp/nameh-amal-test-profile/nameh-amal.db",
    );
    expect(config.origin).toBe("http://127.0.0.1:3060");
    expect(environment).toMatchObject({
      CUSTOM: "value",
      DATABASE_URL: "file:/tmp/nameh-amal-test-profile/nameh-amal.db",
      HOSTNAME: "127.0.0.1",
      PORT: "3060",
      NODE_ENV: "production",
    });
  });

  it("rejects non-SQLite database URLs", () => {
    expect(() =>
      resolveDatabasePath("postgresql://localhost/nameh", "/tmp"),
    ).toThrow(/sqlite file/);
  });
});
