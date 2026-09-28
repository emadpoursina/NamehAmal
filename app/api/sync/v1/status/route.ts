/** On-demand sync readiness check. Returns no time data. (T026) */

import type { PrismaClient } from "@/app/generated/prisma/client";
import { SYNC_PROTOCOL_VERSION, type ActivitySnapshotDto } from "@/app/server/sync/validation";
import { PrismaHostStore } from "@/app/server/sync/prisma-store";

export const runtime = "nodejs";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

export interface StatusResponse {
  protocolVersion: number;
  desktopDeviceId: string;
  syncEnabled: boolean;
  capabilities: readonly [
    "entry-title",
    "upload-only",
    "category-metadata",
    "activity-metadata",
  ];
  categories: {
    categoryId: string;
    name: string;
    sortOrder: number;
    isArchived: boolean;
  }[];
  activities: ActivitySnapshotDto[];
}

/** Testable status handler; the exported GET uses the production database. */
export async function handleStatus(
  client?: PrismaClient,
): Promise<Response> {
  try {
    const store = new PrismaHostStore(client);
    const [desktopDeviceId, categories, activities] = await Promise.all([
      store.getDesktopDeviceId(),
      store.listCategories(),
      store.listActivities(),
    ]);
    const body: StatusResponse = {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      desktopDeviceId,
      syncEnabled: true,
      capabilities: [
        "entry-title",
        "upload-only",
        "category-metadata",
        "activity-metadata",
      ] as const,
      categories,
      activities,
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
