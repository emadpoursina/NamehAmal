/** Phase 3 contract: read-only `get_time_entries` over [start, end). Never touches dev.db. */
import { afterEach, describe, expect, it } from "vitest";

import {
  DELETE,
  GET,
  POST,
  PATCH,
  PUT,
} from "@/app/api/hermes/time-entries/route";
import {
  handleHermesTimeEntries,
  parseTimeRange,
} from "@/app/server/hermes-time-entries";
import { createSyncTestHost } from "../sync/sync-test-host";

describe("get_time_entries validation", () => {
  it("rejects missing, invalid, and inverted ranges", () => {
    expect("error" in parseTimeRange(null, "2026-09-30T00:00:00.000Z", null)).toBe(true);
    expect("error" in parseTimeRange("not-a-date", "2026-09-30T00:00:00.000Z", null)).toBe(true);
    expect(
      "error" in parseTimeRange("2026-09-30T00:00:00.000Z", "2026-09-29T00:00:00.000Z", null),
    ).toBe(true);
    expect(
      "error" in parseTimeRange(
        "2026-09-29T00:00:00.000Z",
        "2026-09-30T00:00:00.000Z",
        "9999",
      ),
    ).toBe(true);
    const ok = parseTimeRange(
      "2026-09-29T00:00:00.000Z",
      "2026-09-30T00:00:00.000Z",
      null,
    );
    expect("options" in ok).toBe(true);
  });
});

describe("get_time_entries handler", () => {
  let hosts: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(hosts.map((host) => host.close()));
    hosts = [];
  });

  async function seedHost() {
    const host = await createSyncTestHost();
    hosts.push(host);
    const category = await host.client.category.create({ data: { name: "Work" } });
    const entry = (occurredAt: string, overrides = {}) =>
      host.client.session.create({
        data: {
          kind: "MANUAL",
          title: "Entry",
          categoryId: category.id,
          occurredAt: new Date(occurredAt),
          startedAt: new Date(occurredAt),
          endedAt: new Date(new Date(occurredAt).getTime() + 3600_000),
          durationSeconds: 3600,
          timeZone: "Asia/Yerevan",
          ...overrides,
        },
      });
    // Two finalized entries inside the range, one before, one at the exclusive end.
    await entry("2026-09-29T09:00:00.000Z", { title: "First" });
    await entry("2026-09-29T14:00:00.000Z", { title: "Second" });
    await entry("2026-09-28T09:00:00.000Z", { title: "Before" });
    await entry("2026-09-30T00:00:00.000Z", { title: "Exclusive end" });
    // Running TIMER drafts and tombstoned deletions are not actuals.
    await host.client.session.create({
      data: {
        kind: "TIMER",
        title: "Running",
        categoryId: category.id,
        occurredAt: new Date("2026-09-29T16:00:00.000Z"),
        startedAt: new Date("2026-09-29T16:00:00.000Z"),
        endedAt: null,
        durationSeconds: 0,
        timeZone: "Asia/Yerevan",
      },
    });
    await entry("2026-09-29T18:00:00.000Z", {
      title: "Deleted",
      deletedAt: new Date("2026-09-29T19:00:00.000Z"),
    });
    return host;
  }

  function rangeRequest(params: string): Request {
    return new Request(`http://localhost/api/hermes/time-entries?${params}`);
  }

  it("returns only finalized entries in [start, end) with totals, chronological", async () => {
    const host = await seedHost();
    const response = await handleHermesTimeEntries(
      rangeRequest("start=2026-09-29T00:00:00.000Z&end=2026-09-30T00:00:00.000Z"),
      host.client,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const json = (await response.json()) as {
      ok: boolean;
      data: {
        count: number;
        totalDurationSeconds: number;
        truncated: boolean;
        entries: { title: string | null; categoryName: string }[];
      };
    };
    expect(json.ok).toBe(true);
    expect(json.data.count).toBe(2);
    expect(json.data.totalDurationSeconds).toBe(7200);
    expect(json.data.truncated).toBe(false);
    expect(json.data.entries.map((item) => item.title)).toEqual(["First", "Second"]);
    expect(json.data.entries[0].categoryName).toBe("Work");
  });

  it("paginates with limit and flags truncation", async () => {
    const host = await seedHost();
    const response = await handleHermesTimeEntries(
      rangeRequest("start=2026-09-29T00:00:00.000Z&end=2026-09-30T00:00:00.000Z&limit=1"),
      host.client,
    );
    const json = (await response.json()) as {
      ok: boolean;
      data: { count: number; truncated: boolean };
    };
    expect(json.data.count).toBe(1);
    expect(json.data.truncated).toBe(true);
  });

  it("returns 400 for invalid ranges without touching data", async () => {
    const host = await seedHost();
    const before = await host.client.session.count();
    const response = await handleHermesTimeEntries(rangeRequest("start=nope&end=nope"), host.client);
    expect(response.status).toBe(400);
    const json = (await response.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
    expect(await host.client.session.count()).toBe(before);
  });

  it("exposes no write operations", async () => {
    await expect((await POST()).status).toBe(405);
    await expect((await PUT()).status).toBe(405);
    await expect((await PATCH()).status).toBe(405);
    await expect((await DELETE()).status).toBe(405);
    for (const response of [await POST(), await PUT(), await PATCH(), await DELETE()]) {
      const json = (await response.json()) as { ok: boolean };
      expect(json.ok).toBe(false);
    }
    expect((await GET(new Request("http://localhost/api/hermes/time-entries"))).status).toBe(
      400,
    );
  });
});
