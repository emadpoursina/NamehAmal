/** Category metadata and category-bearing upload contract tests. */
import { afterEach, describe, expect, it } from "vitest";

import { handleStatus } from "@/app/api/sync/v1/status/route";
import { handleExchangePost } from "@/app/server/sync/exchange-handler";
import { createSyncTestHost, seedCategoryAndActivity } from "./sync-test-host";

function revision(
  categoryId: string,
  revisionId = "revision-category",
  entryId = "entry-category",
  activityId: string | null = null,
) {
  return {
    revisionId,
    entryId,
    baseRevisionId: null,
    sourceDeviceId: "android-test-device",
    changedByDeviceId: "android-test-device",
    updatedAt: "2026-09-26T08:00:00.000Z",
    entry: {
      entryType: "WORK",
      title: "Planning",
      activityId,
      categoryId,
      startedAt: "2026-09-26T07:00:00.000Z",
      endedAt: "2026-09-26T08:00:00.000Z",
      timeZoneId: "Asia/Yerevan",
      timeZoneOffsetMinutes: 240,
      confirmationState: "CONFIRMED",
      deletedAt: null,
    },
  };
}

async function uploadRevision(body: unknown, client: Parameters<typeof handleExchangePost>[1]) {
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

describe("sync category metadata contract", () => {
  const hosts: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((host) => host.close()));
  });

  it("returns ordered desktop categories and activity presets only from sync status", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    await host.client.category.update({
      where: { id: seeded.categoryId },
      data: { sortOrder: 20 },
    });
    await host.client.category.create({
      data: { name: "Archived", sortOrder: 10, isArchived: true },
    });
    await host.client.activity.update({
      where: { id: seeded.activityId },
      data: { sortOrder: 20 },
    });
    await host.client.activity.create({
      data: {
        title: "Archived activity",
        categoryId: seeded.categoryId,
        sortOrder: 10,
        isArchived: true,
      },
    });

    const response = await handleStatus(host.client);
    const body = (await response.json()) as Record<string, unknown>;
    const categories = body.categories as {
      categoryId: string;
      name: string;
      sortOrder: number;
      isArchived: boolean;
    }[];
    const activities = body.activities as {
      activityId: string;
      title: string;
      categoryId: string;
      color: string | null;
      sortOrder: number;
      isArchived: boolean;
    }[];

    expect(response.status).toBe(200);
    expect(body.capabilities).toEqual([
      "entry-title",
      "upload-only",
      "category-metadata",
      "activity-metadata",
    ]);
    expect(categories.map(({ name, sortOrder, isArchived }) => ({ name, sortOrder, isArchived }))).toEqual([
      { name: "Archived", sortOrder: 10, isArchived: true },
      { name: "Category Planning", sortOrder: 20, isArchived: false },
    ]);
    expect(categories.find((category) => category.name === "Category Planning")?.categoryId).toBe(seeded.categoryId);
    expect(activities.map(({ title, categoryId, sortOrder, isArchived }) => ({
      title,
      categoryId,
      sortOrder,
      isArchived,
    }))).toEqual([
      { title: "Archived activity", categoryId: seeded.categoryId, sortOrder: 10, isArchived: true },
      { title: "Planning", categoryId: seeded.categoryId, sortOrder: 20, isArchived: false },
    ]);
    expect(activities.find((activity) => activity.title === "Planning")?.activityId).toBe(seeded.activityId);
    expect(body).not.toHaveProperty("sessions");
  });
});

describe("category-bearing upload contract", () => {
  const hosts: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(hosts.splice(0).map((host) => host.close()));
  });

  it("persists a submitted desktop category while keeping upload replies acknowledgement-only", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const response = await uploadRevision(
      {
        protocolVersion: 1,
        mode: "UPLOAD_ONLY",
        deviceId: "android-test-device",
        cursor: null,
        entryRevisions: [revision(seeded.categoryId)],
        resolutions: [],
      },
      host.client,
    );

    expect(response.status).toBe(200);
    expect(response.json.acceptedRevisionIds).toEqual(["revision-category"]);
    expect(response.json.entryRevisions).toEqual([]);
    expect(response.json.activities).toEqual([]);
    expect(response.json.conflicts).toEqual([]);
    expect(response.json.resolutions).toEqual([]);
    const persisted = await host.client.session.findUnique({
      where: { syncId: "entry-category" },
      include: { category: true },
    });
    expect(persisted?.categoryId).toBe(seeded.categoryId);
    expect(persisted?.category.name).toBe("Category Planning");
  });

  it("associates a selected saved Activity with the uploaded desktop Session", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const seeded = await seedCategoryAndActivity(host);
    const response = await uploadRevision(
      {
        protocolVersion: 1,
        mode: "UPLOAD_ONLY",
        deviceId: "android-test-device",
        cursor: null,
        entryRevisions: [revision(seeded.categoryId, "revision-activity", "entry-activity", seeded.activityId)],
        resolutions: [],
      },
      host.client,
    );

    expect(response.status).toBe(200);
    const persisted = await host.client.session.findUnique({
      where: { syncId: "entry-activity" },
      select: { activityId: true, categoryId: true },
    });
    expect(persisted?.activityId).toBe(seeded.activityId);
    expect(persisted?.categoryId).toBe(seeded.categoryId);
    expect((await host.client.activity.findUnique({ where: { id: seeded.activityId } }))?.title).toBe("Planning");
  });

  it("rejects an unavailable category without acknowledging or storing the entry", async () => {
    const host = await createSyncTestHost();
    hosts.push(host);
    const response = await uploadRevision(
      {
        protocolVersion: 1,
        mode: "UPLOAD_ONLY",
        deviceId: "android-test-device",
        cursor: null,
        entryRevisions: [revision("missing-category", "revision-invalid-category", "entry-invalid-category")],
        resolutions: [],
      },
      host.client,
    );

    expect(response.status).toBe(400);
    expect(response.json.acceptedRevisionIds).toBeUndefined();
    expect(await host.client.session.findUnique({ where: { syncId: "entry-invalid-category" } })).toBeNull();
    expect(await host.client.syncRevision.count()).toBe(0);
  });
});
