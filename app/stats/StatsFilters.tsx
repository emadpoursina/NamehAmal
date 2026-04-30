"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import {
  buildWeekPresetOptionsInTimeZone,
  matchingWeekPresetValue,
} from "@/app/lib/local-week";

// Compare YYYY-MM-DD strings (lexicographic order matches chronological order).
function compareYmd(a: string, b: string) {
  return a.localeCompare(b);
}

// Update URL search params for stats filters.
function useStatsFilterNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo(() => {
    return (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
    };
  }, [pathname, router, searchParams]);
}

// Render week preset, date range, and category filters.
export function StatsFilters({
  categories,
  activeFrom,
  activeTo,
  activeCategoryId,
  timeZone,
}: {
  categories: CategoryModel[];
  activeFrom: string;
  activeTo: string;
  activeCategoryId: string | null;
  timeZone: string;
}) {
  const navigate = useStatsFilterNavigation();
  const weekPresets = useMemo(() => buildWeekPresetOptionsInTimeZone(timeZone, 12), [timeZone]);
  const weekSelectValue = useMemo(
    () => matchingWeekPresetValue(activeFrom, activeTo, weekPresets),
    [activeFrom, activeTo, weekPresets],
  );
  const categoriesForPicker = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Week
        </label>
        <select
          value={weekSelectValue || "custom"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "custom") return;
            const preset = weekPresets.find((p) => p.value === v);
            if (!preset) return;
            navigate({ from: preset.mondayYmd, to: preset.sundayYmd });
          }}
          className="h-10 w-full max-w-md rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
        >
          <option value="custom">Custom range (use dates below)</option>
          {weekPresets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label} ({p.mondayYmd} – {p.sundayYmd})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          From
        </label>
        <input
          type="date"
          value={activeFrom}
          onChange={(e) => {
            const nextFrom = e.target.value || "";
            if (!nextFrom) return navigate({ from: null });
            const nextTo = compareYmd(activeTo, nextFrom) < 0 ? nextFrom : activeTo;
            navigate({ from: nextFrom, to: nextTo });
          }}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          To
        </label>
        <input
          type="date"
          value={activeTo}
          onChange={(e) => {
            const nextTo = e.target.value || "";
            if (!nextTo) return navigate({ to: null });
            const nextFrom = compareYmd(nextTo, activeFrom) < 0 ? nextTo : activeFrom;
            navigate({ from: nextFrom, to: nextTo });
          }}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Category
        </label>
        <select
          value={activeCategoryId ?? ""}
          onChange={(e) => navigate({ categoryId: e.target.value || null })}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50"
        >
          <option value="">All categories</option>
          {categoriesForPicker.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      </div>
    </div>
  );
}

