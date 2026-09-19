import { createRequire } from "node:module";
import { execFile as nodeExecFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createRuntimeConfig } from "../../electron/runtime-config";
import { ServerProcess } from "../../electron/server-process";

const execFile = promisify(nodeExecFile);
const projectRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(projectRoot, ".desktop-runtime");
const standaloneRoot = path.join(runtimeRoot, "standalone");
const stageAvailable = existsSync(path.join(standaloneRoot, "server.js"));
const require = createRequire(import.meta.url);

type ApiBody = {
  ok?: boolean;
  error?: string;
  data?: unknown;
};

async function runMigration(databasePath: string): Promise<void> {
  await execFile(
    process.execPath,
    [
      path.join(runtimeRoot, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(runtimeRoot, "prisma", "schema.prisma"),
    ],
    {
      cwd: runtimeRoot,
      env: {
        ...process.env,
        DATABASE_URL: `file:${databasePath}`,
      },
    },
  );
}

async function waitForServer(
  child: ReturnType<typeof spawn>,
  origin: string,
): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error("Staged server exited before readiness");
    }
    try {
      const response = await fetch(`${origin}/api/settings`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Staged server did not become ready");
}

async function startPackagedServer(
  port: number,
  profileDirectory?: string,
) {
  const profile =
    profileDirectory ?? (await mkdtemp(path.join(tmpdir(), "nameh-amal-package-")));
  const databasePath = path.join(profile, "nameh-amal.db");
  await runMigration(databasePath);
  const child = spawn(process.execPath, [path.join(standaloneRoot, "server.js")], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath}`,
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
    stdio: "ignore",
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(child, origin);
    return { child, origin, profile, databasePath };
  } catch (error) {
    await stopPackagedServer(child);
    throw error;
  }
}

async function stopPackagedServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

async function closeHttpServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestJson(
  origin: string,
  route: string,
  init?: RequestInit,
): Promise<{ response: Response; body: ApiBody }> {
  const response = await fetch(`${origin}${route}`, init);
  const body = JSON.parse(await response.text()) as ApiBody;
  return { response, body };
}

const packagedTests = describe.skipIf(!stageAvailable);

packagedTests("packaged desktop runtime", () => {
  it("contains the standalone server, assets, migrations, and native SQLite", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(runtimeRoot, "manifest.json"), "utf8"),
    ) as { server: string; migrations: string };
    const Database = require(
      path.join(standaloneRoot, "node_modules", "better-sqlite3"),
    ) as new (file: string) => { close: () => void };
    const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
    const database = new Database(path.join(profile, "native-check.db"));

    expect(manifest.server).toBe("standalone/server.js");
    expect(manifest.migrations).toBe("prisma/migrations");
    expect(existsSync(path.join(standaloneRoot, "server.js"))).toBe(true);
    expect(
      existsSync(
        path.join(runtimeRoot, "node_modules", "prisma", "build", "index.js"),
      ),
    ).toBe(true);
    expect(existsSync(path.join(standaloneRoot, "public"))).toBe(true);
    expect(existsSync(path.join(standaloneRoot, ".next", "static"))).toBe(true);
    expect(existsSync(path.join(runtimeRoot, "prisma", "migrations"))).toBe(true);
    database.close();
  });

  it("does not retain build-machine links for traced native modules", async () => {
    const tracedNodeModules = path.join(
      standaloneRoot,
      ".next",
      "node_modules",
    );
    const entries = await readdir(tracedNodeModules, { withFileTypes: true });

    expect(
      entries.filter(
        (entry) =>
          entry.name.startsWith("better-sqlite3-") && entry.isSymbolicLink(),
      ),
    ).toHaveLength(0);
  });

  it(
    "creates a clean database and serves Dashboard/API from the staged server",
    async () => {
      const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
      const databasePath = path.join(profile, "nameh-amal.db");
      await runMigration(databasePath);

      const port = 3061;
      const child = spawn(process.execPath, [path.join(standaloneRoot, "server.js")], {
        cwd: standaloneRoot,
        env: {
          ...process.env,
          DATABASE_URL: `file:${databasePath}`,
          HOSTNAME: "127.0.0.1",
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
          PORT: String(port),
        },
        stdio: "ignore",
      });

      try {
        await waitForServer(child, `http://127.0.0.1:${port}`);
        const dashboard = await fetch(`http://127.0.0.1:${port}/`);
        const settings = await fetch(
          `http://127.0.0.1:${port}/api/settings`,
        );
        expect(dashboard.ok).toBe(true);
        expect(settings.ok).toBe(true);
      } finally {
        child.kill("SIGTERM");
      }
    },
    30_000,
  );

  it(
    "reuses a migrated profile and fails closed on an occupied desktop port",
    async () => {
      const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
      const first = await startPackagedServer(3064, profile);

      try {
        const category = await requestJson(first.origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Persistent profile" }),
        });
        expect(category.response.status).toBe(201);
      } finally {
        await stopPackagedServer(first.child);
      }

      const second = await startPackagedServer(3064, profile);
      try {
        const categories = await requestJson(second.origin, "/api/categories");
        expect(categories.response.ok).toBe(true);
        expect(
          (categories.body.data as Array<{ name: string }>).some(
            (category) => category.name === "Persistent profile",
          ),
        ).toBe(true);

        const Database = require(
          path.join(standaloneRoot, "node_modules", "better-sqlite3"),
        ) as new (file: string) => {
          prepare: (sql: string) => { get: () => { count: number } };
          close: () => void;
        };
        const database = new Database(second.databasePath);
        try {
          const migrations = database
            .prepare("SELECT COUNT(*) AS count FROM _prisma_migrations")
            .get();
          expect(migrations.count).toBeGreaterThan(0);
        } finally {
          database.close();
        }
      } finally {
        await stopPackagedServer(second.child);
      }

      const unrelated = createServer((_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, data: { unrelated: true } }));
      });
      await new Promise<void>((resolve, reject) => {
        unrelated.once("error", reject);
        unrelated.listen(3060, "127.0.0.1", () => resolve());
      });

      const packagedConfig = createRuntimeConfig({
          isPackaged: true,
          projectRoot,
          resourcesPath: projectRoot,
          profileDirectory: await mkdtemp(
            path.join(tmpdir(), "nameh-amal-occupied-"),
          ),
        });
      const runtime = new ServerProcess({
        config: {
          ...packagedConfig,
          runtimeDirectory: runtimeRoot,
          standaloneDirectory: standaloneRoot,
          serverScriptPath: path.join(standaloneRoot, "server.js"),
          migrationDirectory: path.join(runtimeRoot, "prisma", "migrations"),
          prismaSchemaPath: path.join(runtimeRoot, "prisma", "schema.prisma"),
          prismaConfigPath: path.join(runtimeRoot, "prisma.config.ts"),
          prismaCliPath: path.join(
            runtimeRoot,
            "node_modules",
            "prisma",
            "build",
            "index.js",
          ),
        },
      });
      try {
        await expect(runtime.start()).rejects.toMatchObject({
          code: "PORT_CONFLICT",
        });
      } finally {
        await runtime.stop();
        await closeHttpServer(unrelated);
      }
    },
    45_000,
  );

  it(
    "preserves tracking, review, organization, timezone, and backup APIs",
    async () => {
      const { child, origin } = await startPackagedServer(3062);

      try {
        const settings = await requestJson(origin, "/api/settings");
        expect(settings.response.ok).toBe(true);
        expect(
          (settings.body.data as { timeZone: string }).timeZone,
        ).toBe("Asia/Yerevan");

        const work = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Work",
            color: "#2563EB",
            weeklyTargetHours: 20,
          }),
        });
        const workId = (work.body.data as { id: string }).id;
        expect(work.response.status).toBe(201);

        const personal = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Personal", weeklyTargetHours: 4 }),
        });
        const personalId = (personal.body.data as { id: string }).id;

        const activity = await requestJson(origin, "/api/activities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Planning",
            categoryId: workId,
            defaultDurationSeconds: 1_800,
            isPinned: true,
          }),
        });
        const activityId = (activity.body.data as { id: string }).id;
        expect(activity.response.status).toBe(201);

        const manual = await requestJson(origin, "/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "MANUAL",
            title: "Planning",
            categoryId: workId,
            timeZone: "UTC",
            startedAt: "2026-09-10T09:00:00.000Z",
            endedAt: "2026-09-10T09:30:00.000Z",
          }),
        });
        expect(manual.response.status).toBe(201);
        expect(
          (manual.body.data as { durationSeconds: number }).durationSeconds,
        ).toBe(1_800);

        const dstSession = await requestJson(origin, "/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "MANUAL",
            categoryId: workId,
            timeZone: "America/New_York",
            startedAt: "2026-03-08T06:30:00.000Z",
            endedAt: "2026-03-08T07:30:00.000Z",
          }),
        });
        expect(dstSession.response.status).toBe(201);
        expect(
          (dstSession.body.data as { timeZoneOffsetMinutes: number })
            .timeZoneOffsetMinutes,
        ).toBe(-300);

        const filtered = await requestJson(
          origin,
          `/api/sessions?categoryId=${workId}&occurredFrom=2026-09-10T00:00:00.000Z&occurredTo=2026-09-10T23:59:59.999Z`,
        );
        const filteredSessions = filtered.body.data as Array<{ categoryId: string }>;
        expect(filteredSessions).toHaveLength(1);
        expect(filteredSessions[0].categoryId).toBe(workId);

        const stats = await requestJson(
          origin,
          "/api/stats/categories?occurredFrom=2026-09-01T00:00:00.000Z&occurredTo=2026-09-30T23:59:59.999Z",
        );
        const statsData = stats.body.data as {
          totalSeconds: number;
          byCategory: Array<{ percent: number }>;
        };
        expect(statsData.totalSeconds).toBe(1_800);
        expect(statsData.byCategory[0].percent).toBe(100);

        const trackerStart = await requestJson(origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "start",
            categoryId: personalId,
            title: "Focus",
            timeZone: "UTC",
            startedAt: new Date(Date.now() - 90_000).toISOString(),
          }),
        });
        const activeTimerId = (trackerStart.body.data as { id: string }).id;
        expect(trackerStart.response.status).toBe(201);

        const duplicateStart = await requestJson(origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", categoryId: workId }),
        });
        expect(duplicateStart.response.status).toBe(409);

        const stopped = await requestJson(origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: activeTimerId }),
        });
        expect(stopped.response.ok).toBe(true);
        const stoppedSession = stopped.body.data as {
          kind: string;
          durationSeconds: number;
        };
        expect(stoppedSession.kind).toBe("TIMER");
        expect(stoppedSession.durationSeconds).toBeGreaterThan(0);

        const archivedCategory = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(personalId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: true }),
          },
        );
        expect(archivedCategory.response.ok).toBe(true);
        const activeCategories = await requestJson(origin, "/api/categories");
        const activeCategoryRows = activeCategories.body.data as Array<{ id: string }>;
        expect(activeCategoryRows.some((category) => category.id === personalId)).toBe(false);
        const allCategories = await requestJson(
          origin,
          "/api/categories?includeArchived=1",
        );
        const allCategoryRows = allCategories.body.data as Array<{ id: string }>;
        expect(allCategoryRows.some((category) => category.id === personalId)).toBe(true);

        const blockedDelete = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(workId)}`,
          { method: "DELETE" },
        );
        expect(blockedDelete.response.status).toBe(409);
        const emptyCategory = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "To delete" }),
        });
        const emptyCategoryId = (emptyCategory.body.data as { id: string }).id;
        const deleted = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(emptyCategoryId)}`,
          { method: "DELETE" },
        );
        expect(deleted.response.ok).toBe(true);

        const archivedActivity = await requestJson(
          origin,
          `/api/activities/${encodeURIComponent(activityId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: true }),
          },
        );
        expect(archivedActivity.response.ok).toBe(true);
        const activeActivities = await requestJson(origin, "/api/activities");
        const activeActivityRows = activeActivities.body.data as Array<{ id: string }>;
        expect(activeActivityRows.some((activityRow) => activityRow.id === activityId)).toBe(false);
        const allActivities = await requestJson(
          origin,
          "/api/activities?includeArchived=1",
        );
        const allActivityRows = allActivities.body.data as Array<{ id: string }>;
        expect(allActivityRows.some((activityRow) => activityRow.id === activityId)).toBe(true);

        const restoredActivity = await requestJson(
          origin,
          `/api/activities/${encodeURIComponent(activityId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: false, sortOrder: -1 }),
          },
        );
        expect(restoredActivity.response.ok).toBe(true);

        const exported = await fetch(`${origin}/api/data/export`);
        const exportBody = JSON.parse(await exported.text()) as {
          version: number;
          sessions: unknown[];
        };
        expect(exported.ok).toBe(true);
        expect(exportBody.version).toBe(2);
        expect(exportBody.sessions.length).toBeGreaterThanOrEqual(3);

        const beforeInvalidImport = await requestJson(origin, "/api/sessions?limit=500");
        const invalidImport = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: 99, categories: [], sessions: [] }),
        });
        expect(invalidImport.response.status).toBe(400);
        const afterInvalidImport = await requestJson(origin, "/api/sessions?limit=500");
        const beforeSessions = beforeInvalidImport.body.data as unknown[];
        const afterSessions = afterInvalidImport.body.data as unknown[];
        expect(afterSessions).toHaveLength(beforeSessions.length);

        const validImport = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: 2,
            categories: [{ name: "Imported", weeklyTargetHours: 2 }],
            sessions: [
              {
                kind: "MANUAL",
                categoryName: "Imported",
                occurredAt: "2026-09-12T10:00:00.000Z",
                startedAt: "2026-09-12T10:00:00.000Z",
                endedAt: "2026-09-12T10:05:00.000Z",
                durationSeconds: 300,
                timeZone: "UTC",
                timeZoneOffsetMinutes: 0,
              },
            ],
          }),
        });
        expect(validImport.response.ok).toBe(true);
        const importData = validImport.body.data as {
          sessionsCreated: number;
          warnings: string[];
        };
        expect(importData.sessionsCreated).toBe(1);
        expect(importData.warnings.length).toBeGreaterThan(0);

        for (const route of ["/", "/stats", "/settings", "/pomodoro"]) {
          const page = await fetch(`${origin}${route}`);
          expect(page.ok).toBe(true);
        }
      } finally {
        await stopPackagedServer(child);
      }
    },
    45_000,
  );

  it(
    "recovers one active timer after a staged-server restart and finalizes it once",
    async () => {
      const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
      const first = await startPackagedServer(3065, profile);
      let categoryId = "";
      let activeTimerId = "";

      try {
        const category = await requestJson(first.origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Recovered timer" }),
        });
        categoryId = (category.body.data as { id: string }).id;

        const started = await requestJson(first.origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "start",
            categoryId,
            title: "Restart-safe focus",
            timeZone: "UTC",
            startedAt: new Date(Date.now() - 120_000).toISOString(),
          }),
        });
        expect(started.response.status).toBe(201);
        activeTimerId = (started.body.data as { id: string }).id;
      } finally {
        await stopPackagedServer(first.child);
      }

      const second = await startPackagedServer(3065, profile);
      try {
        const recovered = await requestJson(second.origin, "/api/tracker");
        expect(recovered.response.ok).toBe(true);
        expect((recovered.body.data as { id: string }).id).toBe(activeTimerId);

        const duplicate = await requestJson(second.origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", categoryId }),
        });
        expect(duplicate.response.status).toBe(409);

        const stopped = await requestJson(second.origin, "/api/tracker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "stop", sessionId: activeTimerId }),
        });
        expect(stopped.response.ok).toBe(true);
        expect((stopped.body.data as { durationSeconds: number }).durationSeconds).toBeGreaterThan(0);

        const sessions = await requestJson(
          second.origin,
          `/api/sessions?categoryId=${encodeURIComponent(categoryId)}&limit=500`,
        );
        const finalizedTimers = (sessions.body.data as Array<{ kind: string }>).filter(
          (session) => session.kind === "TIMER",
        );
        expect(finalizedTimers).toHaveLength(1);

        const afterStop = await requestJson(second.origin, "/api/tracker");
        expect(afterStop.body.data).toBeNull();
      } finally {
        await stopPackagedServer(second.child);
      }
    },
    45_000,
  );

  it(
    "covers adjacent-day ranges, weekly goals, archived history, and activity presets",
    async () => {
      const { child, origin } = await startPackagedServer(3066);

      try {
        const alpha = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Alpha",
            weeklyTargetHours: 2,
            sortOrder: 0,
          }),
        });
        const alphaId = (alpha.body.data as { id: string }).id;
        const beta = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Beta",
            weeklyTargetHours: 4,
            sortOrder: 1,
          }),
        });
        const betaId = (beta.body.data as { id: string }).id;

        const activityA = await requestJson(origin, "/api/activities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Focus planning",
            categoryId: betaId,
            sortOrder: 2,
            isPinned: true,
          }),
        });
        const activityId = (activityA.body.data as { id: string }).id;
        await requestJson(origin, "/api/activities", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: "Routine planning",
            categoryId: betaId,
            sortOrder: 1,
          }),
        });

        for (const session of [
          {
            categoryId: alphaId,
            occurredAt: "2026-09-07T10:00:00.000Z",
            durationSeconds: 3_600,
          },
          {
            categoryId: alphaId,
            occurredAt: "2026-09-13T10:00:00.000Z",
            durationSeconds: 1_800,
          },
          {
            categoryId: betaId,
            occurredAt: "2026-09-08T10:00:00.000Z",
            durationSeconds: 1_800,
          },
        ]) {
          const created = await requestJson(origin, "/api/sessions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "MANUAL",
              timeZone: "UTC",
              ...session,
            }),
          });
          expect(created.response.status).toBe(201);
        }

        const monday = await requestJson(
          origin,
          `/api/sessions?categoryId=${alphaId}&occurredFrom=2026-09-07T00:00:00.000Z&occurredTo=2026-09-07T23:59:59.999Z`,
        );
        expect(monday.response.ok).toBe(true);
        expect(monday.body.data).toHaveLength(1);

        const tuesday = await requestJson(
          origin,
          `/api/sessions?categoryId=${betaId}&occurredFrom=2026-09-08T00:00:00.000Z&occurredTo=2026-09-08T23:59:59.999Z`,
        );
        expect(tuesday.response.ok).toBe(true);
        expect(tuesday.body.data).toHaveLength(1);

        const weekStats = await requestJson(
          origin,
          "/api/stats/categories?occurredFrom=2026-09-07T00:00:00.000Z&occurredTo=2026-09-13T23:59:59.999Z",
        );
        const statsData = weekStats.body.data as {
          totalSeconds: number;
          byCategory: Array<{ categoryId: string; seconds: number; percent: number }>;
        };
        expect(statsData.totalSeconds).toBe(7_200);
        expect(statsData.byCategory).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              categoryId: alphaId,
              seconds: 5_400,
              percent: 75,
            }),
            expect.objectContaining({
              categoryId: betaId,
              seconds: 1_800,
              percent: 25,
            }),
          ]),
        );

        const customStats = await requestJson(
          origin,
          "/api/stats/categories?occurredFrom=2026-09-07T00:00:00.000Z&occurredTo=2026-09-08T23:59:59.999Z",
        );
        expect(
          (customStats.body.data as { totalSeconds: number }).totalSeconds,
        ).toBe(5_400);

        const weeklyCategories = await requestJson(
          origin,
          "/api/categories?includeArchived=1",
        );
        expect(
          (weeklyCategories.body.data as Array<{ id: string; weeklyTargetHours: number }>).find(
            (category) => category.id === alphaId,
          )?.weeklyTargetHours,
        ).toBe(2);
        expect(
          (weeklyCategories.body.data as Array<{ id: string; weeklyTargetHours: number }>).find(
            (category) => category.id === betaId,
          )?.weeklyTargetHours,
        ).toBe(4);

        const archived = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(alphaId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: true }),
          },
        );
        expect(archived.response.ok).toBe(true);

        const activeCategories = await requestJson(origin, "/api/categories");
        expect(
          (activeCategories.body.data as Array<{ id: string }>).some(
            (category) => category.id === alphaId,
          ),
        ).toBe(false);
        const historical = await requestJson(
          origin,
          `/api/sessions?categoryId=${encodeURIComponent(alphaId)}&limit=500`,
        );
        expect(historical.body.data).toHaveLength(2);

        const blockedDelete = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(alphaId)}`,
          { method: "DELETE" },
        );
        expect(blockedDelete.response.status).toBe(409);

        const emptyCategory = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Empty category" }),
        });
        const emptyCategoryId = (emptyCategory.body.data as { id: string }).id;
        const deleted = await requestJson(
          origin,
          `/api/categories/${encodeURIComponent(emptyCategoryId)}`,
          { method: "DELETE" },
        );
        expect(deleted.response.ok).toBe(true);

        const activities = await requestJson(origin, "/api/activities");
        const activeActivities = activities.body.data as Array<{
          id: string;
          title: string;
          isPinned: boolean;
        }>;
        expect(activeActivities[0]).toMatchObject({
          title: "Focus planning",
          isPinned: true,
        });
        expect(
          activeActivities.filter((activity) =>
            activity.title.toLowerCase().includes("focus"),
          ),
        ).toHaveLength(1);

        const archivedActivity = await requestJson(
          origin,
          `/api/activities/${encodeURIComponent(activityId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: true }),
          },
        );
        expect(archivedActivity.response.ok).toBe(true);
        const withoutArchivedActivity = await requestJson(origin, "/api/activities");
        expect(
          (withoutArchivedActivity.body.data as Array<{ id: string }>).some(
            (activity) => activity.id === activityId,
          ),
        ).toBe(false);

        const restoredActivity = await requestJson(
          origin,
          `/api/activities/${encodeURIComponent(activityId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isArchived: false, sortOrder: 0 }),
          },
        );
        expect(restoredActivity.response.ok).toBe(true);
        const restoredActivities = await requestJson(origin, "/api/activities");
        expect(
          (restoredActivities.body.data as Array<{ id: string }>).some(
            (activity) => activity.id === activityId,
          ),
        ).toBe(true);
      } finally {
        await stopPackagedServer(child);
      }
    },
    45_000,
  );

  it(
    "merges imported categories and targets while retaining duplicate-session compatibility",
    async () => {
      const { child, origin } = await startPackagedServer(3067);

      try {
        const existing = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Shared category",
            weeklyTargetHours: 1,
          }),
        });
        expect(existing.response.status).toBe(201);

        const backup = {
          version: 2,
          categories: [
            { name: "Shared category", weeklyTargetHours: 3 },
            { name: "Imported category", weeklyTargetHours: 4 },
          ],
          sessions: [
            {
              kind: "MANUAL",
              categoryName: "Shared category",
              occurredAt: "2026-09-14T10:00:00.000Z",
              durationSeconds: 600,
              timeZone: "UTC",
              timeZoneOffsetMinutes: 0,
            },
            {
              kind: "MANUAL",
              categoryName: "Imported category",
              occurredAt: "2026-09-14T11:00:00.000Z",
              durationSeconds: 900,
              timeZone: "UTC",
              timeZoneOffsetMinutes: 0,
            },
          ],
        };

        const firstImport = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(backup),
        });
        expect(firstImport.response.ok).toBe(true);
        expect(firstImport.body.data).toMatchObject({
          categoriesCreated: 1,
          categoriesUpdated: 1,
          sessionsCreated: 2,
        });
        expect(
          (firstImport.body.data as { warnings: string[] }).warnings.length,
        ).toBeGreaterThan(0);

        const categories = await requestJson(
          origin,
          "/api/categories?includeArchived=1",
        );
        const categoryRows = categories.body.data as Array<{
          name: string;
          weeklyTargetHours: number | null;
        }>;
        expect(categoryRows.filter((category) => category.name === "Shared category")).toHaveLength(1);
        expect(
          categoryRows.find((category) => category.name === "Shared category")
            ?.weeklyTargetHours,
        ).toBe(3);
        expect(
          categoryRows.find((category) => category.name === "Imported category")
            ?.weeklyTargetHours,
        ).toBe(4);

        const secondImport = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(backup),
        });
        expect(secondImport.response.ok).toBe(true);
        expect(secondImport.body.data).toMatchObject({
          categoriesCreated: 0,
          categoriesUpdated: 2,
          sessionsCreated: 2,
        });
        expect(
          (secondImport.body.data as { warnings: string[] }).warnings.length,
        ).toBeGreaterThan(0);

        const sessions = await requestJson(origin, "/api/sessions?limit=500");
        expect(sessions.body.data).toHaveLength(4);
      } finally {
        await stopPackagedServer(child);
      }
    },
    45_000,
  );

  it(
    "rejects malformed and failed imports without partial writes",
    async () => {
      const { child, origin } = await startPackagedServer(3068);

      try {
        const existingCategory = await requestJson(origin, "/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Existing import data" }),
        });
        const existingCategoryId = (existingCategory.body.data as { id: string }).id;
        const existingSession = await requestJson(origin, "/api/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "MANUAL",
            categoryId: existingCategoryId,
            occurredAt: "2026-09-15T10:00:00.000Z",
            durationSeconds: 300,
            timeZone: "UTC",
          }),
        });
        expect(existingSession.response.status).toBe(201);

        const snapshot = async () => {
          const categories = await requestJson(
            origin,
            "/api/categories?includeArchived=1",
          );
          const sessions = await requestJson(origin, "/api/sessions?limit=500");
          return {
            categoryNames: (categories.body.data as Array<{ name: string }>).map(
              (category) => category.name,
            ),
            sessionCount: (sessions.body.data as unknown[]).length,
          };
        };
        const before = await snapshot();

        const malformedResponse = await fetch(`${origin}/api/data/import`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        });
        const malformedBody = JSON.parse(
          await malformedResponse.text(),
        ) as ApiBody;
        expect(malformedResponse.status).toBe(400);
        expect(malformedBody.ok).toBe(false);

        const unreadable = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(null),
        });
        expect(unreadable.response.status).toBe(400);
        expect(unreadable.body.ok).toBe(false);

        const unsupported = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: 99, categories: [], sessions: [] }),
        });
        expect(unsupported.response.status).toBe(400);
        expect(unsupported.body.ok).toBe(false);

        const partiallyInvalid = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: 2,
            categories: [{ name: "Should not be created" }],
            sessions: [
              {
                kind: "MANUAL",
                categoryName: "Should not be created",
                occurredAt: "not-a-date",
                durationSeconds: 60,
                timeZone: "UTC",
              },
            ],
          }),
        });
        expect(partiallyInvalid.response.status).toBe(400);
        expect(partiallyInvalid.body.ok).toBe(false);

        const transactionFailure = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: 2,
            categories: [{ name: "Rolled back category" }],
            sessions: [
              {
                kind: "MANUAL",
                categoryName: "Missing category",
                occurredAt: "2026-09-15T11:00:00.000Z",
                durationSeconds: 60,
                timeZone: "UTC",
              },
            ],
          }),
        });
        expect(transactionFailure.response.ok).toBe(false);
        expect(transactionFailure.body.ok).toBe(false);

        const after = await snapshot();
        expect(after).toEqual(before);
        expect(after.categoryNames).not.toContain("Should not be created");
        expect(after.categoryNames).not.toContain("Rolled back category");
      } finally {
        await stopPackagedServer(child);
      }
    },
    45_000,
  );

  it(
    "leaves an interrupted packaged import either complete or transactionally empty",
    async () => {
      const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
      const first = await startPackagedServer(3069, profile);
      const sessions = Array.from({ length: 1_000 }, (_, index) => ({
        kind: "MANUAL",
        categoryName: "Shutdown import",
        occurredAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
        durationSeconds: 60,
        timeZone: "UTC",
        timeZoneOffsetMinutes: 0,
      }));
      const controller = new AbortController();
      const pendingImport = fetch(`${first.origin}/api/data/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: 2,
          categories: [{ name: "Shutdown import" }],
          sessions,
        }),
        signal: controller.signal,
      });

      await stopPackagedServer(first.child);
      controller.abort();

      let importReportedSuccess = false;
      try {
        importReportedSuccess = (await pendingImport).ok;
      } catch {
        importReportedSuccess = false;
      }

      const recovered = await startPackagedServer(3069, profile);
      try {
        const stored = await requestJson(
          recovered.origin,
          "/api/stats/categories?occurredFrom=2026-09-01T00:00:00.000Z&occurredTo=2026-09-30T23:59:59.999Z",
        );
        const storedSeconds = (
          stored.body.data as { totalSeconds: number }
        ).totalSeconds;
        expect([0, 60_000]).toContain(storedSeconds);
        if (importReportedSuccess) {
          expect(storedSeconds).toBe(60_000);
        }
      } finally {
        await stopPackagedServer(recovered.child);
      }
    },
    60_000,
  );

  it(
    "handles close during save and export without false success",
    async () => {
      const profile = await mkdtemp(path.join(tmpdir(), "nameh-amal-package-"));
      const first = await startPackagedServer(3070, profile);
      const category = await requestJson(first.origin, "/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Close operation" }),
      });
      const categoryId = (category.body.data as { id: string }).id;
      const saveController = new AbortController();
      const exportController = new AbortController();
      const pendingSave = fetch(`${first.origin}/api/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "MANUAL",
            categoryId,
            occurredAt: "2026-09-16T10:00:00.000Z",
            durationSeconds: 300,
            timeZone: "UTC",
          }),
          signal: saveController.signal,
        }).then(
          (response) => ({ response }),
          (error) => ({ error }),
        );
      const pendingExport = fetch(`${first.origin}/api/data/export`, {
        signal: exportController.signal,
      }).then(
        (response) => ({ response }),
        (error) => ({ error }),
      );

      await stopPackagedServer(first.child);
      saveController.abort();
      exportController.abort();

      const saveResult = await pendingSave;
      const saveReportedSuccess =
        "response" in saveResult && saveResult.response.ok;

      const exportResult = await pendingExport;
      if ("response" in exportResult && exportResult.response.ok) {
          const payload = JSON.parse(
            await exportResult.response.text(),
          ) as { version: number };
          expect(payload.version).toBe(2);
      }

      const recovered = await startPackagedServer(3070, profile);
      try {
        const sessions = await requestJson(
          recovered.origin,
          `/api/sessions?categoryId=${encodeURIComponent(categoryId)}&limit=500`,
        );
        const sessionCount = (sessions.body.data as unknown[]).length;
        expect([0, 1]).toContain(sessionCount);
        if (saveReportedSuccess) {
          expect(sessionCount).toBe(1);
        }
      } finally {
        await stopPackagedServer(recovered.child);
      }
    },
    45_000,
  );

  it(
    "imports a generated 1,000-session backup and reports valid records",
    async () => {
      const { child, origin } = await startPackagedServer(3063);

      try {
        const sessions = Array.from({ length: 1_000 }, (_, index) => ({
          kind: "MANUAL",
          categoryName: "Bulk import",
          occurredAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
          startedAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
          endedAt: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T10:01:00.000Z`,
          durationSeconds: 60,
          timeZone: "UTC",
          timeZoneOffsetMinutes: 0,
        }));
        const imported = await requestJson(origin, "/api/data/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            version: 2,
            categories: [{ name: "Bulk import" }],
            sessions,
          }),
        });

        expect(imported.response.ok).toBe(true);
        const importData = imported.body.data as {
          sessionsCreated: number;
          warnings: string[];
        };
        expect(importData.sessionsCreated).toBe(1_000);
        expect(importData.warnings).toEqual(expect.any(Array));
      } finally {
        await stopPackagedServer(child);
      }
    },
    60_000,
  );
});
