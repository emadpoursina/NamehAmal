#!/usr/bin/env node
/**
 * Build and start the Docker Compose stack on port 3060.
 * Usage: bun run docker:up   (or: npm run docker:up)
 */
import { spawnSync } from "node:child_process";

const PORT = "3060";

function run(command, args) {
  const display = [command, ...args].join(" ");
  console.log(`\n> ${display}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("docker", ["compose", "up", "--build", "-d"]);

console.log(`\nStack is up. Open http://localhost:${PORT}`);
