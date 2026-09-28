/** HTTP adapter for the versioned Android-initiated exchange endpoint. */

import type { PrismaClient } from "@/app/generated/prisma/client";
import { applyExchange } from "@/app/server/sync/exchange-service";
import { PrismaHostStore } from "@/app/server/sync/prisma-store";
import {
  MAX_BODY_BYTES,
  validateExchangeRequest,
} from "@/app/server/sync/validation";

function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": "no-store" };
}

function jsonError(message: string, status: number): Response {
  return Response.json(
    { ok: false, error: message },
    { status, headers: noStoreHeaders() },
  );
}

async function readBoundedJson(request: Request): Promise<{
  body?: unknown;
  error?: string;
  status?: number;
}> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return {
      error: "Request exceeds the batch/body limit; retry with smaller batches.",
      status: 413,
    };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { error: "Invalid request body.", status: 400 };
  }
  if (text.length > MAX_BODY_BYTES) {
    return {
      error: "Request exceeds the batch/body limit; retry with smaller batches.",
      status: 413,
    };
  }
  try {
    return { body: text ? (JSON.parse(text) as unknown) : null };
  } catch {
    return { error: "Invalid JSON body.", status: 400 };
  }
}

/** Testable handler; the Next.js route wrapper exposes its supported signature. */
export async function handleExchangePost(
  request: Request,
  client?: PrismaClient,
): Promise<Response> {
  const parsed = await readBoundedJson(request);
  if (parsed.error || parsed.body === undefined) {
    return jsonError(parsed.error ?? "Invalid JSON body.", parsed.status ?? 400);
  }

  const validated = validateExchangeRequest(parsed.body);
  if (validated.error || !validated.request) {
    return jsonError(
      validated.error?.message ?? "Invalid request.",
      validated.error?.status ?? 400,
    );
  }

  try {
    const store = new PrismaHostStore(client);
    const { response } = await applyExchange(store, validated.request);
    return Response.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number"
    ) {
      const typed = error as { status: number; message?: string };
      const status = [400, 409, 413, 503].includes(typed.status)
        ? typed.status
        : 503;
      return jsonError(
        typed.message ?? "Sync did not complete; local data is unchanged. Retry.",
        status,
      );
    }
    return jsonError(
      "Sync did not complete because of a host failure. No data was partially applied; retry.",
      503,
    );
  }
}
