#!/usr/bin/env node
/**
 * Stop and remove the Docker Compose stack.
 * Usage: bun run docker:down   (or: npm run docker:down)
 */
import { spawnSync } from "node:child_process";

function run(command, args) {
  const display = [command, ...args].join(" ");
  console.log(`\n> ${display}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("docker", ["compose", "down"]);

console.log("\nStack is down.");
