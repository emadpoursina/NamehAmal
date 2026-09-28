/** Host conflict integration tests: concurrent edits, overlap totals, resolution/undo, idempotent resync (T035). */
import { afterEach, describe, expect, it } from "vitest";

import { handleExchangePost } from "@/app/server/sync/exchange-handler";
import { computeActivityTotals } from "@/app/server/sync/totals";
import { createSyncTestHost, seedCategoryAndActivity } from "./sync-test-host";
import type {
  EntrySnapshot,
  ExchangeRequest,
  IncomingResolution,
  IncomingRevision,
} from "@/app/server/sync/validation";

function entry(
  startedAt: string,
  endedAt: string,
  activityId: string | null,
): EntrySnapshot {
  return {
    entryType: "WORK",
    activityId,
    categoryId: null,
    startedAt,
    endedAt,
    timeZoneId: "Asia/Yerevan",
    timeZoneOffsetMinutes: 240,
    confirmationState: "CONFIRMED",
    deletedAt: null,
  };
}

function revision(
  revisionId: string,
  entryId: string,
  baseRevisionId: string | null,
  startedAt: string,
  endedAt: string,
  activityId: string | null,
): IncomingRevision {
  return {
    revisionId,
    entryId,
    baseRevisionId,
    sourceDeviceId: "android-test-device",
    changedByDeviceId: "android-test-device",
    updatedAt: "2026-09-26T08:00:00.000Z",
    entry: entry(startedAt, endedAt, activityId),
  };
}

function request(overrides: Partial<ExchangeRequest>): ExchangeRequest {
  return {
    protocolVersion: 1,
    deviceId: "android-test-device",
    cursor: null,
    entryRevisions: [],
    resolutions: [],
    ...overrides,
  };
}

async function post(
  body: ExchangeRequest,
  client: Parameters<typeof handleExchangePost>[1],
) {
  const response = await handleExchangePost(
    new Request("http://localhost/api/sync/v1/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    client,
  );
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("sync conflicts", () => {
  const hosts: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(hosts.map((host) => host.close()));
    hosts.length = 0;
  });

  it("preserves concurrent revisions from a shared base and asks the user", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const base = revision("rev-base", "entry-shared", null, "2026-09-26T07:00:00.000Z", "2026-09-26T08:00:00.000Z", seeded.activityId);
    const first = await post(request({ entryRevisions: [base] }), host.client);
    expect(first.status).toBe(200);

    // Two divergent edits from the same base before either is received.
    const phoneEdit = revision("rev-phone-edit", "entry-shared", "rev-base", "2026-09-26T07:00:00.000Z", "2026-09-26T08:30:00.000Z", seeded.activityId);
    const desktopEdit = { ...revision("rev-desktop-edit", "entry-shared", "rev-base", "2026-09-26T07:00:00.000Z", "2026-09-26T09:00:00.000Z", seeded.activityId), changedByDeviceId: "desktop-device", sourceDeviceId: "desktop-device" };
    const second = await post(request({ entryRevisions: [phoneEdit, desktopEdit] }), host.client);
    expect(second.status).toBe(200);
    expect(second.json.acceptedRevisionIds).toEqual(["rev-phone-edit", "rev-desktop-edit"]);

    // Both branches remain inspectable; neither silently overwrote the other.
    expect(await host.client.syncRevision.count({ where: { entryId: "entry-shared" } })).toBe(3);
    const conflicts = second.json.conflicts as { conflictId: string; conflictType: string; state: string; revisionIds: string[] }[];
    const concurrent = conflicts.find((item) => item.conflictId === "concurrent-edit:entry-shared");
    expect(concurrent).toMatchObject({ conflictType: "CONCURRENT_EDIT", state: "UNRESOLVED" });
    expect(concurrent?.revisionIds).toContain("rev-phone-edit");
    expect(concurrent?.revisionIds).toContain("rev-desktop-edit");
    const stored = await host.client.syncConflict.findUnique({ where: { conflictId: "concurrent-edit:entry-shared" } });
    expect(stored?.state).toBe("UNRESOLVED");
  });

  it("union-counts same-activity overlaps while keeping both sources", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const a = revision("rev-a", "entry-a", null, "2026-09-26T07:00:00.000Z", "2026-09-26T08:00:00.000Z", seeded.activityId);
    const b = revision("rev-b", "entry-b", null, "2026-09-26T07:30:00.000Z", "2026-09-26T08:30:00.000Z", seeded.activityId);
    const response = await post(request({ entryRevisions: [a, b] }), host.client);
    expect(response.status).toBe(200);
    // No user decision required for same-activity overlap.
    expect((response.json.conflicts as unknown[]).filter((item) => (item as { conflictType: string }).conflictType === "OVERLAP")).toEqual([]);

    const totals = computeActivityTotals(
      [
        { entryId: "entry-a", activityId: seeded.activityId, entryType: "WORK", startedAtMs: Date.parse("2026-09-26T07:00:00.000Z"), endedAtMs: Date.parse("2026-09-26T08:00:00.000Z"), deleted: false },
        { entryId: "entry-b", activityId: seeded.activityId, entryType: "WORK", startedAtMs: Date.parse("2026-09-26T07:30:00.000Z"), endedAtMs: Date.parse("2026-09-26T08:30:00.000Z"), deleted: false },
      ],
      [],
    );
    // 90 shared minutes counted once, not 120.
    expect(totals.byActivitySeconds[seeded.activityId]).toBe(5400);
    expect(await host.client.syncRevision.count()).toBe(2);
  });

  it("excludes unresolved different-activity overlap, resolves, undoes, and resyncs idempotently", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host, "Planning");
    const otherCategory = await host.client.category.create({ data: { name: "Other category" } });
    const otherActivity = await host.client.activity.create({ data: { title: "Focus", categoryId: otherCategory.id } });

    const a = revision("rev-c", "entry-c", null, "2026-09-26T07:00:00.000Z", "2026-09-26T08:00:00.000Z", seeded.activityId);
    const b = revision("rev-d", "entry-d", null, "2026-09-26T07:30:00.000Z", "2026-09-26T08:30:00.000Z", otherActivity.id);
    const synced = await post(request({ entryRevisions: [a, b] }), host.client);
    expect(synced.status).toBe(200);
    const conflicts = synced.json.conflicts as { conflictId: string; conflictType: string; state: string }[];
    expect(conflicts).toHaveLength(1);
    const conflictId = conflicts[0].conflictId;
    expect(conflicts[0]).toMatchObject({ conflictType: "OVERLAP", state: "UNRESOLVED" });

    const intervals = [
      { entryId: "entry-c", activityId: seeded.activityId, entryType: "WORK", startedAtMs: Date.parse("2026-09-26T07:00:00.000Z"), endedAtMs: Date.parse("2026-09-26T08:00:00.000Z"), deleted: false },
      { entryId: "entry-d", activityId: otherActivity.id, entryType: "WORK", startedAtMs: Date.parse("2026-09-26T07:30:00.000Z"), endedAtMs: Date.parse("2026-09-26T08:30:00.000Z"), deleted: false },
    ];
    const unresolved = computeActivityTotals(intervals, [
      { conflictType: "OVERLAP", state: "UNRESOLVED", overlapStartAt: "2026-09-26T07:30:00.000Z", overlapEndAt: "2026-09-26T08:00:00.000Z" },
    ]);
    // Shared 30 minutes excluded from both buckets: 30 + 30, not 60 + 60.
    expect(unresolved.byActivitySeconds[seeded.activityId]).toBe(1800);
    expect(unresolved.byActivitySeconds[otherActivity.id]).toBe(1800);

    // Resolve by keeping the first entry; history is retained.
    const resolution: IncomingResolution = {
      resolutionId: "res-1",
      conflictId,
      action: "KEEP_ENTRY",
      selectedRevisionId: "rev-c",
      resultEntryIds: ["entry-c"],
      resolvedByDeviceId: "android-test-device",
      resolvedAt: "2026-09-26T09:00:00.000Z",
      undoesResolutionId: null,
    };
    const resolved = await post(request({ resolutions: [resolution] }), host.client);
    expect(resolved.status).toBe(200);
    expect(resolved.json.acceptedResolutionIds).toEqual(["res-1"]);
    expect((await host.client.syncConflict.findUnique({ where: { conflictId } }))?.state).toBe("RESOLVED");
    expect(await host.client.conflictResolution.count()).toBe(1);

    // Undo re-opens the conflict without deleting history.
    const undo: IncomingResolution = {
      resolutionId: "res-undo-1",
      conflictId,
      action: "UNDO",
      selectedRevisionId: null,
      resultEntryIds: [] as string[],
      resolvedByDeviceId: "android-test-device",
      resolvedAt: "2026-09-26T10:00:00.000Z",
      undoesResolutionId: "res-1",
    };
    const undone = await post(request({ resolutions: [undo] }), host.client);
    expect(undone.status).toBe(200);
    expect((await host.client.syncConflict.findUnique({ where: { conflictId } }))?.state).toBe("UNDONE");
    expect(await host.client.conflictResolution.count()).toBe(2);

    // Idempotent resync: repeating everything changes nothing and reports the same state.
    const replay = await post(
      request({ entryRevisions: [a, b], resolutions: [resolution, undo] }),
      host.client,
    );
    expect(replay.status).toBe(200);
    expect(replay.json.acceptedRevisionIds).toEqual(["rev-c", "rev-d"]);
    expect(replay.json.acceptedResolutionIds).toEqual(["res-1", "res-undo-1"]);
    expect(await host.client.syncRevision.count()).toBe(2);
    expect(await host.client.conflictResolution.count()).toBe(2);
  });
});
