/** Activity/Category mapping between phone entries and desktop records (T025). */

export const UNASSIGNED_CATEGORY_NAME = "Unassigned";

export interface DesktopActivityRecord {
  id: string;
  title: string;
  categoryId: string;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface ActivitySnapshotInput {
  activityId: string;
  title: string;
  categoryId: string;
  color: string | null;
  sortOrder: number;
  isArchived: boolean;
}

export interface LegacySessionInput {
  id: string;
  title: string | null;
  categoryId: string;
  startedAt: Date | null;
  endedAt: Date | null;
  occurredAt: Date;
  durationSeconds: number;
  timeZone: string;
  timeZoneOffsetMinutes: number | null;
}

/**
 * Map a legacy desktop session (no Activity relation) to a synced entry
 * snapshot. The activity is Unassigned (null) while title and category data
 * are preserved on the Session row itself.
 */
export function mapLegacySessionToEntry(session: LegacySessionInput): {
  entryId: string;
  startedAt: string;
  endedAt: string;
  timeZoneId: string;
  timeZoneOffsetMinutes: number | null;
  activityId: null;
  categoryId: string;
  entryType: "WORK";
  confirmationState: "CONFIRMED";
} {
  const startedAt = session.startedAt ?? session.occurredAt;
  const endedAt =
    session.endedAt ??
    new Date(startedAt.getTime() + session.durationSeconds * 1000);
  return {
    entryId: `legacy:${session.id}`,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    timeZoneId: session.timeZone,
    timeZoneOffsetMinutes: session.timeZoneOffsetMinutes,
    activityId: null,
    categoryId: session.categoryId,
    entryType: "WORK",
    confirmationState: "CONFIRMED",
  };
}

/**
 * Resolve the desktop category for an incoming phone entry. Phone entries
 * carry the desktop activity's category when known; Unassigned or break
 * entries without a category fall back to the reserved Unassigned category.
 * Existing non-phone categories are never modified.
 */
export function resolveEntryCategoryId(
  entryCategoryId: string | null,
  activity: DesktopActivityRecord | null,
  unassignedCategoryId: string,
): string {
  if (entryCategoryId) return entryCategoryId;
  if (activity) return activity.categoryId;
  return unassignedCategoryId;
}

/** Keep Activity distinct from Category: an activity id never substitutes for a category id. */
export function toActivitySnapshot(
  activity: DesktopActivityRecord,
): ActivitySnapshotInput {
  return {
    activityId: activity.id,
    title: activity.title,
    categoryId: activity.categoryId,
    color: activity.color,
    sortOrder: activity.sortOrder,
    isArchived: activity.isArchived,
  };
}
