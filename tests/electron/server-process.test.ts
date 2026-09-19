import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRuntimeConfig } from "../../electron/runtime-config";
import {
  DesktopRuntimeError,
  ServerProcess,
  type CommandRunner,
} from "../../electron/server-process";

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  signals: NodeJS.Signals[];
  kill: (signal?: NodeJS.Signals) => boolean;
};

function createFakeChild(options: { exitOnTerminate?: boolean } = {}): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.signals = [];
  child.kill = (signal = "SIGTERM") => {
    child.signals.push(signal);
    if (signal === "SIGKILL" || options.exitOnTerminate !== false) {
      child.signalCode = signal;
      child.emit("exit", null, signal);
    }
    return true;
  };
  return child;
}

async function createTestConfig() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "nameh-amal-"));
  const config = createRuntimeConfig({
    projectRoot,
    profileDirectory: path.join(projectRoot, "profile"),
  });
  await mkdir(path.dirname(config.serverScriptPath), { recursive: true });
  await mkdir(config.migrationDirectory, { recursive: true });
  await mkdir(path.dirname(config.prismaCliPath), { recursive: true });
  await writeFile(config.serverScriptPath, "");
  await writeFile(config.prismaSchemaPath, "");
  await writeFile(config.prismaCliPath, "");
  return config;
}

const successfulMigration: CommandRunner = async () => ({
  stdout: "Database schema is up to date",
  stderr: "",
});

describe("desktop server process", () => {
  it("runs migrations before starting and reaches readiness", async () => {
    const config = await createTestConfig();
    const calls: string[] = [];
    const child = createFakeChild();
    const process = new ServerProcess({
      config,
      runCommand: async (...args) => {
        calls.push(`command:${args[1].join(" ")}`);
        return successfulMigration(...args);
      },
      spawnProcess: () => {
        calls.push("spawn");
        return child as unknown as ChildProcess;
      },
      fetcher: async () => ({ ok: true, status: 200 }),
      isPortOccupied: async () => false,
    });

    await process.start();
    expect(calls[0]).toContain("migrate deploy");
    expect(calls[1]).toBe("spawn");
    expect(process.isReady).toBe(true);

    await process.stop();
    expect(process.isReady).toBe(false);
    expect(child.signalCode).toBe("SIGTERM");
  });

  it("cancels startup when shutdown begins during migration", async () => {
    const config = await createTestConfig();
    let migrationStarted!: () => void;
    let finishMigration!: (result: { stdout: string; stderr: string }) => void;
    const migrationReady = new Promise<void>((resolve) => {
      migrationStarted = resolve;
    });
    const migration = new Promise<{ stdout: string; stderr: string }>((resolve) => {
      finishMigration = resolve;
    });
    let launched = false;
    const process = new ServerProcess({
      config,
      runCommand: async () => {
        migrationStarted();
        return migration;
      },
      spawnProcess: () => {
        launched = true;
        return createFakeChild() as unknown as ChildProcess;
      },
    });

    const startup = process.start();
    await migrationReady;
    await process.stop();
    finishMigration({ stdout: "migration complete", stderr: "" });

    await expect(startup).rejects.toMatchObject({
      code: "STARTUP_CANCELLED",
    } satisfies Partial<DesktopRuntimeError>);
    expect(launched).toBe(false);
    expect(process.isReady).toBe(false);
  });

  it("reports migration failures with the database recovery path", async () => {
    const config = await createTestConfig();
    const process = new ServerProcess({
      config,
      runCommand: async () => {
        throw new Error("migration failed");
      },
    });

    await expect(process.start()).rejects.toMatchObject({
      code: "MIGRATION_FAILED",
      message: expect.stringContaining(config.databasePath),
    } satisfies Partial<DesktopRuntimeError>);
  });

  it("rejects an occupied desktop port before launching the server", async () => {
    const config = await createTestConfig();
    let launched = false;
    const process = new ServerProcess({
      config,
      runCommand: successfulMigration,
      spawnProcess: () => {
        launched = true;
        return createFakeChild() as unknown as ChildProcess;
      },
      isPortOccupied: async () => true,
    });

    await expect(process.start()).rejects.toMatchObject({
      code: "PORT_CONFLICT",
      message: expect.stringContaining(`${config.host}:${config.port}`),
    } satisfies Partial<DesktopRuntimeError>);
    expect(launched).toBe(false);
  });

  it("reports a child crash while waiting for readiness", async () => {
    const config = await createTestConfig();
    const child = createFakeChild();
    const process = new ServerProcess({
      config,
      runCommand: successfulMigration,
      spawnProcess: () => child as unknown as ChildProcess,
      fetcher: async () => {
        child.exitCode = 1;
        child.emit("exit", 1, null);
        return { ok: false, status: 503 };
      },
      sleep: async () => undefined,
      isPortOccupied: async () => false,
    });

    await expect(process.start()).rejects.toMatchObject({
      code: "SERVER_CRASHED",
    } satisfies Partial<DesktopRuntimeError>);
  });

  it("writes migration, child, and readiness events to the profile log", async () => {
    const config = await createTestConfig();
    const process = new ServerProcess({
      config,
      runCommand: successfulMigration,
      spawnProcess: () => createFakeChild() as unknown as ChildProcess,
      fetcher: async () => ({ ok: true, status: 200 }),
      isPortOccupied: async () => false,
    });

    await process.start();
    const logPath = process.logPath;
    expect(logPath).toBe(path.join(config.logDirectory, "desktop-runtime.log"));
    await process.stop();

    expect(await readFile(logPath ?? "", "utf8")).toContain("readiness succeeded");
  });

  it("stops waiting when readiness times out", async () => {
    const config = await createTestConfig();
    const child = createFakeChild();
    const process = new ServerProcess({
      config,
      startupTimeoutMs: 5,
      readinessIntervalMs: 1,
      runCommand: successfulMigration,
      spawnProcess: () => child as unknown as ChildProcess,
      fetcher: async () => ({ ok: false, status: 503 }),
      sleep: async () => undefined,
      isPortOccupied: async () => false,
    });

    await expect(process.start()).rejects.toMatchObject({
      code: "READINESS_TIMEOUT",
    } satisfies Partial<DesktopRuntimeError>);
    expect(child.signalCode).toBe("SIGTERM");
  });

  it("forcefully stops a child that ignores the normal shutdown signal", async () => {
    const config = await createTestConfig();
    const child = createFakeChild({ exitOnTerminate: false });
    const process = new ServerProcess({
      config,
      shutdownTimeoutMs: 1,
      runCommand: successfulMigration,
      spawnProcess: () => child as unknown as ChildProcess,
      fetcher: async () => ({ ok: true, status: 200 }),
      isPortOccupied: async () => false,
    });

    await process.start();
    await process.stop();

    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
