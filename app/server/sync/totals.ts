/** Totals projection honoring overlap/conflict rules (T038). */

import {
  subtractRanges,
  unionMillis,
  type OverlapRange,
  type SyncInterval,
} from "./overlap";

export interface TotalsConflict {
  conflictType: string;
  state: string;
  overlapStartAt: string | null;
  overlapEndAt: string | null;
}

export interface ActivityTotals {
  /** Seconds per activity bucket; the key "UNASSIGNED" holds null-activity work. */
  byActivitySeconds: Record<string, number>;
  /** Total counted work seconds across all buckets. */
  totalWorkSeconds: number;
}

export const UNASSIGNED_BUCKET = "UNASSIGNED";

function bucketFor(activityId: string | null): string {
  return activityId ?? UNASSIGNED_BUCKET;
}

/**
 * Project work totals:
 * - BREAK intervals and tombstones never count.
 * - Same-bucket overlaps union-count shared minutes once; source records stay intact.
 * - Unresolved/undone different-activity overlap spans are excluded until resolved.
 */
export function computeActivityTotals(
  intervals: SyncInterval[],
  conflicts: TotalsConflict[],
): ActivityTotals {
  const usable = intervals.filter(
    (interval) =>
      !interval.deleted &&
      interval.entryType !== "BREAK" &&
      Number.isFinite(interval.startedAtMs) &&
      Number.isFinite(interval.endedAtMs) &&
      interval.endedAtMs > interval.startedAtMs,
  );

  const excluded: OverlapRange[] = [];
  for (const conflict of conflicts) {
    if (conflict.conflictType !== "OVERLAP") continue;
    if (conflict.state !== "UNRESOLVED" && conflict.state !== "UNDONE") continue;
    if (!conflict.overlapStartAt || !conflict.overlapEndAt) continue;
    const startMs = Date.parse(conflict.overlapStartAt);
    const endMs = Date.parse(conflict.overlapEndAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }
    excluded.push({ startMs, endMs });
  }

  const byActivitySeconds: Record<string, number> = {};
  const buckets = new Map<string, OverlapRange[]>();
  for (const interval of usable) {
    const bucket = bucketFor(interval.activityId);
    const ranges = buckets.get(bucket) ?? [];
    // Union within the bucket so same-activity shared time counts once.
    // Cross-bucket shared spans are removed below while unresolved.
    ranges.push({ startMs: interval.startedAtMs, endMs: interval.endedAtMs });
    buckets.set(bucket, ranges);
  }

  let totalWorkSeconds = 0;
  for (const [bucket, ranges] of buckets) {
    const counted = subtractRanges(ranges, excluded);
    const seconds = Math.floor(unionMillis(counted) / 1000);
    byActivitySeconds[bucket] = seconds;
    totalWorkSeconds += seconds;
  }

  return { byActivitySeconds, totalWorkSeconds };
}
