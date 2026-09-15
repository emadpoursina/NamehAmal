import { copyFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2);
const targetArch = args.includes("--x64")
  ? "x64"
  : args.includes("--arm64")
    ? "arm64"
    : process.arch;

function run(command, commandArgs, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      env: {
        ...process.env,
        DESKTOP_ARCH: targetArch,
        ...extraEnvironment,
        CSC_IDENTITY_AUTO_DISCOVERY:
          process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? "false",
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${commandArgs.join(" ")} failed with ${signal ?? `exit code ${code}`}`,
        ),
      );
    });
  });
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projectRoot = process.cwd();
const rootNativeModule = path.join(
  projectRoot,
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);
const stagedNativeModule = path.join(
  projectRoot,
  ".desktop-runtime",
  "standalone",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);

async function restoreStagedNativeModules() {
  const nativeModulePaths = [stagedNativeModule];
  const tracedNodeModules = path.join(
    projectRoot,
    ".desktop-runtime",
    "standalone",
    ".next",
    "node_modules",
  );

  try {
    const entries = await readdir(tracedNodeModules, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith("better-sqlite3-")) {
        nativeModulePaths.push(
          path.join(
            tracedNodeModules,
            entry.name,
            "build",
            "Release",
            "better_sqlite3.node",
          ),
        );
      }
    }
  } catch {
    // The main staged module is still restored below.
  }

  await Promise.all(
    nativeModulePaths.map((destination) =>
      copyFile(rootNativeModule, destination),
    ),
  );
}

await run(npmCommand, ["run", "desktop:prepare"], {
  DESKTOP_PACKAGE_NATIVE: "1",
});
await run(npmCommand, ["run", "desktop:compile"]);
try {
  await run("electron-builder", args);
} finally {
  await run(npmCommand, ["rebuild", "better-sqlite3"]);
  await restoreStagedNativeModules();
}
