/** Pure interval-overlap math for sync conflict detection and totals (T038). */

export interface SyncInterval {
  entryId: string;
  activityId: string | null;
  entryType: string;
  startedAtMs: number;
  endedAtMs: number;
  deleted: boolean;
}

export interface OverlapRange {
  startMs: number;
  endMs: number;
}

export interface IntervalOverlap {
  entryIdA: string;
  entryIdB: string;
  activityIdA: string | null;
  activityIdB: string | null;
  /** True when both sides share the same non-null activity (union-count once). */
  sameActivity: boolean;
  overlap: OverlapRange;
}

function isSyncable(interval: SyncInterval): boolean {
  return (
    !interval.deleted &&
    interval.entryType !== "BREAK" &&
    Number.isFinite(interval.startedAtMs) &&
    Number.isFinite(interval.endedAtMs) &&
    interval.endedAtMs > interval.startedAtMs
  );
}

function intersect(
  a: SyncInterval,
  b: SyncInterval,
): OverlapRange | null {
  const startMs = Math.max(a.startedAtMs, b.startedAtMs);
  const endMs = Math.min(a.endedAtMs, b.endedAtMs);
  if (endMs <= startMs) return null;
  return { startMs, endMs };
}

/** Deterministic conflict id for an unordered entry pair. */
export function overlapConflictId(entryIdA: string, entryIdB: string): string {
  const [first, second] = [entryIdA, entryIdB].sort();
  return `overlap:${first}:${second}`;
}

/**
 * Find all pairwise overlaps between distinct syncable entries.
 * Exact duplicates and same-activity overlaps are reported with sameActivity=true;
 * breaks, tombstones, and zero-length intersections are ignored.
 */
export function findOverlaps(intervals: SyncInterval[]): IntervalOverlap[] {
  const usable = intervals.filter(isSyncable);
  const overlaps: IntervalOverlap[] = [];
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const a = usable[i];
      const b = usable[j];
      if (a.entryId === b.entryId) continue;
      const overlap = intersect(a, b);
      if (!overlap) continue;
      const sameActivity =
        a.activityId !== null && a.activityId === b.activityId;
      overlaps.push({
        entryIdA: a.entryId,
        entryIdB: b.entryId,
        activityIdA: a.activityId,
        activityIdB: b.activityId,
        sameActivity,
        overlap,
      });
    }
  }
  return overlaps;
}

/** Merge ranges into a union; shared minutes appear exactly once. */
export function unionRanges(ranges: OverlapRange[]): OverlapRange[] {
  const sorted = [...ranges].sort((a, b) => a.startMs - b.startMs);
  const merged: OverlapRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, range.endMs);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Total covered milliseconds of a range set after unioning. */
export function unionMillis(ranges: OverlapRange[]): number {
  return unionRanges(ranges).reduce(
    (total, range) => total + (range.endMs - range.startMs),
    0,
  );
}

/**
 * Subtract exclusion ranges from base ranges (used to drop unresolved
 * different-activity shared time from totals).
 */
export function subtractRanges(
  base: OverlapRange[],
  exclusions: OverlapRange[],
): OverlapRange[] {
  let result = unionRanges(base);
  for (const exclusion of unionRanges(exclusions)) {
    const next: OverlapRange[] = [];
    for (const range of result) {
      if (
        exclusion.endMs <= range.startMs ||
        exclusion.startMs >= range.endMs
      ) {
        next.push(range);
        continue;
      }
      if (exclusion.startMs > range.startMs) {
        next.push({ startMs: range.startMs, endMs: exclusion.startMs });
      }
      if (exclusion.endMs < range.endMs) {
        next.push({ startMs: exclusion.endMs, endMs: range.endMs });
      }
    }
    result = next;
  }
  return result;
}
