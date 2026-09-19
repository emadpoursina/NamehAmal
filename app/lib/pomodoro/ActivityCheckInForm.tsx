"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { ActivityCombobox, type ActivitySelection } from "@/app/components/ActivityCombobox";
import { toActivitySelection } from "@/app/lib/use-activities";
import { ActivityFormDialog } from "@/app/settings/ActivityFormDialog";
import { fetchCategories, fetchDefaultTimeZone } from "@/app/lib/tracker-client";

export type CheckInSubmitPayload = {
  categoryId: string;
  title: string | null;
  timeZone: string;
};

const inputClassName =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50";

// Compact activity form used inside the Pomodoro phase-complete check-in.
export function ActivityCheckInForm({
  submitLabel,
  busyLabel,
  busy,
  error,
  onSubmit,
  onCancel,
  cancelLabel,
  secondary,
}: {
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (payload: CheckInSubmitPayload) => void;
  onCancel: () => void;
  cancelLabel: string;
  secondary?: React.ReactNode;
}) {
  const [categories, setCategories] = useState<CategoryModel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Yerevan");
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [activityQuery, setActivityQuery] = useState("");
  const [createActivityOpen, setCreateActivityOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCategories(), fetchDefaultTimeZone()])
      .then(([nextCategories, nextTimeZone]) => {
        if (cancelled) return;
        setCategories(nextCategories);
        setCategoryId((current) => current || nextCategories[0]?.id || "");
        setTimeZone(nextTimeZone);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load form data.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultCategoryId = useMemo(
    () => categories?.[0]?.id ?? "",
    [categories],
  );

  function applyActivitySelection(activity: ActivitySelection) {
    setTitle(activity.title);
    setCategoryId(activity.categoryId);
    setActivityQuery(activity.title);
  }

  function clearActivityPrefill() {
    setTitle("");
    setCategoryId(defaultCategoryId);
    setActivityQuery("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    onSubmit({
      categoryId,
      title: title.trim() ? title.trim() : null,
      timeZone,
    });
  }

  const displayedError = error ?? loadError;
  const noCategories = categories !== null && categories.length === 0;

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Activity
        </label>
        <ActivityCombobox
          value={activityQuery}
          onValueChange={(next) => {
            setActivityQuery(next);
            if (!next.trim()) clearActivityPrefill();
          }}
          onSelect={applyActivitySelection}
          onClear={clearActivityPrefill}
          onCreateNew={() => setCreateActivityOpen(true)}
          placeholder="Search activities to pre-fill…"
          disabled={busy}
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
          disabled={busy || categories === null}
        >
          {categories === null ? <option value="">Loading…</option> : null}
          {noCategories ? <option value="">No active categories</option> : null}
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Optional"
          className={inputClassName}
          disabled={busy}
        />
      </div>

      {noCategories ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Create a category in Settings before recording an activity.
        </p>
      ) : null}

      {displayedError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {displayedError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy || !categoryId}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? busyLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
        >
          {cancelLabel}
        </button>
        {secondary}
      </div>

      <ActivityFormDialog
        open={createActivityOpen}
        onClose={() => setCreateActivityOpen(false)}
        categories={categories ?? []}
        initialTitle={activityQuery.trim() || undefined}
        onSuccess={(activity) => applyActivitySelection(toActivitySelection(activity))}
      />
    </form>
  );
}
