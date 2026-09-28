/** Conflict detection helpers: concurrent edits and overlap conflicts (T038). */

import {
  findOverlaps,
  overlapConflictId,
  type IntervalOverlap,
  type SyncInterval,
} from "./overlap";
import type { ConflictState, ConflictType } from "./validation";

export interface RevisionLineage {
  revisionId: string;
  entryId: string;
  baseRevisionId: string | null;
}

export interface DetectedConflict {
  conflictId: string;
  conflictType: ConflictType;
  entryIds: string[];
  revisionIds: string[];
  overlapStartAt: string | null;
  overlapEndAt: string | null;
  state: ConflictState;
}

/**
 * Detect concurrent edits: two revisions descending from the same base where
 * neither is an ancestor of the other. Never selects a winner; both branches
 * are preserved and surfaced for a user decision.
 */
export function detectConcurrentEdits(
  existing: RevisionLineage[],
  incoming: RevisionLineage,
): RevisionLineage[] {
  if (incoming.baseRevisionId === null) return [];
  return existing.filter(
    (revision) =>
      revision.entryId === incoming.entryId &&
      revision.revisionId !== incoming.revisionId &&
      revision.baseRevisionId === incoming.baseRevisionId,
  );
}

/** Deterministic conflict id for a concurrent-edit branch set. */
export function concurrentEditConflictId(entryId: string): string {
  return `concurrent-edit:${entryId}`;
}

/**
 * Build overlap conflicts for entries that intersect. Same-activity pairs are
 * reported so callers can union-count them; different-activity (or
 * Unassigned-mixed) pairs require a user decision.
 */
export function detectOverlapConflicts(
  intervals: SyncInterval[],
): { conflict: DetectedConflict; overlap: IntervalOverlap }[] {
  return findOverlaps(intervals).map((overlap) => ({
    overlap,
    conflict: {
      conflictId: overlapConflictId(overlap.entryIdA, overlap.entryIdB),
      conflictType: "OVERLAP",
      entryIds: [overlap.entryIdA, overlap.entryIdB].sort(),
      revisionIds: [],
      overlapStartAt: new Date(overlap.overlap.startMs).toISOString(),
      overlapEndAt: new Date(overlap.overlap.endMs).toISOString(),
      state: "UNRESOLVED",
    },
  }));
}
