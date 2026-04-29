"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { patchCategory } from "./CategoryManager";

// Sort categories like the main list (sortOrder, then name).
function sortActiveCategories(cats: CategoryModel[]) {
  return [...cats].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

// Build input values from server category rows (hours as string, empty = no target).
function hoursMapFromCategories(cats: CategoryModel[]) {
  const next: Record<string, string> = {};
  for (const c of sortActiveCategories(cats)) {
    next[c.id] =
      typeof c.weeklyTargetHours === "number" && Number.isFinite(c.weeklyTargetHours)
        ? String(c.weeklyTargetHours)
        : "";
  }
  return next;
}

// Settings card: edit planned hours per week (Monday–Sunday) for each active category.
export function WeeklyTargetsCard({ active }: { active: CategoryModel[] }) {
  const router = useRouter();
  const sorted = useMemo(() => sortActiveCategories(active), [active]);

  const [hoursById, setHoursById] = useState<Record<string, string>>(() =>
    hoursMapFromCategories(active),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      for (const c of sorted) {
        const raw = (hoursById[c.id] ?? "").trim();
        let weeklyTargetHours: number | null = null;
        if (raw !== "") {
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) {
            throw new Error(`Invalid hours for “${c.name}”. Use a number ≥ 0 or leave empty.`);
          }
          weeklyTargetHours = n;
        }
        await patchCategory(c.id, { weeklyTargetHours });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save targets.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Weekly targets</div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Planned hours per category for each calendar week (Monday 00:00 through Sunday end of day,
        local time). Leave empty for no target.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No active categories yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="min-w-0 shrink text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {c.name}
                </span>
                <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="sr-only">Hours per week for {c.name}</span>
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    inputMode="decimal"
                    value={hoursById[c.id] ?? ""}
                    onChange={(ev) =>
                      setHoursById((prev) => ({ ...prev, [c.id]: ev.target.value }))
                    }
                    disabled={isSaving}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 font-mono text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 sm:max-w-[10rem] dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
                    placeholder="—"
                  />
                  <span className="shrink-0 text-xs">h / week</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {sorted.length > 0 ? (
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-10 max-w-xs items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isSaving ? "Saving…" : "Save targets"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
