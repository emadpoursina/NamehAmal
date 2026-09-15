import { execFile, spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createConnection } from "node:net";
import { access, constants, mkdir, stat } from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";

import {
  buildServerEnvironment,
  type RuntimeConfig,
} from "./runtime-config.js";

export type DesktopRuntimeErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "MIGRATION_FAILED"
  | "PORT_CONFLICT"
  | "SERVER_CRASHED"
  | "READINESS_TIMEOUT"
  | "RUNTIME_NOT_PACKAGED"
  | "STARTUP_CANCELLED";

export class DesktopRuntimeError extends Error {
  readonly code: DesktopRuntimeErrorCode;

  constructor(
    code: DesktopRuntimeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DesktopRuntimeError";
    this.code = code;
  }
}

type CommandOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type CommandResult = {
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options: CommandOptions,
) => Promise<CommandResult>;

type Fetcher = (url: string) => Promise<{ ok: boolean; status: number }>;

export type ServerProcessOptions = {
  config: RuntimeConfig;
  startupTimeoutMs?: number;
  readinessIntervalMs?: number;
  shutdownTimeoutMs?: number;
  runCommand?: CommandRunner;
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess;
  fetcher?: Fetcher;
  sleep?: (milliseconds: number) => Promise<void>;
  isPortOccupied?: (host: string, port: number) => Promise<boolean>;
  onUnexpectedExit?: (error: DesktopRuntimeError) => void;
};

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_READINESS_INTERVAL_MS = 100;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000;
const MAX_LOGGED_CHILD_OUTPUT = 16_000;

function defaultRunCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          Object.assign(error, { stdout, stderr });
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function defaultFetcher(url: string): Promise<{ ok: boolean; status: number }> {
  return fetch(url).then((response) => ({
    ok: response.ok,
    status: response.status,
  }));
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function errorOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return error instanceof Error ? error.message : String(error);
  }

  const record = error as { message?: string; stdout?: string; stderr?: string };
  return [record.message, record.stdout, record.stderr].filter(Boolean).join("\n");
}

function hasAddressInUseMessage(message: string): boolean {
  return /EADDRINUSE|address already in use|listen EADDRINUSE/i.test(message);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isPortOccupied(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (occupied: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(occupied);
    };

    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.setTimeout(500);
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(exited);
    };

    child.once("exit", () => finish(true));
    setTimeout(() => finish(false), timeoutMs);
  });
}

export class ServerProcess {
  private readonly config: RuntimeConfig;
  private readonly startupTimeoutMs: number;
  private readonly readinessIntervalMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly runCommand: CommandRunner;
  private readonly spawnProcess: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => ChildProcess;
  private readonly fetcher: Fetcher;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly isPortOccupied: (
    host: string,
    port: number,
  ) => Promise<boolean>;
  private readonly onUnexpectedExit?: (error: DesktopRuntimeError) => void;
  private child: ChildProcess | null = null;
  private childOutput = "";
  private childError: Error | null = null;
  private childExited = false;
  private stopping = false;
  private ready = false;
  private logStream: WriteStream | null = null;
  private logFilePath: string | null = null;

  constructor(options: ServerProcessOptions) {
    this.config = options.config;
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.readinessIntervalMs =
      options.readinessIntervalMs ?? DEFAULT_READINESS_INTERVAL_MS;
    this.shutdownTimeoutMs =
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.sleep = options.sleep ?? defaultSleep;
    this.isPortOccupied = options.isPortOccupied ?? isPortOccupied;
    this.onUnexpectedExit = options.onUnexpectedExit;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get logPath(): string | null {
    return this.logFilePath;
  }

  async start(): Promise<void> {
    if (this.child) {
      throw new Error("The desktop server process has already been started");
    }

    this.stopping = false;
    await this.prepareRuntime();
    try {
      this.assertStartupActive();
      await this.openLog();
      await this.runMigrations();
      this.assertStartupActive();

      if (await this.isPortOccupied(this.config.host, this.config.port)) {
        throw new DesktopRuntimeError(
          "PORT_CONFLICT",
          `NamehAmal cannot start because ${this.config.host}:${this.config.port} is already in use. Stop the other local service and try again.`,
        );
      }

      await this.launchServer();
      await this.waitForReadiness();
      this.assertStartupActive();
      this.ready = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.stopping = true;
    this.ready = false;

    if (child) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        const exited = await waitForExit(child, this.shutdownTimeoutMs);
        if (!exited && child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await waitForExit(child, this.shutdownTimeoutMs);
        }
      }
      this.child = null;
    }

    if (this.logStream) {
      const logStream = this.logStream;
      if (!logStream.destroyed && !logStream.writableEnded) {
        await new Promise<void>((resolve) => {
          logStream.once("close", resolve);
          logStream.end();
        });
      }
      this.logStream = null;
    }
  }

  private async prepareRuntime(): Promise<void> {
    try {
      await mkdir(this.config.userDataDirectory, { recursive: true });
      await access(
        this.config.userDataDirectory,
        constants.F_OK | constants.R_OK | constants.W_OK,
      );
    } catch (error) {
      throw new DesktopRuntimeError(
        "STORAGE_UNAVAILABLE",
        `NamehAmal cannot access its local data directory at ${this.config.userDataDirectory}. Check its permissions or choose a writable profile, then try again.`,
        { cause: error },
      );
    }

    const requiredPaths = [
      this.config.serverScriptPath,
      this.config.prismaSchemaPath,
      this.config.migrationDirectory,
      this.config.prismaCliPath,
    ];
    if (!(await Promise.all(requiredPaths.map(pathExists))).every(Boolean)) {
      throw new DesktopRuntimeError(
        "RUNTIME_NOT_PACKAGED",
        `The desktop runtime is incomplete. Expected the standalone server, Prisma schema, migrations, and Prisma CLI under ${path.dirname(this.config.serverScriptPath)}.`,
      );
    }
  }

  private async openLog(): Promise<void> {
    try {
      await mkdir(this.config.logDirectory, { recursive: true });
      this.logFilePath = path.join(
        this.config.logDirectory,
        "desktop-runtime.log",
      );
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      this.logStream.on("error", (error) => {
        this.childError = error;
      });
      this.writeLog(`\n[${new Date().toISOString()}] startup\n`);
    } catch (error) {
      throw new DesktopRuntimeError(
        "STORAGE_UNAVAILABLE",
        `NamehAmal cannot write its runtime log at ${this.config.logDirectory}. Check the profile permissions and try again.`,
        { cause: error },
      );
    }
  }

  private writeLog(message: string): void {
    this.logStream?.write(message);
  }

  private assertStartupActive(): void {
    if (this.stopping) {
      throw new DesktopRuntimeError(
        "STARTUP_CANCELLED",
        `NamehAmal startup was cancelled before the local server became ready. No operation was reported as complete. Check ${this.logFilePath ?? "the desktop log"} if a retry is needed.`,
      );
    }
  }

  private async runMigrations(): Promise<void> {
    const environment = {
      ...buildServerEnvironment(this.config),
      ELECTRON_RUN_AS_NODE: "1",
    };
    const command = process.execPath;
    const args = [
      this.config.prismaCliPath,
      "migrate",
      "deploy",
      "--schema",
      this.config.prismaSchemaPath,
    ];

    this.writeLog(`[${new Date().toISOString()}] migrate deploy\n`);
    try {
      const result = await this.runCommand(command, args, {
        cwd: this.config.isPackaged
          ? this.config.runtimeDirectory
          : this.config.projectRoot,
        env: environment,
      });
      this.writeLog(`${result.stdout}\n${result.stderr}\n`);
    } catch (error) {
      const output = errorOutput(error);
      this.writeLog(`[migration failed]\n${output}\n`);
      throw new DesktopRuntimeError(
        "MIGRATION_FAILED",
        `NamehAmal could not prepare the local database at ${this.config.databasePath}. No server was started. Back up the database before repairing permissions or applying the pending migrations. Details are in ${this.logFilePath ?? "the desktop log"}.`,
        { cause: error },
      );
    }
  }

  private async launchServer(): Promise<void> {
    const environment = {
      ...buildServerEnvironment(this.config),
      ELECTRON_RUN_AS_NODE: "1",
    };
    this.childOutput = "";
    this.childError = null;
    this.childExited = false;
    this.writeLog(
      `[${new Date().toISOString()}] starting ${this.config.serverScriptPath}\n`,
    );

    const child = this.spawnProcess(
      process.execPath,
      [this.config.serverScriptPath],
      {
        cwd: this.config.standaloneDirectory,
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child = child;
    child.stdout?.on("data", (chunk: Buffer | string) => {
      this.captureChildOutput(String(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      this.captureChildOutput(String(chunk));
    });
    child.once("error", (error) => {
      this.childError = error;
      this.captureChildOutput(error.message);
    });
    child.once("exit", (code, signal) => {
      this.childExited = true;
      this.writeLog(
        `[${new Date().toISOString()}] child exited code=${String(code)} signal=${String(signal)}\n`,
      );
      if (this.ready && !this.stopping) {
        const error = this.createChildExitError();
        this.onUnexpectedExit?.(error);
      }
    });
  }

  private captureChildOutput(output: string): void {
    this.writeLog(output);
    this.childOutput = `${this.childOutput}${output}`.slice(-MAX_LOGGED_CHILD_OUTPUT);
  }

  private createChildExitError(): DesktopRuntimeError {
    const details = [this.childError?.message, this.childOutput]
      .filter(Boolean)
      .join("\n");
    const code = hasAddressInUseMessage(details)
      ? "PORT_CONFLICT"
      : "SERVER_CRASHED";
    const message =
      code === "PORT_CONFLICT"
        ? `NamehAmal could not claim ${this.config.host}:${this.config.port}; another process may be using the desktop port. Stop it and try again.`
        : `The local NamehAmal server stopped unexpectedly. Reopen the app after checking ${this.logFilePath ?? "the desktop log"}.`;
    return new DesktopRuntimeError(code, message, {
      cause: this.childError ?? undefined,
    });
  }

  private async waitForReadiness(): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs;
    let lastStatus = "no response";

    while (Date.now() < deadline) {
      this.assertStartupActive();
      if (this.childExited || this.childError) {
        throw this.createChildExitError();
      }

      try {
        const response = await this.fetcher(`${this.config.origin}/api/settings`);
        lastStatus = `HTTP ${response.status}`;
        if (response.ok) {
          this.assertStartupActive();
          this.writeLog(
            `[${new Date().toISOString()}] readiness succeeded\n`,
          );
          return;
        }
      } catch (error) {
        lastStatus = error instanceof Error ? error.message : String(error);
      }

      await this.sleep(this.readinessIntervalMs);
    }

    throw new DesktopRuntimeError(
      "READINESS_TIMEOUT",
      `NamehAmal started its local server but it did not become ready within ${this.startupTimeoutMs}ms (${lastStatus}). Check ${this.logFilePath ?? "the desktop log"} and restart the app.`,
    );
  }
}
