import {
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const stageDirectory = path.join(projectRoot, ".desktop-runtime");
const standaloneDirectory = path.join(projectRoot, ".next", "standalone");
// Electron 44.3.0 reports ABI 149, which the installed node-abi table does not know yet.
const electronAbi = "149";

function requiredPath(...parts) {
  return path.join(...parts);
}

async function assertPathExists(filePath, description) {
  try {
    await stat(filePath);
  } catch (error) {
    throw new Error(
      `Desktop packaging requires ${description} at ${filePath}: ${error.message}`,
    );
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
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
          `${command} ${args.join(" ")} failed with ${signal ?? `exit code ${code}`}`,
        ),
      );
    });
  });
}

async function copyRequired(source, destination, description) {
  await assertPathExists(source, description);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}

function resolvePackageDirectory(packageName, fromDirectory) {
  let directory = fromDirectory;
  while (directory !== path.dirname(directory)) {
    const packageDirectory = path.join(
      directory,
      "node_modules",
      packageName,
    );
    try {
      const packageJson = JSON.parse(
        readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
      );
      if (packageJson.name === packageName) {
        return packageDirectory;
      }
    } catch {
      // Keep walking until the package root is found.
    }
    directory = path.dirname(directory);
  }

  throw new Error(`Could not determine the package directory for ${packageName}`);
}

async function copyRuntimeDependencyTree(
  packageName,
  fromDirectory,
  destinationNodeModules,
  copiedPackages,
) {
  const sourceDirectory = resolvePackageDirectory(packageName, fromDirectory);
  if (copiedPackages.has(sourceDirectory)) {
    return;
  }
  copiedPackages.add(sourceDirectory);

  const packageJson = JSON.parse(
    await readFile(path.join(sourceDirectory, "package.json"), "utf8"),
  );
  await copyRequired(
    sourceDirectory,
    path.join(destinationNodeModules, packageName),
    `the ${packageName} runtime dependency`,
  );

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  };
  for (const dependencyName of Object.keys(dependencies)) {
    await copyRuntimeDependencyTree(
      dependencyName,
      sourceDirectory,
      destinationNodeModules,
      copiedPackages,
    );
  }
}

function isPathInside(rootDirectory, candidatePath) {
  const relativePath = path.relative(rootDirectory, candidatePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

async function materializeStandaloneModuleLinks(stagedStandalone) {
  const stagedNodeModules = requiredPath(
    stagedStandalone,
    ".next",
    "node_modules",
  );
  const sourceNodeModules = requiredPath(standaloneDirectory, "node_modules");

  let entries;
  try {
    entries = await readdir(stagedNodeModules, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }

    const linkPath = path.join(stagedNodeModules, entry.name);
    const target = await readlink(linkPath);
    const resolvedTarget = path.resolve(stagedNodeModules, target);
    const sourceRelativeTarget = path.relative(
      standaloneDirectory,
      resolvedTarget,
    );
    const stagedTarget = isPathInside(sourceNodeModules, resolvedTarget)
      ? path.join(stagedStandalone, path.relative(standaloneDirectory, resolvedTarget))
      : isPathInside(stagedStandalone, resolvedTarget)
        ? resolvedTarget
        : null;

    if (!stagedTarget) {
      continue;
    }

    await assertPathExists(stagedTarget, `the traced ${entry.name} module`);
    await rm(linkPath, { force: true });
    await cp(stagedTarget, linkPath, { recursive: true, force: true });
    console.log(
      `Materialized traced module ${entry.name} from ${sourceRelativeTarget}`,
    );
  }
}

async function containsNativeModule(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.endsWith(".node")) {
      return true;
    }
    if (entry.isDirectory() && (await containsNativeModule(entryPath))) {
      return true;
    }
  }
  return false;
}

async function main() {
  const packageJson = JSON.parse(
    await readFile(requiredPath(projectRoot, "package.json"), "utf8"),
  );
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  await run(npmCommand, ["rebuild", "better-sqlite3"]);
  await run(npmCommand, ["run", "build"]);

  await rm(stageDirectory, { recursive: true, force: true });
  await mkdir(stageDirectory, { recursive: true });

  const stagedStandalone = requiredPath(stageDirectory, "standalone");
  await copyRequired(
    requiredPath(standaloneDirectory, "server.js"),
    requiredPath(stagedStandalone, "server.js"),
    "the Next standalone server",
  );
  await copyRequired(
    standaloneDirectory,
    stagedStandalone,
    "the complete Next standalone runtime",
  );
  await copyRequired(
    requiredPath(projectRoot, "public"),
    requiredPath(stagedStandalone, "public"),
    "the public asset directory",
  );
  await copyRequired(
    requiredPath(projectRoot, ".next", "static"),
    requiredPath(stagedStandalone, ".next", "static"),
    "the Next static asset directory",
  );
  await copyRequired(
    requiredPath(projectRoot, "prisma", "schema.prisma"),
    requiredPath(stageDirectory, "prisma", "schema.prisma"),
    "the Prisma schema",
  );
  await copyRequired(
    requiredPath(projectRoot, "prisma", "migrations"),
    requiredPath(stageDirectory, "prisma", "migrations"),
    "the Prisma migrations",
  );
  await copyRequired(
    requiredPath(projectRoot, "prisma.config.ts"),
    requiredPath(stageDirectory, "prisma.config.ts"),
    "the Prisma runtime configuration",
  );

  const stagedNodeModules = requiredPath(stageDirectory, "node_modules");
  await mkdir(stagedNodeModules, { recursive: true });
  const copiedPackages = new Set();
  for (const dependency of ["prisma", "dotenv"]) {
    await copyRuntimeDependencyTree(
      dependency,
      projectRoot,
      stagedNodeModules,
      copiedPackages,
    );
  }

  await writeFile(
    requiredPath(stageDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: `${packageJson.name}-desktop-runtime`,
        version: packageJson.version,
        private: true,
        dependencies: {},
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (process.env.DESKTOP_PACKAGE_NATIVE === "1") {
    const electronRebuild = requiredPath(
      projectRoot,
      "node_modules",
      ".bin",
      "electron-rebuild",
    );
    const targetArch = process.env.DESKTOP_ARCH ?? process.arch;
    await run(electronRebuild, [
      "--module-dir",
      projectRoot,
      "--version",
      packageJson.devDependencies.electron,
      "--arch",
      targetArch,
      "--force",
      "--force-abi",
      electronAbi,
      "--only",
      "better-sqlite3",
    ]);
    await copyFile(
      requiredPath(
        projectRoot,
        "node_modules",
        "better-sqlite3",
        "build",
        "Release",
        "better_sqlite3.node",
      ),
      requiredPath(
        stagedStandalone,
        "node_modules",
        "better-sqlite3",
        "build",
        "Release",
        "better_sqlite3.node",
      ),
    );
  }
  await materializeStandaloneModuleLinks(stagedStandalone);

  const nativeLocations = [
    requiredPath(stagedStandalone, "node_modules", "better-sqlite3"),
    requiredPath(stageDirectory, "node_modules", "better-sqlite3"),
  ];
  if (!(await Promise.all(nativeLocations.map(containsNativeModule))).some(Boolean)) {
    throw new Error(
      "Desktop packaging requires a compiled better-sqlite3 .node module for the current architecture.",
    );
  }

  await assertPathExists(
    requiredPath(stageDirectory, "prisma", "migrations"),
    "Prisma migrations",
  );
  await assertPathExists(
    requiredPath(stageDirectory, "node_modules", "@prisma", "engines"),
    "Prisma engines",
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    server: "standalone/server.js",
    staticAssets: "standalone/.next/static",
    publicAssets: "standalone/public",
    migrations: "prisma/migrations",
  };
  await writeFile(
    requiredPath(stageDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Prepared desktop runtime for ${packageJson.name}@${packageJson.version} at ${stageDirectory}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
