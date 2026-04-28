"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CategoryModel } from "@/app/generated/prisma/models";

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

// Render the date range + category filters row.
export function StatsFilters({
  categories,
  activeFrom,
  activeTo,
  activeCategoryId,
}: {
  categories: CategoryModel[];
  activeFrom: string;
  activeTo: string;
  activeCategoryId: string | null;
}) {
  const navigate = useStatsFilterNavigation();

  return (
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

