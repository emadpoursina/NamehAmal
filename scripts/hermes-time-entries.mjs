#!/usr/bin/env node
/**
 * Shell fallback for the Phase 3 Hermes integration.
 * Read-only: fetches finalized time entries for [start, end) from the local
 * Mac app and prints the structured JSON payload to stdout.
 *
 * Usage:
 *   node scripts/hermes-time-entries.mjs --start <ISO> --end <ISO> [--limit N] [--base-url http://127.0.0.1:3060]
 */
const DEFAULT_BASE_URL = "http://127.0.0.1:3060";

function usageError(message) {
  console.error(`Error: ${message}\n`);
  console.error(
    "Usage: node scripts/hermes-time-entries.mjs --start <ISO> --end <ISO> [--limit N] [--base-url <origin>]",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { baseUrl: DEFAULT_BASE_URL };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--start" || flag === "--end" || flag === "--base-url" || flag === "--limit") {
      if (!value || value.startsWith("--")) usageError(`${flag} requires a value.`);
      if (flag === "--start") args.start = value;
      else if (flag === "--end") args.end = value;
      else if (flag === "--base-url") args.baseUrl = value;
      else args.limit = value;
      i += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log(
        "Usage: node scripts/hermes-time-entries.mjs --start <ISO> --end <ISO> [--limit N] [--base-url <origin>]",
      );
      process.exit(0);
    } else {
      usageError(`Unknown argument: ${flag}`);
    }
  }
  if (!args.start) usageError("--start is required (ISO-8601 datetime).");
  if (!args.end) usageError("--end is required (ISO-8601 datetime).");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const params = new URLSearchParams({ start: args.start, end: args.end });
  if (args.limit !== undefined) params.set("limit", String(args.limit));
  const url = `${args.baseUrl.replace(/\/+$/, "")}/api/hermes/time-entries?${params.toString()}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    console.error(json.error || `Request failed (${response.status}).`);
    process.exit(1);
  }
  console.log(JSON.stringify(json.data, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
