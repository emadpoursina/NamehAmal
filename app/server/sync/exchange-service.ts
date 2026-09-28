/**
 * Transactional sync exchange orchestration (T025/T038).
 * Applies a validated Android-initiated exchange atomically: the whole batch
 * is rejected on structural/database failure and never partially acknowledged.
 */

import {
  concurrentEditConflictId,
  detectConcurrentEdits,
  type RevisionLineage,
} from "./conflict-service";
import { findOverlaps, overlapConflictId, type SyncInterval } from "./overlap";
import {
  decodeCursor,
  encodeCursor,
  EXCHANGE_PAGE_SIZE,
  type ConflictDto,
  type ExchangeRequest,
  type ExchangeResponse,
  type IncomingResolution,
  type IncomingRevision,
  type ResolutionDto,
} from "./validation";

export interface StoredRevision extends IncomingRevision {
  seq: number;
}

export interface StoredResolution extends IncomingResolution {
  seq: number;
}

export interface StoredConflict {
  conflictId: string;
  conflictType: "CONCURRENT_EDIT" | "OVERLAP";
  entryIds: string[];
  revisionIds: string[];
  overlapStartAt: string | null;
  overlapEndAt: string | null;
  state: "UNRESOLVED" | "RESOLVED" | "UNDONE";
  resolutionId: string | null;
}

export interface ChangeLogEntry {
  seq: number;
  kind: "REVISION" | "CONFLICT" | "RESOLUTION";
  refId: string;
}

/** Minimal host persistence surface used by the exchange. Prisma backs production; tests use memory. */
export interface HostSyncStore {
  getDesktopDeviceId(): Promise<string>;
  getNextSeq(): Promise<number>;
  hasRevision(revisionId: string): Promise<boolean>;
  hasResolution(resolutionId: string): Promise<boolean>;
  getRevisionsForEntry(entryId: string): Promise<RevisionLineage[]>;
  getConflict(conflictId: string): Promise<StoredConflict | null>;
  getAllIntervals(): Promise<SyncInterval[]>;
  saveRevision(revision: IncomingRevision, seq: number): Promise<void>;
  saveResolution(resolution: IncomingResolution, seq: number): Promise<void>;
  saveConflict(conflict: StoredConflict): Promise<void>;
  updateConflict(conflict: StoredConflict): Promise<void>;
  appendChange(seq: number, kind: ChangeLogEntry["kind"], refId: string): Promise<void>;
  getChangesAfter(seq: number, limit: number): Promise<ChangeLogEntry[]>;
  getRevision(revisionId: string): Promise<StoredRevision | null>;
  getResolution(resolutionId: string): Promise<StoredResolution | null>;
  listActivities(): Promise<
    {
      activityId: string;
      title: string;
      categoryId: string;
      color: string | null;
      sortOrder: number;
      isArchived: boolean;
    }[]
  >;
  touchDevice(deviceId: string, deviceType: string): Promise<void>;
  transaction<T>(work: (store: HostSyncStore) => Promise<T>): Promise<T>;
}

function stripSeq<T extends { seq: number }>(stored: T): Omit<T, "seq"> {
  const { seq: _ignored, ...rest } = stored;
  void _ignored;
  return rest;
}

function toConflictDto(conflict: StoredConflict): ConflictDto {
  return {
    conflictId: conflict.conflictId,
    conflictType: conflict.conflictType,
    entryIds: conflict.entryIds,
    revisionIds: conflict.revisionIds,
    overlapStartAt: conflict.overlapStartAt,
    overlapEndAt: conflict.overlapEndAt,
    state: conflict.state,
    resolutionId: conflict.resolutionId,
  };
}

function toResolutionDto(resolution: IncomingResolution): ResolutionDto {
  return {
    resolutionId: resolution.resolutionId,
    conflictId: resolution.conflictId,
    action: resolution.action,
    selectedRevisionId: resolution.selectedRevisionId,
    resultEntryIds: resolution.resultEntryIds,
    resolvedByDeviceId: resolution.resolvedByDeviceId,
    resolvedAt: resolution.resolvedAt,
    undoesResolutionId: resolution.undoesResolutionId,
  };
}

function intervalForRevision(revision: IncomingRevision): SyncInterval {
  return {
    entryId: revision.entryId,
    activityId: revision.entry.entryType === "BREAK" ? null : revision.entry.activityId,
    entryType: revision.entry.entryType,
    startedAtMs: Date.parse(revision.entry.startedAt),
    endedAtMs: Date.parse(revision.entry.endedAt),
    deleted: revision.entry.deletedAt !== null,
  };
}

export interface ExchangeOutcome {
  response: ExchangeResponse;
}

/** Narrow 005 exchange: store incoming revisions and acknowledge them, never download host state. */
async function applyUploadOnlyExchange(
  store: HostSyncStore,
  request: ExchangeRequest,
): Promise<ExchangeOutcome> {
  return store.transaction(async (tx) => {
    const desktopDeviceId = await tx.getDesktopDeviceId();
    let nextSeq = await tx.getNextSeq();
    const acceptedRevisionIds: string[] = [];

    for (const revision of request.entryRevisions) {
      if (await tx.hasRevision(revision.revisionId)) {
        acceptedRevisionIds.push(revision.revisionId);
        continue;
      }
      await tx.saveRevision(revision, nextSeq);
      await tx.appendChange(nextSeq, "REVISION", revision.revisionId);
      nextSeq += 1;
      acceptedRevisionIds.push(revision.revisionId);
    }

    await tx.touchDevice(request.deviceId, "ANDROID");
    await tx.touchDevice(desktopDeviceId, "DESKTOP");

    return {
      response: {
        protocolVersion: 1,
        mode: "UPLOAD_ONLY",
        desktopDeviceId,
        acceptedRevisionIds,
        acceptedResolutionIds: [],
        cursor: null,
        hasMore: false,
        entryRevisions: [],
        activities: [],
        conflicts: [],
        resolutions: [],
      },
    };
  });
}

/**
 * Apply one validated exchange inside a single store transaction.
 * Idempotent: previously accepted revision/resolution ids are acknowledged
 * again without creating another record or inflating totals.
 */
export async function applyExchange(
  store: HostSyncStore,
  request: ExchangeRequest,
): Promise<ExchangeOutcome> {
  if (request.mode === "UPLOAD_ONLY") {
    return applyUploadOnlyExchange(store, request);
  }
  const sinceSeq = decodeCursor(request.cursor);
  return store.transaction(async (store) => {
    const desktopDeviceId = await store.getDesktopDeviceId();
    let nextSeq = await store.getNextSeq();

    const acceptedRevisionIds: string[] = [];
    const acceptedResolutionIds: string[] = [];

    // Validate references before mutating anything so the batch stays atomic.
    for (const resolution of request.resolutions) {
      if (resolution.action !== "UNDO") {
        const conflict = await store.getConflict(resolution.conflictId);
        if (!conflict) {
          throw {
            status: 400,
            message: `resolutions: unknown conflict ${resolution.conflictId}; no data was changed.`,
          };
        }
      }
    }

    for (const revision of request.entryRevisions) {
      if (await store.hasRevision(revision.revisionId)) {
        acceptedRevisionIds.push(revision.revisionId);
        continue;
      }
      const siblings = await store.getRevisionsForEntry(revision.entryId);
      const competitors = detectConcurrentEdits(siblings, revision);
      const seq = nextSeq;
      nextSeq += 1;
      await store.saveRevision(revision, seq);
      await store.appendChange(seq, "REVISION", revision.revisionId);
      acceptedRevisionIds.push(revision.revisionId);
      if (competitors.length > 0) {
        const conflictId = concurrentEditConflictId(revision.entryId);
        const existing = await store.getConflict(conflictId);
        const revisionIds = Array.from(
          new Set([
            ...(existing?.revisionIds ?? siblings.map((s) => s.revisionId)),
            revision.revisionId,
          ]),
        );
        if (!existing) {
          await store.saveConflict({
            conflictId,
            conflictType: "CONCURRENT_EDIT",
            entryIds: [revision.entryId],
            revisionIds,
            overlapStartAt: null,
            overlapEndAt: null,
            state: "UNRESOLVED",
            resolutionId: null,
          });
          await store.appendChange(nextSeq, "CONFLICT", conflictId);
          nextSeq += 1;
        } else if (existing.state !== "UNRESOLVED") {
          await store.updateConflict({
            ...existing,
            state: "UNRESOLVED",
            revisionIds,
            resolutionId: null,
          });
          await store.appendChange(nextSeq, "CONFLICT", conflictId);
          nextSeq += 1;
        } else {
          await store.updateConflict({ ...existing, revisionIds });
        }
      }
    }

    // Overlap detection across the full known interval set (now including new revisions).
    const intervals = await store.getAllIntervals();
    for (const revision of request.entryRevisions) {
      if (!intervals.some((interval) => interval.entryId === revision.entryId)) {
        intervals.push(intervalForRevision(revision));
      }
    }
    const overlaps = findOverlaps(intervals);
    for (const overlap of overlaps) {
      if (overlap.sameActivity) continue;
      const { entryIdA, entryIdB } = overlap;
      const conflictId = overlapConflictId(entryIdA, entryIdB);
      const existing = await store.getConflict(conflictId);
      if (!existing) {
        await store.saveConflict({
          conflictId,
          conflictType: "OVERLAP",
          entryIds: [entryIdA, entryIdB].sort(),
          revisionIds: [],
          overlapStartAt: new Date(overlap.overlap.startMs).toISOString(),
          overlapEndAt: new Date(overlap.overlap.endMs).toISOString(),
          state: "UNRESOLVED",
          resolutionId: null,
        });
        await store.appendChange(nextSeq, "CONFLICT", conflictId);
        nextSeq += 1;
      }
    }

    for (const resolution of request.resolutions) {
      if (await store.hasResolution(resolution.resolutionId)) {
        acceptedResolutionIds.push(resolution.resolutionId);
        continue;
      }
      const seq = nextSeq;
      nextSeq += 1;
      await store.saveResolution(resolution, seq);
      await store.appendChange(seq, "RESOLUTION", resolution.resolutionId);
      acceptedResolutionIds.push(resolution.resolutionId);
      const conflict = await store.getConflict(resolution.conflictId);
      if (resolution.action === "UNDO") {
        // Undo re-opens the conflict; original versions and history are retained.
        if (conflict) {
          await store.updateConflict({
            ...conflict,
            state: "UNDONE",
            resolutionId: resolution.resolutionId,
          });
          await store.appendChange(nextSeq, "CONFLICT", conflict.conflictId);
          nextSeq += 1;
        }
      } else if (conflict) {
        await store.updateConflict({
          ...conflict,
          state: "RESOLVED",
          resolutionId: resolution.resolutionId,
        });
        await store.appendChange(nextSeq, "CONFLICT", conflict.conflictId);
        nextSeq += 1;
      }
    }

    await store.touchDevice(request.deviceId, "ANDROID");
    await store.touchDevice(desktopDeviceId, "DESKTOP");

    // Paged host delta after the request cursor, in stable sequence order.
    const page = await store.getChangesAfter(sinceSeq, EXCHANGE_PAGE_SIZE + 1);
    const hasMore = page.length > EXCHANGE_PAGE_SIZE;
    const visible = hasMore ? page.slice(0, EXCHANGE_PAGE_SIZE) : page;

    const entryRevisions: IncomingRevision[] = [];
    const conflicts: ConflictDto[] = [];
    const resolutions: ResolutionDto[] = [];
    for (const change of visible) {
      if (change.kind === "REVISION") {
        const stored = await store.getRevision(change.refId);
        if (stored) {
          entryRevisions.push(stripSeq(stored));
        }
      } else if (change.kind === "CONFLICT") {
        const stored = await store.getConflict(change.refId);
        if (stored) conflicts.push(toConflictDto(stored));
      } else {
        const stored = await store.getResolution(change.refId);
        if (stored) {
          resolutions.push(toResolutionDto(stripSeq(stored)));
        }
      }
    }

    const activities = await store.listActivities();
    const cursor =
      visible.length > 0
        ? encodeCursor(visible[visible.length - 1].seq)
        : (request.cursor ?? encodeCursor(sinceSeq));

    return {
      response: {
        protocolVersion: 1,
        desktopDeviceId,
        acceptedRevisionIds,
        acceptedResolutionIds,
        cursor,
        hasMore,
        entryRevisions,
        activities,
        conflicts,
        resolutions,
      },
    };
  });
}

/** In-memory HostSyncStore for contract tests (no database required). */
export class InMemoryHostStore implements HostSyncStore {
  private revisions = new Map<string, StoredRevision>();
  private revisionsByEntry = new Map<string, StoredRevision[]>();
  private resolutions = new Map<string, StoredResolution>();
  private conflicts = new Map<string, StoredConflict>();
  private changes: ChangeLogEntry[] = [];
  private devices = new Map<string, string>();
  private next = 1;
  readonly desktopDeviceId: string;
  private activities: {
    activityId: string;
    title: string;
    categoryId: string;
    color: string | null;
    sortOrder: number;
    isArchived: boolean;
  }[];
  /** When true, the next transaction fails to simulate a database failure. */
  failNextTransaction = false;

  constructor(
    desktopDeviceId = "desktop-test-id",
    activities: InMemoryHostStore["activities"] = [],
  ) {
    this.desktopDeviceId = desktopDeviceId;
    this.activities = activities;
  }

  async getDesktopDeviceId(): Promise<string> {
    return this.desktopDeviceId;
  }

  async getNextSeq(): Promise<number> {
    return this.next;
  }

  async hasRevision(revisionId: string): Promise<boolean> {
    return this.revisions.has(revisionId);
  }

  async hasResolution(resolutionId: string): Promise<boolean> {
    return this.resolutions.has(resolutionId);
  }

  async getRevisionsForEntry(entryId: string): Promise<RevisionLineage[]> {
    return (this.revisionsByEntry.get(entryId) ?? []).map((revision) => ({
      revisionId: revision.revisionId,
      entryId: revision.entryId,
      baseRevisionId: revision.baseRevisionId,
    }));
  }

  async getConflict(conflictId: string): Promise<StoredConflict | null> {
    return this.conflicts.get(conflictId) ?? null;
  }

  async getAllIntervals(): Promise<SyncInterval[]> {
    const latest = new Map<string, StoredRevision>();
    for (const revision of this.revisions.values()) {
      latest.set(revision.entryId, revision);
    }
    return [...latest.values()].map(intervalForRevision);
  }

  async saveRevision(revision: IncomingRevision, seq: number): Promise<void> {
    const stored: StoredRevision = { ...revision, seq };
    this.revisions.set(revision.revisionId, stored);
    const list = this.revisionsByEntry.get(revision.entryId) ?? [];
    list.push(stored);
    this.revisionsByEntry.set(revision.entryId, list);
  }

  async saveResolution(resolution: IncomingResolution, seq: number): Promise<void> {
    this.resolutions.set(resolution.resolutionId, { ...resolution, seq });
  }

  async saveConflict(conflict: StoredConflict): Promise<void> {
    this.conflicts.set(conflict.conflictId, conflict);
  }

  async updateConflict(conflict: StoredConflict): Promise<void> {
    this.conflicts.set(conflict.conflictId, conflict);
  }

  async appendChange(
    seq: number,
    kind: ChangeLogEntry["kind"],
    refId: string,
  ): Promise<void> {
    this.changes.push({ seq, kind, refId });
    this.changes.sort((a, b) => a.seq - b.seq);
    this.next = Math.max(this.next, seq + 1);
  }

  async getChangesAfter(seq: number, limit: number): Promise<ChangeLogEntry[]> {
    return this.changes.filter((change) => change.seq > seq).slice(0, limit);
  }

  async getRevision(revisionId: string): Promise<StoredRevision | null> {
    return this.revisions.get(revisionId) ?? null;
  }

  async getResolution(resolutionId: string): Promise<StoredResolution | null> {
    return this.resolutions.get(resolutionId) ?? null;
  }

  async listActivities() {
    return this.activities;
  }

  async touchDevice(deviceId: string, deviceType: string): Promise<void> {
    this.devices.set(deviceId, deviceType);
  }

  async transaction<T>(
    work: (store: HostSyncStore) => Promise<T>,
  ): Promise<T> {
    if (this.failNextTransaction) {
      this.failNextTransaction = false;
      throw { status: 503, message: "Host database temporarily unavailable; retry." };
    }
    // Snapshot mutable state so a mid-batch failure rolls back like a real transaction.
    const snapshot = {
      revisions: new Map(this.revisions),
      revisionsByEntry: new Map(
        [...this.revisionsByEntry.entries()].map(([key, value]) => [key, [...value]]),
      ),
      resolutions: new Map(this.resolutions),
      conflicts: new Map(this.conflicts),
      changes: [...this.changes],
      next: this.next,
    };
    try {
      return await work(this);
    } catch (error) {
      this.revisions = snapshot.revisions;
      this.revisionsByEntry = snapshot.revisionsByEntry;
      this.resolutions = snapshot.resolutions;
      this.conflicts = snapshot.conflicts;
      this.changes = snapshot.changes;
      this.next = snapshot.next;
      throw error;
    }
  }
}
