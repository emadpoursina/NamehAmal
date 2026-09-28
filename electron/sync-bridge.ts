/**
 * Dedicated LAN sync bridge (T027).
 * Listens on the configured sync port (default 3061) and forwards ONLY the two
 * versioned contract routes to the loopback-only Next.js server. The ordinary
 * desktop UI/API stays on 127.0.0.1:3060 and is never exposed on the LAN.
 * No TLS, pairing, or per-device auth (trusted private LAN only, Constitution v1.1.0).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";

export const SYNC_DEFAULT_PORT = 3061;
export const SYNC_STATUS_PATH = "/api/sync/v1/status";
export const SYNC_EXCHANGE_PATH = "/api/sync/v1/exchange";

/** The only (method, path) pairs the bridge forwards. Everything else is rejected. */
export const SYNC_ALLOWED_ROUTES: ReadonlyArray<{
  method: string;
  path: string;
}> = [
  { method: "GET", path: SYNC_STATUS_PATH },
  { method: "POST", path: SYNC_EXCHANGE_PATH },
];

export interface SyncBridgeOptions {
  /** Loopback origin of the Next.js server, e.g. http://127.0.0.1:3060. */
  loopbackOrigin: string;
  /** LAN port for the sync bridge. Defaults to 3061. */
  syncPort?: number;
  /** Request timeout in ms. */
  timeoutMs?: number;
  /** Maximum forwarded body size in bytes. */
  maxBodyBytes?: number;
}

export interface SyncBridge {
  readonly port: number;
  /** Actual bound port (differs from `port` when 0 was requested). */
  localPort(): number;
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly isRunning: boolean;
}

function isAllowed(method: string | undefined, path: string | null): boolean {
  if (!method || !path) return false;
  const pathname = path.split("?", 1)[0];
  return SYNC_ALLOWED_ROUTES.some(
    (route) => route.method === method && route.path === pathname,
  );
}

async function readBody(
  request: IncomingMessage,
  maxBodyBytes: number,
): Promise<{ body: Buffer } | { error: "too-large" }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) return { error: "too-large" };
    chunks.push(buffer);
  }
  return { body: Buffer.concat(chunks) };
}

/** Create (but do not start) the LAN sync bridge. */
export function createSyncBridge(options: SyncBridgeOptions): SyncBridge {
  const port = options.syncPort ?? SYNC_DEFAULT_PORT;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  let server: Server | null = null;
  let running = false;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    try {
      if (!isAllowed(request.method, request.url ?? null)) {
        response.writeHead(404, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(
          JSON.stringify({ ok: false, error: "Not a sync endpoint." }),
        );
        return;
      }
      const pathname = (request.url ?? "").split("?", 1)[0];
      const body = await readBody(request, maxBodyBytes);
      if ("error" in body) {
        response.writeHead(413, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(
          JSON.stringify({
            ok: false,
            error: "Request exceeds the batch/body limit; retry with smaller batches.",
          }),
        );
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const upstream = await fetch(`${options.loopbackOrigin}${pathname}`, {
          method: request.method,
          headers: { "content-type": "application/json" },
          body: request.method === "GET" ? undefined : new Uint8Array(body.body),
          signal: controller.signal,
        });
        const payload = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(upstream.status, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(payload);
      } catch {
        response.writeHead(503, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(
          JSON.stringify({
            ok: false,
            error:
              "Sync host is temporarily unavailable. No data was changed; retry.",
          }),
        );
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      try {
        response.writeHead(503, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        response.end(
          JSON.stringify({ ok: false, error: "Sync bridge failure; retry." }),
        );
      } catch {
        // Response already closed; nothing to do.
      }
    }
  }

  return {
    port,
    localPort() {
      const address = server?.address();
      if (address && typeof address === "object") return address.port;
      return port;
    },
    get isRunning() {
      return running;
    },
    async start() {
      if (server) return;
      server = createServer(handle);
      await new Promise<void>((resolve, reject) => {
        server?.once("error", reject);
        // Bind all interfaces so LAN peers can reach the bridge; only the two
        // allowlisted sync routes are served.
        server?.listen(port, () => {
          running = true;
          resolve();
        });
      });
    },
    async stop() {
      running = false;
      const current = server;
      server = null;
      if (!current) return;
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
      });
    },
  };
}

/** Current non-internal IPv4 addresses for display in the settings bridge card. */
export function getPrivateLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const info of interfaces ?? []) {
      if (info.family !== "IPv4" || info.internal) continue;
      addresses.push(info.address);
    }
  }
  return addresses;
}
