/** Electron LAN sync bridge tests: allowlist, port separation, retryable failure (T022). */
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { DESKTOP_PORT, SYNC_BRIDGE_DEFAULT_PORT } from "../../electron/runtime-config";
import {
  createSyncBridge,
  SYNC_DEFAULT_PORT,
  SYNC_ALLOWED_ROUTES,
} from "../../electron/sync-bridge";

describe("sync bridge allowlist", () => {
  let loopback: Server | null = null;
  let loopbackOrigin = "";
  const bridges: { stop: () => Promise<void> }[] = [];

  afterEach(async () => {
    await Promise.all(bridges.map((bridge) => bridge.stop()));
    bridges.length = 0;
    if (loopback) {
      await new Promise<void>((resolve) => loopback?.close(() => resolve()));
      loopback = null;
    }
  });

  async function startLoopback(
    handler: (url: string, method: string, body: string) => { status: number; payload: unknown },
  ) {
    loopback = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk: Buffer) => {
        text += chunk.toString();
      });
      request.on("end", () => {
        const result = handler(request.url ?? "/", request.method ?? "GET", text);
        response.writeHead(result.status, { "content-type": "application/json" });
        response.end(JSON.stringify(result.payload));
      });
    });
    await new Promise<void>((resolve) => {
      loopback?.listen(0, "127.0.0.1", () => resolve());
    });
    const address = loopback?.address();
    const port = typeof address === "object" && address ? address.port : 0;
    loopbackOrigin = `http://127.0.0.1:${port}`;
  }

  it("forwards only the two contract routes and rejects everything else", async () => {
    const seen: string[] = [];
    await startLoopback((url, method) => {
      seen.push(`${method} ${url}`);
      return { status: 200, payload: { ok: true } };
    });
    const bridge = createSyncBridge({ loopbackOrigin, syncPort: 0 });
    bridges.push(bridge);
    await bridge.start();
    const base = `http://127.0.0.1:${bridge.localPort()}`;

    expect(SYNC_ALLOWED_ROUTES).toEqual([
      { method: "GET", path: "/api/sync/v1/status" },
      { method: "POST", path: "/api/sync/v1/exchange" },
    ]);

    const status = await fetch(`${base}/api/sync/v1/status`);
    expect(status.status).toBe(200);
    const exchange = await fetch(`${base}/api/sync/v1/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocolVersion: 1 }),
    });
    expect(exchange.status).toBe(200);
    expect(seen).toEqual(["GET /api/sync/v1/status", "POST /api/sync/v1/exchange"]);

    // All other paths/methods are rejected without reaching the loopback server.
    for (const suffix of ["/api/sessions", "/", "/api/sync/v1/exchange?x=1"]) {
      const response = await fetch(`${base}${suffix}`);
      expect(response.status).toBe(404);
    }
    const wrongMethod = await fetch(`${base}/api/sync/v1/exchange`);
    expect(wrongMethod.status).toBe(404);
    const wrongPost = await fetch(`${base}/api/sync/v1/status`, { method: "POST" });
    expect(wrongPost.status).toBe(404);
    const deleted = await fetch(`${base}/api/sync/v1/exchange`, { method: "DELETE" });
    expect(deleted.status).toBe(404);
    expect(seen).toEqual(["GET /api/sync/v1/status", "POST /api/sync/v1/exchange"]);
  });

  it("keeps the sync port separate from the loopback app listener", () => {
    expect(SYNC_DEFAULT_PORT).toBe(3061);
    expect(SYNC_BRIDGE_DEFAULT_PORT).toBe(3061);
    expect(DESKTOP_PORT).toBe(3060);
    expect(SYNC_DEFAULT_PORT).not.toBe(DESKTOP_PORT);
  });

  it("reports bridge failure as retryable without touching local data", async () => {
    // No loopback server: the bridge answers 503 so the phone can retry.
    const bridge = createSyncBridge({
      loopbackOrigin: "http://127.0.0.1:1",
      syncPort: 0,
      timeoutMs: 2000,
    });
    bridges.push(bridge);
    await bridge.start();
    const base = `http://127.0.0.1:${bridge.localPort()}`;
    const response = await fetch(`${base}/api/sync/v1/status`);
    expect(response.status).toBe(503);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
    // Stopping twice is safe for retry flows.
    await bridge.stop();
    await bridge.stop();
  });
});
