"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { ActivityCombobox, type ActivitySelection } from "@/app/components/ActivityCombobox";
import { ymdAndHmToUtcIsoInTimeZone } from "@/app/lib/timezone";
import { toActivitySelection } from "@/app/lib/use-activities";
import { ActivityFormDialog } from "@/app/settings/ActivityFormDialog";

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "09:25";

// Add seconds to an HH:MM wall time, wrapping within the 24h clock.
function addSecondsToHm(hm: string, seconds: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!match) return hm;

  let totalMinutes =
    Number.parseInt(match[1], 10) * 60 +
    Number.parseInt(match[2], 10) +
    Math.round(seconds / 60);
  totalMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type SettingsResponse =
  | { ok: true; data: { id: string; timeZone: string } }
  | { ok: false; error: string };

// Fetch the app's default timezone setting.
async function fetchDefaultTimeZone(): Promise<string> {
  const res = await fetch("/api/settings", { cache: "no-store" });
  const json = (await res.json()) as SettingsResponse;
  if (!res.ok || !json.ok) {
    throw new Error(!json.ok ? json.error : `Failed to load settings (${res.status}).`);
  }
  return json.data.timeZone || "Asia/Yerevan";
}

// Create a manual session from local start/end times (POST includes ISO `startedAt` / `endedAt`).
async function createManualSession(payload: {
  title: string | null;
  categoryId: string;
  startedAt: string;
  endedAt: string;
  timeZone: string;
}) {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "MANUAL", ...payload }),
  });

  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to create session (${res.status}).`);
  }
}

// Render the manual session creation form.
export function AddSessionForm({
  categories,
  activeDate,
}: {
  categories: CategoryModel[];
  activeDate: string;
}) {
  const router = useRouter();
  const defaultCategoryId = useMemo(() => categories[0]?.id ?? "", [categories]);

  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [activityQuery, setActivityQuery] = useState("");
  const [createActivityOpen, setCreateActivityOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME);
  const [timeZone, setTimeZone] = useState("Asia/Yerevan");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDefaultTimeZone()
      .then((tz) => {
        if (!cancelled) setTimeZone(tz);
      })
      .catch(() => {
        // Keep fallback timezone.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyActivitySelection(activity: ActivitySelection) {
    setTitle(activity.title);
    setCategoryId(activity.categoryId);
    setActivityQuery(activity.title);
    if (
      typeof activity.defaultDurationSeconds === "number" &&
      activity.defaultDurationSeconds > 0
    ) {
      setEndTime(addSecondsToHm(startTime, activity.defaultDurationSeconds));
    }
  }

  function clearActivityPrefill() {
    setTitle("");
    setCategoryId(defaultCategoryId);
    setActivityQuery("");
    setStartTime(DEFAULT_START_TIME);
    setEndTime(DEFAULT_END_TIME);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categoryId) return setError("Category is required.");
    if (!timeZone.trim()) return setError("Timezone is required.");
    if (!startTime.trim() || !endTime.trim()) {
      return setError("Start and end time are required.");
    }

    const tz = timeZone.trim();
    const startIso = ymdAndHmToUtcIsoInTimeZone(activeDate, startTime.trim(), tz);
    const endIso = ymdAndHmToUtcIsoInTimeZone(activeDate, endTime.trim(), tz);
    if (!startIso || !endIso) return setError("Invalid date, time, or timezone.");

    let endMs = new Date(endIso).getTime();
    const startMs = new Date(startIso).getTime();
    if (endMs <= startMs) {
      endMs += 24 * 60 * 60 * 1000;
    }
    const endedAtIso = new Date(endMs).toISOString();

    try {
      setIsSaving(true);
      await createManualSession({
        title: title.trim() ? title.trim() : null,
        categoryId,
        startedAt: startIso,
        endedAt: endedAtIso,
        timeZone: tz,
      });
      setTitle("");
      setActivityQuery("");
      setStartTime(DEFAULT_START_TIME);
      setEndTime(DEFAULT_END_TIME);
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        disabled={!categories.length}
      >
        Add session
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Add session
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Cancel
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
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
            disabled={isSaving}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Optional"
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Timezone
          </label>
          <input
            value={timeZone}
            onChange={(e) => setTimeZone(e.target.value)}
            placeholder='e.g. "Asia/Yerevan"'
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Start
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              End
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
            />
          </div>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Times are on the date shown below, in the selected timezone. If end is
          earlier than start, the end is treated as the next day.
        </p>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            disabled={isSaving || !categories.length}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Date: {activeDate}
          </div>
        </div>
      </div>

      <ActivityFormDialog
        open={createActivityOpen}
        onClose={() => setCreateActivityOpen(false)}
        categories={categories}
        initialTitle={activityQuery.trim() || undefined}
        onSuccess={(activity) => applyActivitySelection(toActivitySelection(activity))}
      />
    </form>
  );
}

