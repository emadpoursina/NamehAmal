import { copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

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
const nextStandaloneNativeModule = path.join(
  projectRoot,
  ".next",
  "standalone",
  "node_modules",
  "better-sqlite3",
  "build",
  "Release",
  "better_sqlite3.node",
);

function run(command, args, extraEnvironment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnvironment,
      },
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ?? `exit code ${code}`
          }`,
        ),
      );
    });
  });
}

try {
  // The standalone server runs inside Electron, whose native-module ABI differs
  // from the system Node ABI. Stage the Electron build for the server runtime.
  await run(npmCommand, ["run", "desktop:prepare"], {
    DESKTOP_PACKAGE_NATIVE: "1",
  });
  // The un-packaged Electron main process launches .next/standalone directly;
  // stage the Electron ABI there as well as in the distributable runtime.
  await copyFile(stagedNativeModule, nextStandaloneNativeModule);
  await run(npmCommand, ["run", "desktop:compile"]);
  await run("electron", ["."]);
} finally {
  // electron-rebuild replaces the root module too; restore it for Node tooling.
  await run(npmCommand, ["rebuild", "better-sqlite3"]);
  // Keep generated runtimes Node-compatible after dev exits so packaged-runtime
  // tests can run. The next desktop:dev invocation stages the Electron ABI again.
  for (const destination of [stagedNativeModule, nextStandaloneNativeModule]) {
    try {
      await copyFile(rootNativeModule, destination);
    } catch (error) {
      const code =
        error !== null && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}
