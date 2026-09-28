/** Prisma-backed HostSyncStore for the Next.js sync routes (T025). Server-owned data access only. */

import { randomUUID } from "node:crypto";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaClient as PrismaClientRuntime } from "@/app/generated/prisma/client";
import {
  resolveEntryCategoryId,
  UNASSIGNED_CATEGORY_NAME,
} from "./activity-mapping";
import type { RevisionLineage } from "./conflict-service";
import type { SyncInterval } from "./overlap";
import type {
  ChangeLogEntry,
  HostSyncStore,
  StoredConflict,
  StoredResolution,
  StoredRevision,
} from "./exchange-service";
import type { IncomingResolution, IncomingRevision } from "./validation";

type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

let defaultClient: PrismaClient | null = null;

/**
 * Lazily create the production Prisma client from DATABASE_URL.
 * Kept in this module (instead of app/server/db) so contract tests can import
 * the store without pulling in the server-only marker.
 */
function getDefaultClient(): PrismaClient {
  if (!defaultClient) {
    const url = process.env.DATABASE_URL ?? "";
    if (!url.startsWith("file:")) {
      throw new Error(`DATABASE_URL must be a sqlite file: URL.`);
    }
    const adapter = new PrismaBetterSqlite3({ url });
    defaultClient = new PrismaClientRuntime({ adapter });
  }
  return defaultClient;
}

/** Canonical JSON with sorted keys for order-independent payload comparison. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sameEntryPayload(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

export function parseEntryIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function parseRevision(row: {
  revisionId: string;
  entryId: string;
  baseRevisionId: string | null;
  changedByDeviceId: string;
  sourceDeviceId: string;
  updatedAt: Date;
  payloadJson: string;
  seq: number;
}): StoredRevision | null {
  try {
    const entry: unknown = JSON.parse(row.payloadJson);
    if (typeof entry !== "object" || entry === null) return null;
    return {
      revisionId: row.revisionId,
      entryId: row.entryId,
      baseRevisionId: row.baseRevisionId,
      sourceDeviceId: row.sourceDeviceId,
      changedByDeviceId: row.changedByDeviceId,
      updatedAt: row.updatedAt.toISOString(),
      entry: entry as StoredRevision["entry"],
      seq: row.seq,
    };
  } catch {
    return null;
  }
}

/** Prisma-backed store. All exchange work runs inside one Prisma transaction. */
export class PrismaHostStore implements HostSyncStore {
  private tx: PrismaTx | null = null;
  private desktopDeviceId: string | null = null;
  private readonly client: PrismaClient | null;

  constructor(client?: PrismaClient) {
    this.client = client ?? null;
  }

  private db(): PrismaTx {
    return (this.tx ?? this.client ?? getDefaultClient()) as unknown as PrismaTx;
  }

  async transaction<T>(
    work: (store: HostSyncStore) => Promise<T>,
  ): Promise<T> {
    const client = (this.client ?? getDefaultClient()) as unknown as PrismaClient;
    return (client.$transaction as (fn: (tx: unknown) => Promise<T>) => Promise<T>)(
      async (tx) => {
        const store = new PrismaHostStore();
        store.tx = tx as unknown as PrismaTx;
        return work(store);
      },
    );
  }

  async getDesktopDeviceId(): Promise<string> {
    if (this.desktopDeviceId) return this.desktopDeviceId;
    const db = this.db();
    const existing = await db.syncDevice.findFirst({
      where: { deviceType: "DESKTOP" },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      this.desktopDeviceId = existing.deviceId;
      return existing.deviceId;
    }
    const created = await db.syncDevice.create({
      data: { deviceId: randomUUID(), deviceType: "DESKTOP" },
    });
    this.desktopDeviceId = created.deviceId;
    return created.deviceId;
  }

  async getNextSeq(): Promise<number> {
    const db = this.db();
    const last = await db.hostChangeLog.findFirst({ orderBy: { seq: "desc" } });
    return (last?.seq ?? 0) + 1;
  }

  async hasRevision(revisionId: string): Promise<boolean> {
    const row = await this.db().syncRevision.findUnique({ where: { revisionId } });
    return row !== null;
  }

  async hasResolution(resolutionId: string): Promise<boolean> {
    const row = await this.db().conflictResolution.findUnique({
      where: { resolutionId },
    });
    return row !== null;
  }

  async getRevisionsForEntry(entryId: string): Promise<RevisionLineage[]> {
    const rows = await this.db().syncRevision.findMany({
      where: { entryId },
      orderBy: { seq: "asc" },
    });
    return rows.map((row) => ({
      revisionId: row.revisionId,
      entryId: row.entryId,
      baseRevisionId: row.baseRevisionId,
    }));
  }

  async getConflict(conflictId: string): Promise<StoredConflict | null> {
    const row = await this.db().syncConflict.findUnique({ where: { conflictId } });
    if (!row) return null;
    return {
      conflictId: row.conflictId,
      conflictType: row.conflictType as StoredConflict["conflictType"],
      entryIds: parseEntryIds(row.entryIdsJson),
      revisionIds: parseEntryIds(row.revisionIdsJson),
      overlapStartAt: row.overlapStartAt?.toISOString() ?? null,
      overlapEndAt: row.overlapEndAt?.toISOString() ?? null,
      state: row.state as StoredConflict["state"],
      resolutionId: row.resolutionId,
    };
  }

  async getAllIntervals(): Promise<SyncInterval[]> {
    await this.backfillLegacySessions();
    await this.synthesizeDesktopEdits();
    const db = this.db();
    const revisions = await db.syncRevision.findMany({ orderBy: { seq: "asc" } });
    const latest = new Map<string, StoredRevision>();
    for (const row of revisions) {
      const parsed = parseRevision(row);
      if (parsed) latest.set(parsed.entryId, parsed);
    }
    return [...latest.values()].map((revision) => ({
      entryId: revision.entryId,
      activityId:
        revision.entry.entryType === "BREAK" ? null : revision.entry.activityId,
      entryType: revision.entry.entryType,
      startedAtMs: Date.parse(revision.entry.startedAt),
      endedAtMs: Date.parse(revision.entry.endedAt),
      deleted: revision.entry.deletedAt !== null,
    }));
  }

  async saveRevision(revision: IncomingRevision, seq: number): Promise<void> {
    const db = this.db();
    await db.syncRevision.create({
      data: {
        revisionId: revision.revisionId,
        entryId: revision.entryId,
        baseRevisionId: revision.baseRevisionId,
        changedByDeviceId: revision.changedByDeviceId,
        sourceDeviceId: revision.sourceDeviceId,
        updatedAt: new Date(revision.updatedAt),
        payloadJson: JSON.stringify(revision.entry),
        seq,
      },
    });
    await this.projectRevisionToSession(revision);
  }

  async saveResolution(resolution: IncomingResolution, seq: number): Promise<void> {
    await this.db().conflictResolution.create({
      data: {
        resolutionId: resolution.resolutionId,
        conflictId: resolution.conflictId,
        action: resolution.action,
        selectedRevisionId: resolution.selectedRevisionId,
        resultEntryIdsJson: JSON.stringify(resolution.resultEntryIds),
        resolvedByDeviceId: resolution.resolvedByDeviceId,
        resolvedAt: new Date(resolution.resolvedAt),
        undoesResolutionId: resolution.undoesResolutionId,
        seq,
      },
    });
  }

  async saveConflict(conflict: StoredConflict): Promise<void> {
    await this.db().syncConflict.create({
      data: {
        conflictId: conflict.conflictId,
        conflictType: conflict.conflictType,
        entryIdsJson: JSON.stringify(conflict.entryIds),
        revisionIdsJson: JSON.stringify(conflict.revisionIds),
        overlapStartAt: conflict.overlapStartAt ? new Date(conflict.overlapStartAt) : null,
        overlapEndAt: conflict.overlapEndAt ? new Date(conflict.overlapEndAt) : null,
        state: conflict.state,
        resolutionId: conflict.resolutionId,
      },
    });
  }

  async updateConflict(conflict: StoredConflict): Promise<void> {
    await this.db().syncConflict.update({
      where: { conflictId: conflict.conflictId },
      data: {
        entryIdsJson: JSON.stringify(conflict.entryIds),
        revisionIdsJson: JSON.stringify(conflict.revisionIds),
        overlapStartAt: conflict.overlapStartAt ? new Date(conflict.overlapStartAt) : null,
        overlapEndAt: conflict.overlapEndAt ? new Date(conflict.overlapEndAt) : null,
        state: conflict.state,
        resolutionId: conflict.resolutionId,
      },
    });
  }

  async appendChange(
    seq: number,
    kind: ChangeLogEntry["kind"],
    refId: string,
  ): Promise<void> {
    await this.db().hostChangeLog.create({
      data: { changeId: randomUUID(), seq, kind, refId },
    });
  }

  async getChangesAfter(seq: number, limit: number): Promise<ChangeLogEntry[]> {
    const rows = await this.db().hostChangeLog.findMany({
      where: { seq: { gt: seq } },
      orderBy: { seq: "asc" },
      take: limit,
    });
    return rows.map((row) => ({
      seq: row.seq,
      kind: row.kind as ChangeLogEntry["kind"],
      refId: row.refId,
    }));
  }

  async getRevision(revisionId: string): Promise<StoredRevision | null> {
    const row = await this.db().syncRevision.findUnique({ where: { revisionId } });
    return row ? parseRevision(row) : null;
  }

  async getResolution(resolutionId: string): Promise<StoredResolution | null> {
    const row = await this.db().conflictResolution.findUnique({
      where: { resolutionId },
    });
    if (!row) return null;
    return {
      resolutionId: row.resolutionId,
      conflictId: row.conflictId,
      action: row.action as StoredResolution["action"],
      selectedRevisionId: row.selectedRevisionId,
      resultEntryIds: parseEntryIds(row.resultEntryIdsJson),
      resolvedByDeviceId: row.resolvedByDeviceId,
      resolvedAt: row.resolvedAt.toISOString(),
      undoesResolutionId: row.undoesResolutionId,
      seq: row.seq,
    };
  }

  async listActivities() {
    const rows = await this.db().activity.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.map((activity) => ({
      activityId: activity.id,
      title: activity.title,
      categoryId: activity.categoryId,
      color: activity.color,
      sortOrder: activity.sortOrder,
      isArchived: activity.isArchived,
    }));
  }

  async listCategories() {
    const rows = await this.db().category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    return rows.map((category) => ({
      categoryId: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isArchived: category.isArchived,
    }));
  }

  async getCategory(categoryId: string): Promise<{ categoryId: string; isArchived: boolean } | null> {
    const category = await this.db().category.findUnique({
      where: { id: categoryId },
      select: { id: true, isArchived: true },
    });
    return category ? { categoryId: category.id, isArchived: category.isArchived } : null;
  }

  async touchDevice(deviceId: string, deviceType: string): Promise<void> {
    await this.db().syncDevice.upsert({
      where: { deviceId },
      create: { deviceId, deviceType, lastSeenAt: new Date() },
      update: { lastSeenAt: new Date() },
    });
  }

  private async ensureUnassignedCategory(): Promise<string> {
    const db = this.db();
    const existing = await db.category.findUnique({
      where: { name: UNASSIGNED_CATEGORY_NAME },
    });
    if (existing) return existing.id;
    const created = await db.category.create({
      data: { name: UNASSIGNED_CATEGORY_NAME },
    });
    return created.id;
  }

  /** Assign stable entry identities to legacy desktop sessions exactly once. */
  private async backfillLegacySessions(): Promise<void> {
    const db = this.db();
    const desktopDeviceId = await this.getDesktopDeviceId();
    const unassignedCategoryId = await this.ensureUnassignedCategory();
    void unassignedCategoryId;
    const pending = await db.session.findMany({ where: { syncId: null } });
    for (const session of pending) {
      const entryId = `legacy:${session.id}`;
      const startedAt = session.startedAt ?? session.occurredAt;
      const endedAt =
        session.endedAt ??
        new Date(startedAt.getTime() + session.durationSeconds * 1000);
      const payload = {
        entryType: "WORK",
        ...(session.title?.trim() ? { title: session.title.trim() } : {}),
        activityId: session.activityId,
        categoryId: session.categoryId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        timeZoneId: session.timeZone,
        timeZoneOffsetMinutes: session.timeZoneOffsetMinutes,
        confirmationState: session.confirmationState ?? "CONFIRMED",
        deletedAt: session.deletedAt ? session.deletedAt.toISOString() : null,
      };
      const revisionId = `rev-initial-${session.id}`;
      const existingRevision = await db.syncRevision.findUnique({
        where: { revisionId },
      });
      const seq = await this.getNextSeq();
      if (!existingRevision) {
        await db.syncRevision.create({
          data: {
            revisionId,
            entryId,
            baseRevisionId: null,
            changedByDeviceId: desktopDeviceId,
            sourceDeviceId: session.sourceDeviceId ?? desktopDeviceId,
            updatedAt: session.updatedAt,
            payloadJson: JSON.stringify(payload),
            seq,
          },
        });
        await db.hostChangeLog.create({
          data: { changeId: randomUUID(), seq, kind: "REVISION", refId: revisionId },
        });
      }
      await db.session.update({
        where: { id: session.id },
        data: {
          syncId: entryId,
          sourceDeviceId: session.sourceDeviceId ?? desktopDeviceId,
          currentRevisionId: revisionId,
        },
      });
    }
  }

  /**
   * Detect desktop-native edits (made through existing session routes) by
   * comparing Session content against the latest revision payload, and
   * synthesize host revisions for diverged rows. Ordering still uses the host
   * sequence; content comparison never acts as a cursor.
   */
  private async synthesizeDesktopEdits(): Promise<void> {
    const db = this.db();
    const desktopDeviceId = await this.getDesktopDeviceId();
    const sessions = await db.session.findMany({
      where: { syncId: { not: null } },
    });
    for (const session of sessions) {
      const entryId = session.syncId as string;
      const latest = await db.syncRevision.findMany({
        where: { entryId },
        orderBy: { seq: "desc" },
        take: 1,
      });
      const current = latest[0] ? parseRevision(latest[0]) : null;
      const startedAt = session.startedAt ?? session.occurredAt;
      const endedAt =
        session.endedAt ??
        new Date(startedAt.getTime() + session.durationSeconds * 1000);
      const candidate = {
        entryType: session.entryType ?? "WORK",
        ...(session.title?.trim() ? { title: session.title.trim() } : {}),
        activityId: session.activityId,
        categoryId: session.categoryId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        timeZoneId: session.timeZone,
        timeZoneOffsetMinutes: session.timeZoneOffsetMinutes,
        confirmationState: session.confirmationState ?? "CONFIRMED",
        deletedAt: session.deletedAt ? session.deletedAt.toISOString() : null,
      };
      // Incoming payloads may carry categoryId null (resolved server-side via
      // the activity); normalize the stored revision the same way before
      // comparing so projection alone never looks like a desktop edit.
      let normalizedCurrent: unknown = current?.entry ?? null;
      if (current && current.entry.categoryId === null && current.entry.activityId) {
        const activity = await db.activity.findUnique({
          where: { id: current.entry.activityId },
        });
        normalizedCurrent = {
          ...current.entry,
          categoryId: activity?.categoryId ?? current.entry.categoryId,
        };
      }
      if (current && sameEntryPayload(normalizedCurrent, candidate)) {
        continue;
      }
      const revisionId = randomUUID();
      const seq = await this.getNextSeq();
      await db.syncRevision.create({
        data: {
          revisionId,
          entryId,
          baseRevisionId: current?.revisionId ?? session.currentRevisionId,
          changedByDeviceId: desktopDeviceId,
          sourceDeviceId: session.sourceDeviceId ?? desktopDeviceId,
          updatedAt: session.updatedAt,
          payloadJson: JSON.stringify(candidate),
          seq,
        },
      });
      await db.hostChangeLog.create({
        data: { changeId: randomUUID(), seq, kind: "REVISION", refId: revisionId },
      });
      await db.session.update({
        where: { id: session.id },
        data: { currentRevisionId: revisionId },
      });
    }
  }

  /** Project an accepted incoming revision into the desktop Session table. */
  private async projectRevisionToSession(revision: IncomingRevision): Promise<void> {
    const db = this.db();
    const entry = revision.entry;
    const unassignedCategoryId = await this.ensureUnassignedCategory();
    let activityCategoryId: string | null = null;
    if (entry.activityId) {
      const activity = await db.activity.findUnique({
        where: { id: entry.activityId },
      });
      activityCategoryId = activity?.categoryId ?? null;
    }
    const categoryId = resolveEntryCategoryId(
      entry.categoryId,
      entry.activityId && activityCategoryId
        ? { id: entry.activityId, title: "", categoryId: activityCategoryId, color: null, sortOrder: 0, isArchived: false }
        : null,
      unassignedCategoryId,
    );
    const startedAt = new Date(entry.startedAt);
    const endedAt = new Date(entry.endedAt);
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    const data = {
      categoryId,
      occurredAt: startedAt,
      startedAt,
      endedAt,
      durationSeconds,
      timeZone: entry.timeZoneId,
      timeZoneOffsetMinutes: entry.timeZoneOffsetMinutes,
      activityId: entry.entryType === "BREAK" ? null : entry.activityId,
      entryType: entry.entryType,
      confirmationState: entry.confirmationState,
      sourceDeviceId: revision.sourceDeviceId,
      currentRevisionId: revision.revisionId,
      deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : null,
    };
    const title = entry.title?.trim();
    const existing = await db.session.findUnique({
      where: { syncId: revision.entryId },
    });
    if (existing) {
      await db.session.update({
        where: { syncId: revision.entryId },
        data: { ...data, ...(title ? { title } : {}) },
      });
    } else {
      await db.session.create({
        data: {
          ...data,
          title: title || null,
          kind: "MANUAL",
          syncId: revision.entryId,
        },
      });
    }
  }
}
