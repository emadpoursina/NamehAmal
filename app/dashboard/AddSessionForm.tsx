"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { ymdToUtcNoonIsoInTimeZone } from "@/app/lib/timezone";

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

// Create a manual session by POSTing to the sessions API.
async function createManualSession(payload: {
  title: string | null;
  categoryId: string;
  occurredAt: string;
  durationSeconds: number;
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
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [durationMinutes, setDurationMinutes] = useState(25);
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const minutes = Number.isFinite(durationMinutes)
      ? Math.trunc(durationMinutes)
      : 0;
    if (!categoryId) return setError("Category is required.");
    if (!minutes || minutes <= 0) return setError("Duration must be > 0 minutes.");
    if (!timeZone.trim()) return setError("Timezone is required.");

    const occurredAt = ymdToUtcNoonIsoInTimeZone(activeDate, timeZone.trim());
    if (!occurredAt) return setError("Invalid date or timezone.");

    try {
      setIsSaving(true);
      await createManualSession({
        title: title.trim() ? title.trim() : null,
        categoryId,
        occurredAt,
        durationSeconds: minutes * 60,
        timeZone: timeZone.trim(),
      });
      setTitle("");
      setDurationMinutes(25);
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Duration (minutes)
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
          />
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
            {isSaving ? "Saving..." : "Save"}
          </button>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Date: {activeDate}
          </div>
        </div>
      </div>
    </form>
  );
}

