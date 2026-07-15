"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityModel, CategoryModel } from "@/app/generated/prisma/models";
import { invalidateActivitiesCache } from "@/app/lib/use-activities";

export type ActivityWithCategory = ActivityModel & { category: CategoryModel };

type ActivityFormPayload = {
  title: string;
  categoryId: string;
  defaultDurationSeconds: number | null;
  color: string | null;
  isPinned: boolean;
};

async function createActivity(payload: ActivityFormPayload): Promise<ActivityWithCategory> {
  const res = await fetch("/api/activities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: ActivityWithCategory;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || `Failed to create activity (${res.status}).`);
  }
  return json.data;
}

export async function patchActivity(
  id: string,
  payload: Partial<
    Pick<
      ActivityModel,
      | "title"
      | "categoryId"
      | "defaultDurationSeconds"
      | "color"
      | "sortOrder"
      | "isPinned"
      | "isArchived"
    >
  >,
): Promise<ActivityWithCategory> {
  const res = await fetch(`/api/activities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: ActivityWithCategory;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(json.error || `Failed to update activity (${res.status}).`);
  }
  return json.data;
}

function minutesFromSeconds(seconds: number | null | undefined) {
  if (seconds == null || seconds <= 0) return "";
  return String(Math.round(seconds / 60));
}

function secondsFromMinutesInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.trunc(minutes * 60);
}

const inputClassName =
  "h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50";

function ActivityFormDialogContent({
  onClose,
  onSuccess,
  activity,
  categories,
  initialTitle,
}: {
  onClose: () => void;
  onSuccess?: (activity: ActivityWithCategory) => void;
  activity?: ActivityWithCategory | null;
  categories: CategoryModel[];
  initialTitle?: string;
}) {
  const router = useRouter();
  const isEdit = Boolean(activity);
  const categoryArchived = Boolean(activity?.category?.isArchived);

  const selectableCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories],
  );

  const defaultCategoryId = useMemo(() => {
    if (activity?.categoryId && !activity.category.isArchived) {
      return activity.categoryId;
    }
    return selectableCategories[0]?.id ?? "";
  }, [activity, selectableCategories]);

  const [title, setTitle] = useState(activity?.title ?? initialTitle ?? "");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(
    minutesFromSeconds(activity?.defaultDurationSeconds),
  );
  const [color, setColor] = useState(activity?.color ?? "");
  const [isPinned, setIsPinned] = useState(activity?.isPinned ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return setError("Title is required.");
    if (!categoryId) return setError("Category is required.");

    const defaultDurationSeconds = secondsFromMinutesInput(defaultDurationMinutes);
    if (defaultDurationMinutes.trim() && defaultDurationSeconds == null) {
      return setError("Default duration must be a non-negative number of minutes.");
    }

    const payload: ActivityFormPayload = {
      title: trimmedTitle,
      categoryId,
      defaultDurationSeconds,
      color: color.trim() ? color.trim() : null,
      isPinned,
    };

    try {
      setIsSaving(true);
      if (isEdit && activity) {
        const updated = await patchActivity(activity.id, payload);
        invalidateActivitiesCache();
        onSuccess?.(updated);
      } else {
        const created = await createActivity(payload);
        invalidateActivitiesCache();
        onSuccess?.(created);
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save activity.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-black"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {isEdit ? "Edit activity" : "New activity"}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Close
          </button>
        </div>

        {categoryArchived ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            This activity&apos;s category is archived. Choose a non-archived category to
            re-enable it in the picker.
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep work"
              className={inputClassName}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputClassName}
              disabled={isSaving || !selectableCategories.length}
            >
              {!selectableCategories.length ? (
                <option value="">No active categories</option>
              ) : null}
              {selectableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Default duration (min)
              </label>
              <input
                value={defaultDurationMinutes}
                onChange={(e) => setDefaultDurationMinutes(e.target.value)}
                placeholder="Optional"
                inputMode="numeric"
                className={inputClassName}
                disabled={isSaving}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Color (optional)
              </label>
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#2563EB"
                className={inputClassName}
                disabled={isSaving}
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              disabled={isSaving}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Pin to top of lists
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              disabled={isSaving || !selectableCategories.length}
            >
              {isSaving ? "Saving..." : isEdit ? "Save changes" : "Create activity"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Reusable create/edit dialog for activities (Settings and inline create surfaces).
export function ActivityFormDialog({
  open,
  onClose,
  onSuccess,
  activity,
  categories,
  initialTitle,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (activity: ActivityWithCategory) => void;
  activity?: ActivityWithCategory | null;
  categories: CategoryModel[];
  initialTitle?: string;
}) {
  if (!open) return null;

  const formKey = activity?.id ?? `create:${initialTitle ?? ""}`;

  return (
    <ActivityFormDialogContent
      key={formKey}
      onClose={onClose}
      onSuccess={onSuccess}
      activity={activity}
      categories={categories}
      initialTitle={initialTitle}
    />
  );
}
