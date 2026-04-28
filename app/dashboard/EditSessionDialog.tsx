"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel, SessionModel } from "@/app/generated/prisma/models";

type SessionWithCategory = SessionModel & { category: CategoryModel };

// Convert YYYY-MM-DD to a local Date at noon.
function ymdToLocalNoon(ymd: string) {
  const [yRaw, mRaw, dRaw] = ymd.split("-");
  const y = Number.parseInt(yRaw ?? "", 10);
  const m = Number.parseInt(mRaw ?? "", 10);
  const d = Number.parseInt(dRaw ?? "", 10);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// Format a Date as YYYY-MM-DD in local time.
function formatYmdLocal(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Update a session by id.
async function updateSession(
  id: string,
  payload: {
    title: string | null;
    categoryId: string;
    occurredAt: string;
    durationSeconds: number;
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

  const [title, setTitle] = useState(session.title ?? "");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [dateYmd, setDateYmd] = useState(formatYmdLocal(new Date(session.occurredAt)));
  const [durationMinutes, setDurationMinutes] = useState(
    Math.max(1, Math.round(session.durationSeconds / 60)),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const minutes = Number.isFinite(durationMinutes)
      ? Math.trunc(durationMinutes)
      : 0;
    if (!categoryId) return setError("Category is required.");
    if (!minutes || minutes <= 0) return setError("Duration must be > 0 minutes.");
    if (!dateYmd) return setError("Date is required.");

    try {
      setIsSaving(true);
      await updateSession(session.id, {
        title: title.trim() ? title.trim() : null,
        categoryId,
        occurredAt: ymdToLocalNoon(dateYmd).toISOString(),
        durationSeconds: minutes * 60,
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
              {isSaving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

