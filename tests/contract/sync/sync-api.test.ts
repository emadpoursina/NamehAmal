/** Sync API contract tests: status, full-history/incremental exchange, idempotency, paging, failures (T021). */
import { afterEach, describe, expect, it } from "vitest";

import { handleStatus } from "@/app/api/sync/v1/status/route";
import { applyExchange, InMemoryHostStore } from "@/app/server/sync/exchange-service";
import { handleExchangePost } from "@/app/server/sync/exchange-handler";
import { createSyncTestHost, seedCategoryAndActivity } from "./sync-test-host";
import { validateExchangeRequest } from "@/app/server/sync/validation";
import type { ExchangeRequest } from "@/app/server/sync/validation";

function revision(
  revisionId: string,
  entryId: string,
  overrides: Record<string, unknown> = {},
) {
  const { entry: entryOverrides, ...rest } = overrides;
  return {
    revisionId,
    entryId,
    baseRevisionId: null,
    sourceDeviceId: "android-test-device",
    changedByDeviceId: "android-test-device",
    updatedAt: "2026-09-26T08:00:00.000Z",
    ...rest,
    entry: {
      entryType: "WORK",
      activityId: null,
      categoryId: null,
      startedAt: "2026-09-26T07:00:00.000Z",
      endedAt: "2026-09-26T08:00:00.000Z",
      timeZoneId: "Asia/Yerevan",
      timeZoneOffsetMinutes: 240,
      confirmationState: "CONFIRMED",
      deletedAt: null,
      ...((entryOverrides as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function exchangeRequest(overrides: Record<string, unknown> = {}): ExchangeRequest {
  return {
    protocolVersion: 1,
    deviceId: "android-test-device",
    cursor: null,
    entryRevisions: [],
    resolutions: [],
    ...overrides,
  } as ExchangeRequest;
}

async function postExchange(
  body: unknown,
  client?: Parameters<typeof handleExchangePost>[1],
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await handleExchangePost(
    new Request("http://localhost/api/sync/v1/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    client,
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("sync status contract", () => {
  it("returns version, desktop id, enabled flag, and upload capabilities without time data", async () => {
    const host = await createSyncTestHost();
    try {
      expect(host.filePath).not.toMatch(/(?:^|\/)dev\.db$/);
      const response = await handleStatus(host.client);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const json = (await response.json()) as Record<string, unknown>;
      expect(json.protocolVersion).toBe(1);
      expect(typeof json.desktopDeviceId).toBe("string");
      expect(json.syncEnabled).toBe(true);
      expect(json.capabilities).toEqual(["entry-title", "upload-only"]);
      expect(json).not.toHaveProperty("sessions");
      expect(json).not.toHaveProperty("activities");
      // Stable desktop identity across calls.
      const again = (await (await handleStatus(host.client)).json()) as Record<string, unknown>;
      expect(again.desktopDeviceId).toBe(json.desktopDeviceId);
    } finally {
      await host.close();
    }
  });
});

describe("sync exchange contract", () => {
  let hosts: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(hosts.map((host) => host.close()));
    hosts = [];
  });

  it("downloads full history and activities on a null cursor, then stays idempotent", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    await host.client.session.create({
      data: {
        kind: "MANUAL",
        title: "Legacy desktop work",
        categoryId: seeded.categoryId,
        occurredAt: new Date("2026-09-25T09:00:00.000Z"),
        startedAt: new Date("2026-09-25T09:00:00.000Z"),
        endedAt: new Date("2026-09-25T10:00:00.000Z"),
        durationSeconds: 3600,
        timeZone: "Asia/Yerevan",
        timeZoneOffsetMinutes: 240,
      },
    });

    const first = await postExchange(exchangeRequest(), host.client);
    expect(first.status).toBe(200);
    expect(first.json.hasMore).toBe(false);
    expect((first.json.acceptedRevisionIds as string[])).toEqual([]);
    const downloaded = first.json.entryRevisions as { entryId: string }[];
    expect(downloaded.length).toBe(1);
    expect(downloaded[0].entryId.startsWith("legacy:")).toBe(true);
    const activities = first.json.activities as { activityId: string; title: string }[];
    expect(activities).toHaveLength(1);
    expect(activities[0].activityId).toBe(seeded.activityId);
    const cursor = first.json.cursor as string;
    expect(typeof cursor).toBe("string");

    // Repeat with the returned cursor: no duplicates, no new revisions.
    const second = await postExchange(exchangeRequest({ cursor }), host.client);
    expect(second.status).toBe(200);
    expect(second.json.entryRevisions).toEqual([]);
    expect(second.json.cursor).toBe(cursor);
    expect(await host.client.session.count()).toBe(1);
  });

  it("uploads phone revisions incrementally and retries idempotently", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const phoneRevision = revision("rev-phone-1", "entry-phone-1", {
      entry: { activityId: seeded.activityId },
    });

    const upload = await postExchange(
      exchangeRequest({ entryRevisions: [phoneRevision] }),
      host.client,
    );
    expect(upload.status).toBe(200);
    expect(upload.json.acceptedRevisionIds).toEqual(["rev-phone-1"]);
    const projected = await host.client.session.findUnique({
      where: { syncId: "entry-phone-1" },
    });
    expect(projected).not.toBeNull();
    expect(projected?.activityId).toBe(seeded.activityId);
    expect(projected?.durationSeconds).toBe(3600);

    // Ten no-change/change cycles: retries create no duplicates.
    let cursor = upload.json.cursor as string;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const retry = await postExchange(
        exchangeRequest({ cursor, entryRevisions: [phoneRevision] }),
        host.client,
      );
      expect(retry.status).toBe(200);
      expect(retry.json.acceptedRevisionIds).toEqual(["rev-phone-1"]);
      cursor = retry.json.cursor as string;
    }
    expect(
      await host.client.session.count({ where: { syncId: "entry-phone-1" } }),
    ).toBe(1);
    expect(await host.client.syncRevision.count()).toBe(1);
  });

  it("accepts title-bearing upload-only events and returns acknowledgements only", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const title = "Focus planning";
    const upload = await postExchange(
      exchangeRequest({
        mode: "UPLOAD_ONLY",
        entryRevisions: [revision("rev-upload-only", "entry-upload-only", {
          entry: { title, activityId: null, categoryId: null },
        })],
      }),
      host.client,
    );

    expect(upload.status).toBe(200);
    expect(upload.json.mode).toBe("UPLOAD_ONLY");
    expect(upload.json.acceptedRevisionIds).toEqual(["rev-upload-only"]);
    expect(upload.json.cursor).toBeNull();
    expect(upload.json.hasMore).toBe(false);
    expect(upload.json.entryRevisions).toEqual([]);
    expect(upload.json.activities).toEqual([]);
    expect(upload.json.conflicts).toEqual([]);
    expect(upload.json.resolutions).toEqual([]);

    const projected = await host.client.session.findUnique({
      where: { syncId: "entry-upload-only" },
      include: { category: true },
    });
    expect(projected?.title).toBe(title);
    expect(projected?.activityId).toBeNull();
    expect(projected?.category.name).toBe("Unassigned");

    const retry = await postExchange(
      exchangeRequest({
        mode: "UPLOAD_ONLY",
        entryRevisions: [revision("rev-upload-only", "entry-upload-only", {
          entry: { title, activityId: null, categoryId: null },
        })],
      }),
      host.client,
    );
    expect(retry.status).toBe(200);
    expect(retry.json.acceptedRevisionIds).toEqual(["rev-upload-only"]);
    expect(await host.client.session.count({ where: { syncId: "entry-upload-only" } })).toBe(1);
    expect(await host.client.syncRevision.count({ where: { revisionId: "rev-upload-only" } })).toBe(1);
  });

  it("keeps mode optional for legacy exchanges but requires a nonblank title for upload-only", () => {
    const legacy = validateExchangeRequest(exchangeRequest({
      entryRevisions: [revision("legacy-rev", "legacy-entry")],
    }));
    expect(legacy.error).toBeUndefined();

    const missingTitle = validateExchangeRequest(exchangeRequest({
      mode: "UPLOAD_ONLY",
      entryRevisions: [revision("missing-title", "missing-title-entry")],
    }));
    expect(missingTitle.error?.status).toBe(400);

    const blankTitle = validateExchangeRequest(exchangeRequest({
      mode: "UPLOAD_ONLY",
      entryRevisions: [revision("blank-title", "blank-title-entry", { entry: { title: "  " } })],
    }));
    expect(blankTitle.error?.status).toBe(400);

    const badMode = validateExchangeRequest(exchangeRequest({ mode: "DOWNLOAD_ONLY" }));
    expect(badMode.error?.status).toBe(400);
  });

  it("rejects upload-only deletion tombstones instead of changing the desktop copy", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const first = await postExchange(exchangeRequest({
      mode: "UPLOAD_ONLY",
      entryRevisions: [revision("rev-kept", "entry-kept", {
        entry: { title: "Keep on desktop" },
      })],
    }), host.client);
    expect(first.status).toBe(200);

    const deletion = await postExchange(exchangeRequest({
      mode: "UPLOAD_ONLY",
      entryRevisions: [revision("rev-delete", "entry-kept", {
        entry: { title: "Keep on desktop", deletedAt: "2026-09-27T12:00:00.000Z" },
      })],
    }), host.client);
    expect(deletion.status).toBe(400);
    expect(await host.client.session.count({ where: { syncId: "entry-kept" } })).toBe(1);
  });

  it("pages large histories within stable sequence order", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const base = new Date("2026-09-01T09:00:00.000Z").getTime();
    for (let index = 0; index < 60; index += 1) {
      const start = new Date(base + index * 3600_000);
      await host.client.session.create({
        data: {
          kind: "MANUAL",
          categoryId: seeded.categoryId,
          occurredAt: start,
          startedAt: start,
          endedAt: new Date(start.getTime() + 1800_000),
          durationSeconds: 1800,
          timeZone: "Asia/Yerevan",
        },
      });
    }
    const first = await postExchange(exchangeRequest(), host.client);
    expect(first.status).toBe(200);
    expect(first.json.hasMore).toBe(true);
    expect((first.json.entryRevisions as unknown[])).toHaveLength(50);
    const second = await postExchange(
      exchangeRequest({ cursor: first.json.cursor }),
      host.client,
    );
    expect(second.status).toBe(200);
    expect(second.json.hasMore).toBe(false);
    expect((second.json.entryRevisions as unknown[])).toHaveLength(10);
  });

  it("rejects malformed payloads and keeps the cursor unchanged", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    await seedCategoryAndActivity(host);

    const baseline = await postExchange(exchangeRequest(), host.client);
    const cursor = baseline.json.cursor as string;

    const badInterval = await postExchange(
      exchangeRequest({
        entryRevisions: [
          revision("rev-bad", "entry-bad", {
            entry: {
              startedAt: "2026-09-26T08:00:00.000Z",
              endedAt: "2026-09-26T07:00:00.000Z",
            },
          }),
        ],
      }),
      host.client,
    );
    expect(badInterval.status).toBe(400);

    const badType = await postExchange(
      exchangeRequest({
        entryRevisions: [revision("rev-bad-2", "entry-bad-2", { entry: { entryType: "NAP" } })],
      }),
      host.client,
    );
    expect(badType.status).toBe(400);

    const badJson = await postExchange("{not json", host.client);
    expect(badJson.status).toBe(400);

    const badCursor = await postExchange(exchangeRequest({ cursor: "nope" }), host.client);
    expect(badCursor.status).toBe(400);

    // Nothing was stored and the previous cursor still yields the same delta.
    expect(await host.client.syncRevision.count()).toBe(0);
    const retry = await postExchange(exchangeRequest({ cursor: null }), host.client);
    expect(retry.json.cursor).toBe(cursor);
  });

  it("rejects unsupported protocol versions without changing data", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const response = await postExchange(
      { protocolVersion: 999, deviceId: "android", cursor: null, entryRevisions: [], resolutions: [] },
      host.client,
    );
    expect(response.status).toBe(409);
    expect(await host.client.syncRevision.count()).toBe(0);
  });

  it("rejects oversized bodies with 413", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const response = await handleExchangePost(
      new Request("http://localhost/api/sync/v1/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "2000000",
        },
        body: JSON.stringify(exchangeRequest()),
      }),
      host.client,
    );
    expect(response.status).toBe(413);
  });

  it("rolls back the whole batch on database failure and keeps the cursor", async () => {
    const store = new InMemoryHostStore("desktop-mem", []);
    const first = await applyExchange(store, exchangeRequest());
    const cursor = first.response.cursor;
    store.failNextTransaction = true;
    await expect(
      applyExchange(
        store,
        exchangeRequest({ entryRevisions: [revision("rev-x", "entry-x")] }),
      ),
    ).rejects.toMatchObject({ status: 503 });
    // Retry succeeds and the failed batch left no partial state.
    const retry = await applyExchange(
      store,
      exchangeRequest({ entryRevisions: [revision("rev-x", "entry-x")] }),
    );
    expect(retry.response.acceptedRevisionIds).toEqual(["rev-x"]);
    const again = await applyExchange(store, exchangeRequest({ cursor }));
    expect(again.response.entryRevisions.map((item) => item.revisionId)).toContain("rev-x");
  });

  it("validates requests without a database", () => {
    expect(validateExchangeRequest(null).error?.status).toBe(400);
    expect(
      validateExchangeRequest({
        protocolVersion: 2,
        deviceId: "d",
        cursor: null,
        entryRevisions: [],
        resolutions: [],
      }).error?.status,
    ).toBe(409);
  });
});
