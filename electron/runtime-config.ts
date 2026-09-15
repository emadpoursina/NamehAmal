import path from "node:path";

export const DESKTOP_HOST = "127.0.0.1";
export const DESKTOP_PORT = 3060;
export const DESKTOP_ORIGIN = `http://${DESKTOP_HOST}:${DESKTOP_PORT}`;
export const DATABASE_FILENAME = "nameh-amal.db";

export interface RuntimeConfigOptions {
  isPackaged?: boolean;
  projectRoot?: string;
  resourcesPath?: string;
  userDataDirectory?: string;
  profileDirectory?: string;
  databaseUrl?: string;
}

export interface RuntimeConfig {
  isPackaged: boolean;
  projectRoot: string;
  runtimeDirectory: string;
  standaloneDirectory: string;
  serverScriptPath: string;
  migrationDirectory: string;
  prismaSchemaPath: string;
  prismaConfigPath: string;
  prismaCliPath: string;
  userDataDirectory: string;
  databasePath: string;
  databaseUrl: string;
  logDirectory: string;
  host: typeof DESKTOP_HOST;
  port: typeof DESKTOP_PORT;
  origin: typeof DESKTOP_ORIGIN;
}

export function resolveDatabasePath(databaseUrl: string, baseDirectory: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      `DATABASE_URL must be a sqlite file: URL (got: ${JSON.stringify(databaseUrl)})`,
    );
  }

  const rawPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]);
  if (!rawPath) {
    throw new Error("DATABASE_URL must include a SQLite database path");
  }

  return path.resolve(baseDirectory, rawPath);
}

function toDatabaseUrl(databasePath: string): string {
  return `file:${databasePath}`;
}

export function createRuntimeConfig(options: RuntimeConfigOptions = {}): RuntimeConfig {
  const isPackaged = options.isPackaged ?? false;
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const runtimeDirectory = isPackaged
    ? path.resolve(
        options.resourcesPath ?? path.join(projectRoot, "resources"),
        "desktop-runtime",
      )
    : path.join(projectRoot, ".desktop-runtime");
  const standaloneDirectory = isPackaged
    ? path.join(runtimeDirectory, "standalone")
    : path.join(projectRoot, ".next", "standalone");
  const userDataDirectory = path.resolve(
    options.profileDirectory ??
      options.userDataDirectory ??
      path.join(projectRoot, ".desktop-profile"),
  );
  const databasePath =
    options.profileDirectory || isPackaged
      ? path.join(userDataDirectory, DATABASE_FILENAME)
      : resolveDatabasePath(
          options.databaseUrl ?? process.env.DATABASE_URL ?? "file:./dev.db",
          projectRoot,
        );
  const migrationRoot = isPackaged ? runtimeDirectory : projectRoot;

  return {
    isPackaged,
    projectRoot,
    runtimeDirectory,
    standaloneDirectory,
    serverScriptPath: path.join(standaloneDirectory, "server.js"),
    migrationDirectory: path.join(migrationRoot, "prisma", "migrations"),
    prismaSchemaPath: path.join(migrationRoot, "prisma", "schema.prisma"),
    prismaConfigPath: path.join(migrationRoot, "prisma.config.ts"),
    prismaCliPath: path.join(
      isPackaged ? runtimeDirectory : projectRoot,
      "node_modules",
      "prisma",
      "build",
      "index.js",
    ),
    userDataDirectory,
    databasePath,
    databaseUrl: toDatabaseUrl(databasePath),
    logDirectory: path.join(userDataDirectory, "logs"),
    host: DESKTOP_HOST,
    port: DESKTOP_PORT,
    origin: DESKTOP_ORIGIN,
  };
}

export function buildServerEnvironment(
  config: RuntimeConfig,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...baseEnvironment,
    NODE_ENV: "production",
    HOSTNAME: config.host,
    PORT: String(config.port),
    DATABASE_URL: config.databaseUrl,
    NEXT_TELEMETRY_DISABLED: "1",
  };
}
