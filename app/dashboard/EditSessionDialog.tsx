"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";
import {
  format24hHmInTimeZone,
  formatYmdInTimeZone,
  ymdAndHmToUtcIsoInTimeZone,
} from "@/app/lib/timezone";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Build default date and start/end wall times in the session timezone for the form.
function buildEditFormTimes(session: SessionWithCategory) {
  const tz = session.timeZone || "Asia/Yerevan";
  if (session.startedAt && session.endedAt) {
    return {
      dateYmd: formatYmdInTimeZone(session.startedAt, tz),
      startTime: format24hHmInTimeZone(session.startedAt, tz),
      endTime: format24hHmInTimeZone(session.endedAt, tz),
    };
  }
  const dateYmd = formatYmdInTimeZone(session.occurredAt, tz);
  const startTime = format24hHmInTimeZone(session.occurredAt, tz);
  const endMs = new Date(session.occurredAt).getTime() + session.durationSeconds * 1000;
  const endTime = format24hHmInTimeZone(new Date(endMs), tz);
  return { dateYmd, startTime, endTime };
}

// Update a session by id using start/end instants (server derives duration and occurredAt).
async function updateSession(
  id: string,
  payload: {
    title: string | null;
    categoryId: string;
    startedAt: string;
    endedAt: string;
    timeZone: string;
  },
) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Failed to update session (${res.status}).`);
  }
}

// Render the edit session dialog.
export function EditSessionDialog({
  session,
  categories,
  onClose,
}: {
  session: SessionWithCategory;
  categories: CategoryModel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const defaultCategoryId = useMemo(
    () => session.categoryId || categories[0]?.id || "",
    [categories, session.categoryId],
  );

  const initialTimes = useMemo(() => buildEditFormTimes(session), [session]);

  const [title, setTitle] = useState(session.title ?? "");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [timeZone, setTimeZone] = useState(session.timeZone || "Asia/Yerevan");
  const [dateYmd, setDateYmd] = useState(initialTimes.dateYmd);
  const [startTime, setStartTime] = useState(initialTimes.startTime);
  const [endTime, setEndTime] = useState(initialTimes.endTime);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categoryId) return setError("Category is required.");
    if (!dateYmd) return setError("Date is required.");
    if (!timeZone.trim()) return setError("Timezone is required.");
    if (!startTime.trim() || !endTime.trim()) {
      return setError("Start and end time are required.");
    }

    const tz = timeZone.trim();
    const startIso = ymdAndHmToUtcIsoInTimeZone(dateYmd, startTime.trim(), tz);
    let endIso = ymdAndHmToUtcIsoInTimeZone(dateYmd, endTime.trim(), tz);
    if (!startIso || !endIso) return setError("Invalid date, time, or timezone.");

    let endMs = new Date(endIso).getTime();
    const startMs = new Date(startIso).getTime();
    if (endMs <= startMs) {
      endMs += 24 * 60 * 60 * 1000;
    }
    const endedAtIso = new Date(endMs).toISOString();

    try {
      setIsSaving(true);
      await updateSession(session.id, {
        title: title.trim() ? title.trim() : null,
        categoryId,
        startedAt: startIso,
        endedAt: endedAtIso,
        timeZone: tz,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session.");
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
            Edit session
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-3">
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
              Date
            </label>
            <input
              type="date"
              value={dateYmd}
              onChange={(e) => setDateYmd(e.target.value)}
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
            If end is earlier than start on the clock, the end is treated as the next day.
          </p>

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
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
