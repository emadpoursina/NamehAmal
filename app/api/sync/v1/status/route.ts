/** On-demand sync readiness check. Returns no time data. (T026) */

import type { PrismaClient } from "@/app/generated/prisma/client";
import { SYNC_PROTOCOL_VERSION } from "@/app/server/sync/validation";
import { PrismaHostStore } from "@/app/server/sync/prisma-store";

export const runtime = "nodejs";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export interface StatusResponse {
  protocolVersion: number;
  desktopDeviceId: string;
  syncEnabled: boolean;
  capabilities: readonly ["entry-title", "upload-only"];
}

/** Testable status handler; the exported GET uses the production database. */
export async function handleStatus(
  client?: PrismaClient,
): Promise<Response> {
  try {
    const store = new PrismaHostStore(client);
    const desktopDeviceId = await store.getDesktopDeviceId();
    const body: StatusResponse = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      desktopDeviceId,
      syncEnabled: true,
      capabilities: ["entry-title", "upload-only"] as const,
    };
    return Response.json(body, { headers: noStoreHeaders() });
  } catch {
    return Response.json(
      {
        ok: false,
        error:
          "Sync storage is temporarily unavailable. No data was changed; retry.",
      },
      { status: 503, headers: noStoreHeaders() },
    );
  }
}

/** GET /api/sync/v1/status — readiness probe for a user-started Android Sync flow. */
export async function GET() {
  return handleStatus();
}
