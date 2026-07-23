#!/usr/bin/env node
/**
 * Pull latest code, install deps, apply migrations, and rebuild for production.
 * Usage: bun run update   (or: npm run update)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const useBun = existsSync("bun.lock") || existsSync("bun.lockb");

function run(command, args, label) {
  const display = label ?? [command, ...args].join(" ");
  console.log(`\n> ${display}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function execTool(args) {
  run(useBun ? "bunx" : "npx", args);
}

if (existsSync(".git")) {
  run("git", ["pull", "--ff-only"]);
}

if (useBun) {
  run("bun", ["install"]);
} else {
  run("npm", ["install"]);
}

execTool(["prisma", "generate"]);
execTool(["prisma", "migrate", "deploy"]);
run(useBun ? "bun" : "npm", ["run", "build"]);

console.log("\nUpdate complete. Restart the app with: bun run start");
