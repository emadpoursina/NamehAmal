"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";
import { addCalendarDaysToYmdInTimeZone } from "@/app/lib/timezone";

// Update URL search params for dashboard filters.
function useDashboardFilterNavigation() {
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

// Render the date + category filters row.
export function DashboardFilters({
  categories,
  activeDate,
  activeCategoryId,
  defaultTimeZone,
}: {
  categories: CategoryModel[];
  activeDate: string;
  activeCategoryId: string | null;
  defaultTimeZone: string;
}) {
  const navigate = useDashboardFilterNavigation();

  const prevYmd = addCalendarDaysToYmdInTimeZone(activeDate, -1, defaultTimeZone);
  const nextYmd = addCalendarDaysToYmdInTimeZone(activeDate, 1, defaultTimeZone);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Date
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!prevYmd}
            onClick={() => prevYmd && navigate({ date: prevYmd })}
            aria-label="Previous day"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
          >
            ←
          </button>
          <input
            type="date"
            value={activeDate}
            onChange={(e) => navigate({ date: e.target.value || null })}
            className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50 sm:min-w-[10.5rem]"
          />
          <button
            type="button"
            disabled={!nextYmd}
            onClick={() => nextYmd && navigate({ date: nextYmd })}
            aria-label="Next day"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-zinc-200 dark:hover:bg-zinc-950"
          >
            →
          </button>
        </div>
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
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

