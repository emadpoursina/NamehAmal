/** Versioned sync exchange endpoint (T026). Server-owned Prisma access only. */

import { handleExchangePost } from "@/app/server/sync/exchange-handler";

export const runtime = "nodejs";

/** POST /api/sync/v1/exchange — user-started Android sync over trusted LAN. */
export async function POST(request: Request): Promise<Response> {
  return handleExchangePost(request);
}
