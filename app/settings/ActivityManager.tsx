"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import {
  ActivityFormDialog,
  patchActivity,
  type ActivityWithCategory,
} from "./ActivityFormDialog";

function sortActivities(list: ActivityWithCategory[]) {
  return [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

function formatDurationMinutes(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min default`;
}

// Render Settings UI for managing activity presets.
export function ActivityManager({
  activities,
  categories,
}: {
  activities: ActivityWithCategory[];
  categories: CategoryModel[];
}) {
  const router = useRouter();

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories],
  );

  const activeSorted = useMemo(
    () => sortActivities(activities.filter((a) => !a.isArchived)),
    [activities],
  );

  const archivedSorted = useMemo(
    () => sortActivities(activities.filter((a) => a.isArchived)),
    [activities],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<ActivityWithCategory | null>(null);

  async function onArchive(id: string) {
    setError(null);
    try {
      setIsSaving(true);
      await patchActivity(id, { isArchived: true });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive activity.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onRestore(id: string) {
    setError(null);
    try {
      setIsSaving(true);
      await patchActivity(id, { isArchived: false });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore activity.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onTogglePin(activity: ActivityWithCategory) {
    setError(null);
    try {
      setIsSaving(true);
      await patchActivity(activity.id, { isPinned: !activity.isPinned });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pin.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onMove(id: string, direction: "up" | "down") {
    setError(null);
    const idx = activeSorted.findIndex((a) => a.id === id);
    if (idx < 0) return;

    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= activeSorted.length) return;

    const a = activeSorted[idx];
    const b = activeSorted[swapWith];

    try {
      setIsSaving(true);
      await patchActivity(a.id, { sortOrder: b.sortOrder ?? 0 });
      await patchActivity(b.id, { sortOrder: a.sortOrder ?? 0 });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reorder activities.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderActivityRow(
    activity: ActivityWithCategory,
    options: {
      index?: number;
      listLength?: number;
      archived?: boolean;
    },
  ) {
    const categoryDisabled = !options.archived && activity.category.isArchived;
    const durationLabel = formatDurationMinutes(activity.defaultDurationSeconds);

    return (
      <div
        key={activity.id}
        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
          categoryDisabled
            ? "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: activity.color ?? activity.category.color ?? "#71717a" }}
              aria-hidden
            />
            <div
              className={`truncate text-sm ${
                categoryDisabled
                  ? "text-amber-900 dark:text-amber-200"
                  : "text-zinc-900 dark:text-zinc-50"
              }`}
            >
              {activity.title}
              {activity.isPinned ? (
                <span className="ml-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Pinned
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {activity.category.name}
            {durationLabel ? ` · ${durationLabel}` : ""}
          </div>
          {categoryDisabled ? (
            <div className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              Category archived — edit to reassign a category.
            </div>
          ) : null}
        </div>

        <div className="inline-flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditActivity(activity)}
            disabled={isSaving}
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
          >
            Edit
          </button>

          {options.archived ? (
            <button
              type="button"
              onClick={() => onRestore(activity.id)}
              disabled={isSaving}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onTogglePin(activity)}
                disabled={isSaving || categoryDisabled}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                {activity.isPinned ? "Unpin" : "Pin"}
              </button>
              <button
                type="button"
                onClick={() => onMove(activity.id, "up")}
                disabled={isSaving || categoryDisabled || options.index === 0}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                Up
              </button>
              <button
                type="button"
                onClick={() => onMove(activity.id, "down")}
                disabled={
                  isSaving ||
                  categoryDisabled ||
                  options.index === (options.listLength ?? 1) - 1
                }
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                Down
              </button>
              <button
                type="button"
                onClick={() => onArchive(activity.id)}
                disabled={isSaving}
                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Activities
            </div>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Reusable presets that pre-fill title and category when tracking time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={isSaving || !activeCategories.length}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New activity
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Active
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {!activeSorted.length ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                No active activities yet.
              </div>
            ) : null}
            {activeSorted.map((activity, index) =>
              renderActivityRow(activity, {
                index,
                listLength: activeSorted.length,
              }),
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Archived
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {!archivedSorted.length ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">
                No archived activities.
              </div>
            ) : null}
            {archivedSorted.map((activity) =>
              renderActivityRow(activity, { archived: true }),
            )}
          </div>
        </div>
      </div>

      <ActivityFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        categories={categories}
      />

      <ActivityFormDialog
        open={Boolean(editActivity)}
        onClose={() => setEditActivity(null)}
        activity={editActivity}
        categories={categories}
      />
    </div>
  );
}
